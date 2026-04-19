import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'
import path from 'path'
import { PassThrough } from 'stream'

async function ensureAlpineImage(docker) {
    try {
        await docker.getImage('alpine:latest').inspect()
    } catch (e) {
        // Image not found, pull it
        if (docker._isDocklabServerProxy) {
            // For docklab-server proxy, use direct pull API
            try {
                const res = await docker.pull('alpine:latest')
            } catch (pullErr) { /* ignore if already exists */ }
        } else {
            // Native Docker: callback-style pull
            await new Promise((resolve, reject) => {
                docker.pull('alpine:latest', (err, stream) => {
                    if (err) return reject(err)
                    docker.modem.followProgress(stream, onFinished)
                    function onFinished(err, output) {
                        if (err) return reject(err)
                        resolve(output)
                    }
                })
            })
        }
    }
}

export async function GET(req, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await params
    const searchParams = req.nextUrl.searchParams
    const targetPath = searchParams.get('path') || '/'

    // Prevent directory traversal
    const safePath = path.posix.join('/', targetPath)

    try {
        // Run alpine container to ls the directory or cat the file
        // We output JSON from stat
        const script = `
        TARGET="/vol$TARGET_PATH"
        if ! cd "$TARGET" 2>/dev/null; then
            if [ -f "$TARGET" ]; then
                # Ensure we strictly read the file if it's a file
                cat "$TARGET"
                exit 0
            else
                echo '{"error": "Path not found or access denied"}' >&2
                exit 1
            fi
        fi
        
        echo "["
        first=1
        for f in * .*; do
            if [ "$f" = "." ] || [ "$f" = ".." ] || [ "$f" = "*" ] || [ "$f" = ".*" ]; then continue; fi
            if [ -e "$f" ] || [ -L "$f" ]; then
                if [ $first -eq 0 ]; then echo ","; fi
                first=0
                size=$(stat -c %s "$f")
                type=$(stat -c %F "$f")
                mode=$(stat -c %a "$f")
                mtime=$(stat -c %Y "$f")
                
                type_str="file"
                if [ "$type" = "directory" ]; then type_str="dir"; fi
                
                # output json line
                # escaping quotes in filename
                safe_f=$(echo "$f" | sed 's/"/\\"/g')
                printf '{"name": "%s", "type": "%s", "size": %s, "permissions": "%s", "modified": %s}' "$safe_f" "$type_str" "$size" "$mode" "$mtime"
            fi
        done
        echo "]"
        `

        const docker = await getDockerClient()
        await ensureAlpineImage(docker)

        // Use dockerode instead of cli
        const options = {
            Image: 'alpine:latest',
            Cmd: ['sh', '-c', script],
            Env: [`TARGET_PATH=${safePath}`],
            HostConfig: {
                Binds: [`${name}:/vol:ro`],
                AutoRemove: true
            },
            Tty: true
        }

        // We capture stdout through a pass-through stream to string memory
        const outputStream = new PassThrough()
        let output = ''
        outputStream.on('data', chunk => { output += chunk.toString() })

        await docker.run(options.Image, options.Cmd, outputStream, options)

        if (output.trim().startsWith('[')) {
            let parsed = []
            try { parsed = JSON.parse(output) } catch (e) { }
            return Response.json({ type: 'dir', content: parsed })
        } else if (output.trim().startsWith('{"error"')) {
            try {
                const parsed = JSON.parse(output.trim())
                return Response.json({ error: parsed.error }, { status: 400 })
            } catch (e) {
                return Response.json({ error: output.trim() }, { status: 400 })
            }
        } else {
            return Response.json({ type: 'file', content: output })
        }
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}

export async function POST(req, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await params
    const { path: targetPath, content } = await req.json()
    const safePath = path.posix.join('/', targetPath)

    try {
        const docker = await getDockerClient()
        await ensureAlpineImage(docker)

        const encodedContent = Buffer.from(content || '').toString('base64')
        const script = `echo "$ENCODED_CONTENT" | base64 -d > "/vol$TARGET_PATH"`

        const options = {
            Image: 'alpine:latest',
            Cmd: ['sh', '-c', script],
            Env: [`TARGET_PATH=${safePath}`, `ENCODED_CONTENT=${encodedContent}`],
            HostConfig: { Binds: [`${name}:/vol`], AutoRemove: true },
            Tty: true
        }

        await docker.run(options.Image, options.Cmd, new PassThrough(), options)

        return Response.json({ success: true })
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}

export async function DELETE(req, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await params
    const { path: targetPath } = await req.json()
    const safePath = path.posix.join('/', targetPath)

    if (safePath === '/') return Response.json({ error: 'Cannot delete root' }, { status: 400 })

    try {
        const docker = await getDockerClient()
        await ensureAlpineImage(docker)

        const script = `rm -rf "/vol$TARGET_PATH"`

        const options = {
            Image: 'alpine:latest',
            Cmd: ['sh', '-c', script],
            Env: [`TARGET_PATH=${safePath}`],
            HostConfig: { Binds: [`${name}:/vol`], AutoRemove: true },
            Tty: true
        }

        await docker.run(options.Image, options.Cmd, new PassThrough(), options)

        return Response.json({ success: true })
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}
