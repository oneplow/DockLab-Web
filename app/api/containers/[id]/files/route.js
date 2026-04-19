import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'
import { logAudit } from '@/lib/audit'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id } = await params
        if (!id) {
            return Response.json({ error: 'Container ID is required' }, { status: 400 })
        }

        const url = new URL(request.url)
        const path = url.searchParams.get('path') || '/'
        const action = url.searchParams.get('action') || 'list' // 'list' or 'read'

        const docker = await getDockerClient()
        const container = docker.getContainer(id)

        // Ensure container is running before trying to exec
        const info = await container.inspect()
        if (!info.State.Running) {
            return Response.json({ error: 'Container must be running to view files' }, { status: 400 })
        }

        const isDocklabServerProxy = !!docker._isDocklabServerProxy

        if (action === 'read') {
            // Use Docker getArchive API — returns a tar stream of the file
            try {
                const tarStream = await container.getArchive({ path })

                // Parse tar to extract file content
                const chunks = []
                for await (const chunk of tarStream) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                }
                const tarBuf = Buffer.concat(chunks)

                // Tar format: 512-byte header, then file content
                if (tarBuf.length < 512) {
                    return Response.json({ content: '' })
                }
                const sizeStr = tarBuf.slice(124, 136).toString('utf8').replace(/\0/g, '').trim()
                const fileSize = parseInt(sizeStr, 8) || 0
                const content = tarBuf.slice(512, 512 + fileSize).toString('utf8')

                return Response.json({ content })
            } catch (err) {
                // Fallback to exec cat if getArchive fails
                const exec = await container.exec({
                    Cmd: ['cat', path],
                    AttachStdout: true,
                    AttachStderr: true,
                })

                const stream = await exec.start({ hijack: true, stdin: false })

                if (isDocklabServerProxy) {
                    // Docklab-server proxy returns a PassThrough with plain text
                    let output = ''
                    for await (const chunk of stream) {
                        output += chunk.toString('utf8')
                    }
                    return Response.json({ content: output })
                }

                return new Promise((resolve) => {
                    let output = ''
                    docker.modem.demuxStream(stream, {
                        write: (data) => { output += data.toString('utf8') }
                    }, {
                        write: (data) => { output += data.toString('utf8') }
                    })

                    stream.on('end', () => {
                        resolve(Response.json({ content: output }))
                    })
                    stream.on('error', (err) => {
                        resolve(Response.json({ error: err.message }, { status: 500 }))
                    })
                })
            }
        }

        // action === 'list'
        const exec = await container.exec({
            Cmd: ['ls', '-la', '--time-style=long-iso', path],
            AttachStdout: true,
            AttachStderr: true,
        })

        const stream = await exec.start({ hijack: true, stdin: false })

        if (isDocklabServerProxy) {
            // Docklab-server proxy returns a PassThrough with plain text (already parsed ls output)
            let output = ''
            for await (const chunk of stream) {
                output += chunk.toString('utf8')
            }

            if (output.includes('No such file or directory') || output.includes('Not a directory')) {
                return Response.json({ error: output.trim() }, { status: 400 })
            }

            const lines = output.split('\n').filter(Boolean)
            const files = []

            for (const line of lines) {
                if (line.startsWith('total ')) continue
                const parts = line.trim().split(/\s+/)

                if (parts.length >= 8) {
                    const permissions = parts[0]
                    const isDir = permissions.startsWith('d')
                    const isSymlink = permissions.startsWith('l')

                    let nameInfo = parts.slice(7).join(' ')
                    let symlinkTarget = null

                    if (isSymlink && nameInfo.includes(' -> ')) {
                        const symParts = nameInfo.split(' -> ')
                        nameInfo = symParts[0]
                        symlinkTarget = symParts[1]
                    }

                    if (nameInfo === '.') continue
                    if (nameInfo === '..' && path === '/') continue

                    files.push({
                        name: nameInfo,
                        isDirectory: isDir,
                        isSymlink,
                        symlinkTarget,
                        size: parseInt(parts[4]) || 0,
                        owner: parts[2],
                        group: parts[3],
                        permissions,
                        modified: `${parts[5]} ${parts[6]}`,
                    })
                }
            }

            files.sort((a, b) => {
                if (a.name === '..') return -1
                if (b.name === '..') return 1
                if (a.isDirectory && !b.isDirectory) return -1
                if (!a.isDirectory && b.isDirectory) return 1
                return a.name.localeCompare(b.name)
            })

            return Response.json({ files, path })
        }

        // Native Docker: use modem.demuxStream
        return new Promise((resolve, reject) => {
            let output = ''
            docker.modem.demuxStream(stream, {
                write: (data) => { output += data.toString('utf8') }
            }, {
                write: (data) => { output += data.toString('utf8') }
            })

            stream.on('end', () => {
                if (output.includes('No such file or directory') || output.includes('Not a directory')) {
                    resolve(Response.json({ error: output.trim() }, { status: 400 }))
                    return
                }

                const lines = output.split('\n').filter(Boolean)
                const files = []

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('total ')) continue
                    const parts = lines[i].trim().split(/\s+/)

                    if (parts.length >= 8) {
                        const permissions = parts[0]
                        const isDir = permissions.startsWith('d')
                        const isSymlink = permissions.startsWith('l')

                        let nameInfo = parts.slice(7).join(' ')
                        let symlinkTarget = null

                        if (isSymlink && nameInfo.includes(' -> ')) {
                            const symParts = nameInfo.split(' -> ')
                            nameInfo = symParts[0]
                            symlinkTarget = symParts[1]
                        }

                        if (nameInfo === '.') continue
                        if (nameInfo === '..' && path === '/') continue

                        files.push({
                            name: nameInfo,
                            isDirectory: isDir,
                            isSymlink,
                            symlinkTarget,
                            size: parseInt(parts[4]) || 0,
                            owner: parts[2],
                            group: parts[3],
                            permissions,
                            modified: `${parts[5]} ${parts[6]}`,
                        })
                    }
                }

                files.sort((a, b) => {
                    if (a.name === '..') return -1
                    if (b.name === '..') return 1
                    if (a.isDirectory && !b.isDirectory) return -1
                    if (!a.isDirectory && b.isDirectory) return 1
                    return a.name.localeCompare(b.name)
                })

                resolve(Response.json({ files, path }))
            })

            stream.on('error', (err) => {
                reject(Response.json({ error: err.message }, { status: 500 }))
            })
        })

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function PUT(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params
        if (!id) {
            return Response.json({ error: 'Container ID is required' }, { status: 400 })
        }

        const { path: filePath, content } = await request.json()
        if (!filePath) {
            return Response.json({ error: 'File path is required' }, { status: 400 })
        }

        const docker = await getDockerClient()
        const container = docker.getContainer(id)

        const info = await container.inspect()
        if (!info.State.Running) {
            return Response.json({ error: 'Container must be running to edit files' }, { status: 400 })
        }

        // Use Docker putArchive API — reliable file writing via tar
        const { Readable } = await import('stream')
        const pathMod = await import('path')

        const fileName = pathMod.posix.basename(filePath)
        const dirPath = pathMod.posix.dirname(filePath)
        const fileContent = Buffer.from(content || '', 'utf8')

        // Build a minimal tar archive in memory
        const headerBuf = Buffer.alloc(512, 0)

        // File name (max 100 bytes)
        headerBuf.write(fileName, 0, Math.min(fileName.length, 100), 'utf8')
        // File mode: 0644
        headerBuf.write('0000644\0', 100, 8, 'utf8')
        // Owner/group uid/gid: 0
        headerBuf.write('0000000\0', 108, 8, 'utf8')
        headerBuf.write('0000000\0', 116, 8, 'utf8')
        // File size in octal
        const sizeOctal = fileContent.length.toString(8).padStart(11, '0') + '\0'
        headerBuf.write(sizeOctal, 124, 12, 'utf8')
        // Modification time
        const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0'
        headerBuf.write(mtime, 136, 12, 'utf8')
        // Type flag: '0' = regular file
        headerBuf.write('0', 156, 1, 'utf8')
        // Checksum placeholder (spaces)
        headerBuf.write('        ', 148, 8, 'utf8')

        // Calculate checksum
        let checksum = 0
        for (let i = 0; i < 512; i++) checksum += headerBuf[i]
        const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 '
        headerBuf.write(checksumStr, 148, 8, 'utf8')

        // Padding to 512-byte boundary
        const paddingSize = (512 - (fileContent.length % 512)) % 512
        const paddingBuf = Buffer.alloc(paddingSize, 0)
        // End-of-archive marker
        const endBuf = Buffer.alloc(1024, 0)

        const tarBuf = Buffer.concat([headerBuf, fileContent, paddingBuf, endBuf])
        const tarStream = Readable.from(tarBuf)

        await container.putArchive(tarStream, { path: dirPath })

        await logAudit(session, 'container.file.write', id, `Path: ${filePath}`)
        return Response.json({ success: true })

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
