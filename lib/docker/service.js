import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

const statsCache = new Map()
const hostCache = new Map()

/**
 * Get Docker client — returns either a dockerode instance (TCP/socket)
 * or a docklab-server proxy object (docklab-server agent connections)
 */
export async function getDockerClient() {
    const Docker = (await import('dockerode')).default

    // Determine target host from cookie
    let activeHost = null
    try {
        const cookieStore = await cookies()
        const hostId = cookieStore.get('docklab_host_id')?.value
        if (hostId) {
            const now = Date.now()
            const cached = hostCache.get(hostId)
            if (cached && now - cached.time < 10000) {
                activeHost = cached.host
            } else {
                activeHost = await prisma.dockerHost.findUnique({ where: { id: hostId } })
                if (activeHost) {
                    hostCache.set(hostId, { host: activeHost, time: now })
                }
            }
        }

        // Fallback to the first available host if no active cookie
        if (!activeHost) {
            activeHost = await prisma.dockerHost.findFirst()
        }
    } catch (e) {
        console.warn('Could not read host cookie or db context', e.message)
    }

    // If docklab-server connection type, return a docklab-server proxy client
    return getDockerClientForHost(activeHost)
}

/**
 * Get a Docker client for a specific host object (bypassing cookies)
 */
export async function getDockerClientForHost(activeHost) {
    if (!activeHost) {
        throw new Error('No Docker host provided.')
    }

    if (activeHost.connectionType === 'docklab-server') {
        return createDocklabServerProxy(activeHost.socketPath, decrypt(activeHost.apiKey))
    }

    const Docker = (await import('dockerode')).default
    let dockerOptions = {}
    const socketPath = activeHost.socketPath
    if (socketPath.startsWith('http') || socketPath.startsWith('tcp')) {
        const url = new URL(socketPath.replace('tcp://', 'http://'))
        dockerOptions = { host: url.hostname, port: url.port || 2375 }
    } else {
        dockerOptions = { socketPath }
    }

    return new Docker(dockerOptions)
}

/**
 * Create a proxy object that mimics dockerode's interface
 * but routes all calls through the docklab-server REST API.
 *
 * This allows all existing service.js functions to work unchanged
 * regardless of whether the connection is direct or through docklab-server.
 */
function createDocklabServerProxy(baseUrl, apiKey) {
    const base = baseUrl.replace(/\/+$/, '')
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    }

    async function docklabServerFetch(path, options = {}) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000)

        try {
            // Merge caller's signal if exists, though simple fetch usually doesn't provide one here
            const res = await fetch(`${base}${path}`, {
                ...options,
                headers: { ...headers, ...options.headers },
                signal: options.signal || controller.signal
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
                throw new Error(err.error || err.message || `docklab-server error: ${res.status}`)
            }
            return res
        } finally {
            clearTimeout(timeoutId)
        }
    }

    async function docklabServerJson(path, options = {}) {
        const res = await docklabServerFetch(path, options)
        return res.json()
    }

    // Create modem-like object for compatibility
    const modem = {
        async followProgress(stream, onFinished, onProgress) {
            if (!stream) return onFinished(new Error('No stream available'))

            if (typeof stream.then === 'function') {
                return stream.then(data => onFinished(null, data)).catch(err => onFinished(err))
            }

            try {
                if (stream.getReader) {
                    const reader = stream.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''

                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) break

                        buffer += decoder.decode(value, { stream: true })
                        const chunks = buffer.split('\n\n')
                        buffer = chunks.pop()

                        for (const chunk of chunks) {
                            const trimmed = chunk.trim()
                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const parsed = JSON.parse(trimmed.slice(6))
                                    if (parsed.error) throw new Error(parsed.error)
                                    if (parsed.status === 'complete') {
                                        return onFinished(null, parsed)
                                    }
                                    if (onProgress) onProgress(parsed)
                                } catch (e) {
                                    if (e.message !== 'Unexpected end of JSON input') throw e
                                }
                            }
                        }
                    }
                }

                onFinished(null, { status: 'complete' })
            } catch (err) {
                onFinished(err)
            }
        },
        demuxStream(stream, stdout, stderr) {
            // For docklab-server, this is handled by the routes directly
        }
    }

    return {
        modem,
        _isDocklabServerProxy: true,

        // System
        async info() {
            const data = await docklabServerJson('/api/system/info')
            // Map to Docker info format
            return {
                Containers: data.containers?.total || 0,
                ContainersRunning: data.containers?.running || 0,
                ContainersStopped: data.containers?.stopped || 0,
                ContainersPaused: data.containers?.paused || 0,
                MemTotal: data.memory?.total || 0,
                NCPU: data.ncpu || 1,
                ServerVersion: data.serverVersion || '',
                OperatingSystem: data.operatingSystem || '',
                Architecture: data.architecture || '',
                _docklabServerPolicies: data.policies,
                _docklabServerMemUsed: data.memory?.used || 0,
                _docklabServerCpuUsed: data.cpu?.usedPercent || 0,
                _docklabServerStorage: data.storage || { total: 0, used: 0, usedPercent: 0 },
            }
        },

        async version() {
            const data = await docklabServerJson('/api/ping')
            return {
                Version: data.docker?.version || '',
                ApiVersion: data.docker?.apiVersion || '',
                Os: data.docker?.os || '',
                Arch: data.docker?.arch || '',
            }
        },

        async listImages() {
            const images = await docklabServerJson('/api/images')
            // Map to Docker API format
            return images.map(img => ({
                Id: `sha256:${img.id}`,
                RepoTags: img.repoTags,
                Size: img.size,
                Created: img.created,
            }))
        },

        async listContainers(opts = {}) {
            const containers = await docklabServerJson('/api/containers')
            return containers.map(c => ({
                Id: c.id,
                Names: [`/${c.name}`],
                Image: c.image,
                State: c.status,
                Status: c.state,
                Ports: c.ports?.map(p => {
                    const [pub, priv] = p.split(':')
                    return { PublicPort: parseInt(pub), PrivatePort: parseInt(priv) }
                }) || [],
                Created: c.created,
                Labels: c.labels || {},
                Mounts: [],
            }))
        },

        async listNetworks() {
            const networks = await docklabServerJson('/api/networks')
            return networks.map(n => ({
                Id: n.id + '0000000000',
                Name: n.name,
                Driver: n.driver,
                Scope: n.scope,
                IPAM: { Config: n.subnet !== '—' ? [{ Subnet: n.subnet }] : [] },
                Containers: {},
            }))
        },

        async df() {
            const volumes = await docklabServerJson('/api/volumes')
            return {
                Volumes: volumes.map(v => ({
                    Name: v.name,
                    Driver: v.driver,
                    Mountpoint: v.mountpoint,
                    CreatedAt: v.created,
                    UsageData: { Size: typeof v.size === 'string' ? parseFloat(v.size) * (v.size.includes('MB') ? 1024 * 1024 : v.size.includes('KB') ? 1024 : v.size.includes('GB') ? 1024 * 1024 * 1024 : 1) : v.size || 0 }, // It's formatted on Docklab-server, we do a rough estimate or just use raw if we had it. Wait, docklab-server returns string size. Actually we can just pass the raw string and handle it later, but standard docker df returns bytes. Let's modify listVolumes to handle both.
                    Containers: v.containers || []
                }))
            }
        },

        async createVolume(opts) {
            return docklabServerJson('/api/volumes', { method: 'POST', body: JSON.stringify(opts) })
        },

        async createNetwork(opts) {
            return docklabServerJson('/api/networks', { method: 'POST', body: JSON.stringify(opts) })
        },

        getContainer(id) {
            return {
                async inspect() {
                    return docklabServerJson(`/api/containers/${id}`)
                },
                async stats(opts) {
                    return docklabServerJson(`/api/containers/${id}/stats`)
                },
                async logs(opts) {
                    const data = await docklabServerJson(`/api/containers/${id}/logs?tail=${opts?.tail || 500}`)
                    // Return as string — docklab-server already strips Docker headers
                    return (data.logs || []).join('\n')
                },
                async start() {
                    return docklabServerJson('/api/containers', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'start', containerId: id })
                    })
                },
                async stop() {
                    return docklabServerJson('/api/containers', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'stop', containerId: id })
                    })
                },
                async restart() {
                    return docklabServerJson('/api/containers', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'restart', containerId: id })
                    })
                },
                async remove(opts) {
                    return docklabServerJson('/api/containers', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'remove', containerId: id })
                    })
                },
                async commit(opts) {
                    return docklabServerJson(`/api/containers/${id}/snapshot`, {
                        method: 'POST',
                        body: JSON.stringify(opts)
                    })
                },
                async exec(opts) {
                    const cmd = opts.Cmd || []
                    const cmdStr = cmd.join(' ')

                    // Handle ls commands for file listing
                    if (cmd[0] === 'ls') {
                        const filePath = cmd[cmd.length - 1] || '/'
                        const data = await docklabServerJson(`/api/containers/${id}/files?path=${encodeURIComponent(filePath)}`)
                        return {
                            async start() {
                                const { PassThrough } = require('stream')
                                const stream = new PassThrough()
                                const lines = ['total 0']
                                for (const f of (data.files || [])) {
                                    lines.push(`${f.permissions || (f.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--')} 1 ${f.owner || 'root'} ${f.group || 'root'} ${f.size || 0} ${f.modified || '2024-01-01 00:00'} ${f.name}`)
                                }
                                // Write as stdout frame (Docker multiplex: type=1)
                                const output = lines.join('\n') + '\n'
                                stream.end(output)
                                return stream
                            }
                        }
                    }

                    // Handle cat commands for file reading
                    if (cmd[0] === 'cat') {
                        const filePath = cmd[1] || '/'
                        const data = await docklabServerJson(`/api/containers/${id}/files?path=${encodeURIComponent(filePath)}&action=read`)
                        return {
                            async start() {
                                const { PassThrough } = require('stream')
                                const stream = new PassThrough()
                                stream.end(data.content || '')
                                return stream
                            }
                        }
                    }

                    // Handle sh -c 'cat > file' for file writing
                    if (cmd[0] === 'sh' && cmdStr.includes('cat >')) {
                        const filePath = cmd[cmd.length - 1] || ''
                        return {
                            async start() {
                                const { PassThrough } = require('stream')
                                const stream = new PassThrough()
                                let content = ''
                                stream.on('data', (chunk) => { content += chunk.toString() })
                                stream.on('end', async () => {
                                    try {
                                        await docklabServerJson(`/api/containers/${id}/files`, {
                                            method: 'PUT',
                                            body: JSON.stringify({ path: filePath, content })
                                        })
                                    } catch (e) { }
                                })
                                return stream
                            }
                        }
                    }

                    // Default behavior (Terminal / unknown execs)
                    return {
                        async start() {
                            const { Duplex } = require('stream')
                            const WebSocket = require('ws')
                            const crypto = require('crypto')

                            // Connect directly to docklab-server's terminal websocket
                            const wsUrl = base.replace(/^http/, 'ws') + `/ws/terminal?id=${id}&sessionId=${crypto.randomUUID()}`
                            const ws = new WebSocket(wsUrl, {
                                headers: { 'x-api-key': apiKey }
                            })

                            const stream = new Duplex({
                                read() { },
                                write(chunk, encoding, callback) {
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(chunk)
                                    } else {
                                        // Buffer or wait? For simplistic proxy, just drop if not open yet, 
                                        // but ideally wait. Since user types slowly, it's usually open.
                                        ws.once('open', () => ws.send(chunk))
                                    }
                                    callback()
                                }
                            })

                            ws.on('message', (data) => stream.push(data))
                            ws.on('close', () => stream.push(null))
                            ws.on('error', (err) => stream.destroy(err))

                            return stream
                        }
                    }
                },
                async getArchive(opts) {
                    // Read file content via docklab-server, return as fake tar stream
                    const filePath = opts.path || '/'
                    const data = await docklabServerJson(`/api/containers/${id}/files?path=${encodeURIComponent(filePath)}&action=read`)
                    const content = Buffer.from(data.content || '', 'utf8')
                    const pathMod = await import('path')
                    const fileName = pathMod.posix.basename(filePath)

                    // Build minimal tar: 512-byte header + content + padding
                    const headerBuf = Buffer.alloc(512, 0)
                    headerBuf.write(fileName, 0, Math.min(fileName.length, 100), 'utf8')
                    headerBuf.write('0000644\0', 100, 8, 'utf8')
                    headerBuf.write('0000000\0', 108, 8, 'utf8')
                    headerBuf.write('0000000\0', 116, 8, 'utf8')
                    const sizeOctal = content.length.toString(8).padStart(11, '0') + '\0'
                    headerBuf.write(sizeOctal, 124, 12, 'utf8')
                    headerBuf.write('0', 156, 1, 'utf8')
                    headerBuf.write('        ', 148, 8, 'utf8')
                    let checksum = 0
                    for (let i = 0; i < 512; i++) checksum += headerBuf[i]
                    headerBuf.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')

                    const paddingSize = (512 - (content.length % 512)) % 512
                    const tarBuf = Buffer.concat([headerBuf, content, Buffer.alloc(paddingSize, 0), Buffer.alloc(1024, 0)])

                    const { Readable } = require('stream')
                    return Readable.from(tarBuf)
                },
                async putArchive(tarStream, opts) {
                    // Read tar stream, extract content, write via docklab-server
                    const chunks = []
                    for await (const chunk of tarStream) {
                        chunks.push(chunk)
                    }
                    const tarBuf = Buffer.concat(chunks)

                    if (tarBuf.length < 512) return

                    // Extract filename from tar header (first 100 bytes)
                    const fileName = tarBuf.slice(0, 100).toString('utf8').replace(/\0/g, '')
                    // Extract file size from header bytes 124-135

                    const sizeStr = tarBuf.slice(124, 136).toString('utf8').replace(/\0/g, '').trim()
                    const fileSize = parseInt(sizeStr, 8) || 0
                    const content = tarBuf.slice(512, 512 + fileSize).toString('utf8')

                    const pathMod = await import('path')
                    const dirPath = opts?.path || '/'
                    const fullPath = pathMod.posix.join(dirPath, fileName)

                    await docklabServerJson(`/api/containers/${id}/files`, {
                        method: 'PUT',
                        body: JSON.stringify({ path: fullPath, content })
                    })
                },
                async attach(opts) {
                    const { PassThrough } = require('stream')
                    const stream = new PassThrough()
                    if (opts.stream === false) stream.end('')
                    return stream
                },
                async wait() {
                    return { StatusCode: 0 }
                }
            }
        },

        getVolume(name) {
            return {
                async remove() {
                    return docklabServerFetch(`/api/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' })
                }
            }
        },

        getNetwork(id) {
            return {
                async remove() {
                    return docklabServerFetch(`/api/networks/${id}`, { method: 'DELETE' })
                }
            }
        },

        getImage(name) {
            return {
                async inspect() {
                    return docklabServerJson(`/api/images/${encodeURIComponent(name)}/inspect`)
                },
                async remove(opts) {
                    return docklabServerFetch(`/api/images/${encodeURIComponent(name)}`, { method: 'DELETE' })
                }
            }
        },

        async pull(repoTag, callback) {
            try {
                const res = await docklabServerFetch(`/api/images/pull`, {
                    method: 'POST',
                    timeout: 300000,
                    body: JSON.stringify({ repoTag })
                })
                // SSE stream
                if (callback) {
                    callback(null, res.body)
                }
            } catch (err) {
                if (callback) callback(err)
            }
        },

        async createContainer(opts) {
            const data = await docklabServerJson('/api/containers', {
                method: 'POST',
                timeout: 300000,
                body: JSON.stringify({
                    action: 'create',
                    image: opts.Image,
                    name: opts.name,
                    ports: Object.entries(opts.HostConfig?.PortBindings || {}).map(([cp, bindings]) => {
                        const containerPort = cp.replace('/tcp', '').replace('/udp', '')
                        return bindings.map(b => `${b.HostPort}:${containerPort}`).join(',')
                    }).join(','),
                    env: (opts.Env || []).join('\n'),
                    volumes: opts.HostConfig?.Binds || [],
                    restartPolicy: opts.HostConfig?.RestartPolicy?.Name,
                    network: opts.HostConfig?.NetworkMode,
                    command: (opts.Cmd || []).join(' '),
                })
            })
            return {
                id: data.containerId,
                async start() { /* already started by docklab-server */ }
            }
        },

        async run(image, cmd, outputStream, options = {}) {
            // Simulate dockerode's run(): create, start, wait, get logs, remove
            try {
                // Pull image first (ignore errors if already exists)
                try {
                    await docklabServerJson('/api/images/pull', {
                        method: 'POST',
                        timeout: 300000,
                        body: JSON.stringify({ repoTag: image })
                    })
                } catch (e) { }

                // Create container via docklab-server
                const createData = await docklabServerJson('/api/containers', {
                    method: 'POST',
                    timeout: 300000,
                    body: JSON.stringify({
                        action: 'create',
                        image,
                        ...options,
                        command: (cmd || []).join(' '),
                        env: (options.Env || []).join('\n'),
                        volumes: options.HostConfig?.Binds || [],
                    })
                })

                const containerId = createData.containerId
                if (!containerId) throw new Error('Failed to create container')

                // Wait a moment for container to run & exit
                await new Promise(r => setTimeout(r, 3000))

                // Get logs
                try {
                    const logData = await docklabServerJson(`/api/containers/${containerId}/logs?tail=1000`)
                    const output = (logData.logs || []).join('\n')
                    if (outputStream && outputStream.write) {
                        outputStream.write(output)
                        outputStream.end()
                    }
                } catch (e) { }

                // Remove container
                try {
                    await docklabServerJson('/api/containers', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'remove', containerId })
                    })
                } catch (e) { }

                return [{ StatusCode: 0 }]
            } catch (err) {
                if (outputStream && outputStream.end) outputStream.end()
                throw err
            }
        },

        async getEvents() {
            const res = await docklabServerFetch('/api/system/events')
            return res.body
        },

        // Whitelist
        async getWhitelist() {
            return docklabServerJson('/api/system/whitelist')
        },

        async updateWhitelist(whitelist) {
            return docklabServerJson('/api/system/whitelist', {
                method: 'PATCH',
                body: JSON.stringify({ whitelist })
            })
        },
    }
}

export async function getSystemInfo() {
    try {
        const docker = await getDockerClient()
        const info = await docker.info()
        const images = await docker.listImages()

        // Calculate actual memory and CPU used by containers from stats
        let containersMemUsed = 0
        let containersCpuUsed = 0

        // If it's a docklab-server connection, use the pre-calculated host stats
        if (info._docklabServerMemUsed !== undefined) {
            containersMemUsed = info._docklabServerMemUsed
            containersCpuUsed = info._docklabServerCpuUsed
        } else {
            // Only calculate manually for direct TCP/socket connections
            try {
                const runningContainers = await docker.listContainers({ filters: { status: ['running'] } })

                // Limit to 20 containers to keep it responsive, with a per-container timeout
                const statsPromises = runningContainers.slice(0, 20).map(async (c) => {
                    try {
                        const container = docker.getContainer(c.Id)
                        const stats = await Promise.race([
                            container.stats({ stream: false }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                        ])

                        // Memory
                        const mem = stats.memory_stats?.usage || 0

                        // CPU Percent Calculation (Docker formula)
                        let cpuPct = 0
                        try {
                            const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0)
                            const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0)
                            if (systemDelta > 0 && cpuDelta > 0) {
                                const cpus = stats.cpu_stats?.online_cpus || 1
                                cpuPct = (cpuDelta / systemDelta) * cpus * 100
                            }
                        } catch { /* missing cpu stats */ }

                        return { mem, cpu: cpuPct }
                    } catch { return { mem: 0, cpu: 0 } }
                })

                const results = await Promise.all(statsPromises)
                containersMemUsed = results.reduce((a, b) => a + b.mem, 0)
                containersCpuUsed = results.reduce((a, b) => a + b.cpu, 0)
            } catch { /* ignore stats errors */ }
        }

        // Fetch docker policies and format return object
        // Use pre-calculated policies from docklab-server if available to avoid slow inspect loops
        const policies = info._docklabServerPolicies || await getDockerPolicies(docker, images)

        return {
            containers: {
                total: info.Containers,
                running: info.ContainersRunning,
                stopped: info.ContainersStopped,
                paused: info.ContainersPaused,
            },
            images: { total: images.length },
            memory: {
                total: info.MemTotal,
                used: containersMemUsed,
            },
            cpu: {
                usedPercent: containersCpuUsed,
            },
            ncpu: info.NCPU,
            serverVersion: info.ServerVersion,
            operatingSystem: info.OperatingSystem,
            architecture: info.Architecture,
            policies,
        }
    } catch (err) {
        console.error('Failed to get system info from Docker:', err)
        throw new Error('Could not connect to Docker daemon')
    }
}

async function getDockerPolicies(docker, images) {
    try {
        const containers = await docker.listContainers({ all: true })
        let resourceLimitsSet = 0
        let officialBaseImages = 0

        for (const container of containers) {
            // Check if resource limits are set (approximate by checking if they were started with limits, though listContainers doesn't show it directly. We'd have to inspect them, but we can do a quick check via basic labels or skip, let's just inspect them all in parallel if not too many)
            const cInfo = await docker.getContainer(container.Id).inspect()
            if (cInfo.HostConfig?.Memory > 0 || cInfo.HostConfig?.CpuQuota > 0 || cInfo.HostConfig?.CpuShares > 0) {
                resourceLimitsSet++
            }
        }

        const danglingImages = images.filter(img => img.RepoTags?.includes('<none>:<none>')).length

        // Count official images (no slash in repo name like 'nginx', 'postgres')
        const allRepos = images.flatMap(img => img.RepoTags || [])
        const officialImagesCount = images.filter(img => img.RepoTags?.some(tag => !tag.includes('/'))).length

        return {
            healthyImagesCount: images.length - danglingImages,
            resourceLimitsSet,
            officialBaseImages: officialImagesCount,
        }
    } catch (e) {
        console.error('Error fetching policies', e)
        return {}
    }
}

export async function listContainers(session = null) {
    try {
        const docker = await getDockerClient()
        let containers = await docker.listContainers({ all: true })

        if (session && ['viewer', 'developer'].includes(session.user?.role)) {
            const cookieStore = await cookies()
            let hostId = cookieStore.get('docklab_host_id')?.value
            if (!hostId) {
                const firstHost = await prisma.dockerHost.findFirst()
                if (firstHost) hostId = firstHost.id
            }

            if (hostId) {
                const allowed = await prisma.containerAccess.findMany({
                    where: { userId: session.user.id, dockerHostId: hostId }
                })
                const allowedIds = new Set(allowed.map(a => a.containerId))
                containers = containers.filter(c => {
                    const shortId = c.Id.slice(0, 12)
                    const name = c.Names[0]?.replace('/', '')
                    return allowedIds.has(shortId) || allowedIds.has(name)
                })
            } else {
                containers = []
            }
        }

        return containers.map(c => ({
            id: c.Id.slice(0, 12),
            name: c.Names[0]?.replace('/', '') || c.Id.slice(0, 12),
            image: c.Image,
            status: c.State,
            state: c.Status,
            ports: c.Ports?.map(p => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : null).filter(Boolean),
            created: c.Created,
        }))
    } catch (err) {
        if (err.message !== 'No Docker host provided.') {
            console.error('Failed to list containers:', err)
        }
        throw new Error(err.message === 'No Docker host provided.' ? err.message : 'Could not connect to Docker daemon')
    }
}

export async function listImages() {
    try {
        const docker = await getDockerClient()
        const images = await docker.listImages()
        return images.map(img => ({
            id: img.Id.replace('sha256:', '').slice(0, 12),
            repoTags: img.RepoTags || ['<none>:<none>'],
            size: img.Size,
            created: img.Created,
        }))
    } catch (err) {
        console.error('Failed to list images:', err)
        throw new Error('Could not connect to Docker daemon')
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export async function listVolumes() {
    try {
        const docker = await getDockerClient()

        // Use docker.df() to get sizes instead of listVolumes() alone
        const dfInfo = await docker.df()
        const volumesUsage = dfInfo.Volumes || []

        // Still need listContainers to figure out which containers use the volume
        const containers = await docker.listContainers({ all: true })
        const volumeUsageByContainer = {}

        for (const container of containers) {
            for (const mount of container.Mounts || []) {
                if (mount.Type === 'volume' && mount.Name) {
                    if (!volumeUsageByContainer[mount.Name]) volumeUsageByContainer[mount.Name] = []
                    volumeUsageByContainer[mount.Name].push(container.Names[0]?.replace('/', ''))
                }
            }
        }

        return volumesUsage.map(v => {
            const sizeBytes = v.UsageData?.Size || 0

            // If v.Containers already exists (from Docklab-server proxy), use it, otherwise use our calculated map
            const connectedContainers = Array.isArray(v.Containers) ? v.Containers : (volumeUsageByContainer[v.Name] || [])

            return {
                name: v.Name,
                driver: v.Driver,
                mountpoint: v.Mountpoint,
                created: v.CreatedAt ? new Date(v.CreatedAt).toISOString().split('T')[0] : 'Unknown',
                size: formatBytes(sizeBytes),
                containers: connectedContainers
            }
        })
    } catch (err) {
        console.error('Failed to list volumes:', err)
        throw new Error('Could not connect to Docker daemon')
    }
}

export async function createVolume(name) {
    const docker = await getDockerClient()
    const options = name ? { Name: name } : {}
    return await docker.createVolume(options)
}

export async function removeVolume(name) {
    const docker = await getDockerClient()
    const volume = docker.getVolume(name)
    return await volume.remove()
}

export async function listNetworks() {
    try {
        const docker = await getDockerClient()
        const networks = await docker.listNetworks()

        return networks.map(n => {
            let subnet = ''
            if (n.IPAM && n.IPAM.Config && n.IPAM.Config.length > 0) {
                subnet = n.IPAM.Config[0].Subnet || ''
            }

            return {
                id: n.Id.slice(0, 12),
                name: n.Name,
                driver: n.Driver,
                scope: n.Scope,
                subnet: subnet || '—',
                containers: Object.keys(n.Containers || {}).length
            }
        })
    } catch (err) {
        console.error('Failed to list networks:', err)
        throw new Error('Could not connect to Docker daemon')
    }
}

export async function createNetwork(name) {
    const docker = await getDockerClient()
    return await docker.createNetwork({ Name: name })
}

export async function removeNetwork(id) {
    const docker = await getDockerClient()
    const network = docker.getNetwork(id)
    return await network.remove()
}

export async function pullImage(repoTag) {
    const docker = await getDockerClient()
    return new Promise((resolve, reject) => {
        docker.pull(repoTag, (err, stream) => {
            if (err) return reject(err)

            docker.modem.followProgress(stream, onFinished, onProgress)

            function onFinished(err, output) {
                if (err) return reject(err)
                resolve(output)
            }

            function onProgress(event) {
                // In a fully real-time system, we would stream this progress via websocket
                console.log(`[Pulling ${repoTag}] ${event.status} ${event.progress || ''}`)
            }
        })
    })
}

export async function removeImage(imageName) {
    const docker = await getDockerClient()
    const image = docker.getImage(imageName)
    return await image.remove({ force: true })
}

/**
 * Get accurate host-level stats for a Docker host.
 * For docklab-server hosts, they already include this in their info() payload.
 * For TCP hosts, we run a temporary container with nsenter to get real host stats.
 */
export async function getDockerHostStats(docker, info, cacheKey = 'local') {
    // If it's a docklab-server client, it already computed host storage/cpu/ram info in info() call
    if (info._docklabServerStorage) {
        return {
            storage: info._docklabServerStorage,
            cpu: info._docklabServerCpuUsed ?? 0,
            ram: (info._docklabServerMemUsed / (info.MemTotal || 1)) * 100,
            ramUsed: info._docklabServerMemUsed,
            ramTotal: info.MemTotal
        }
    }

    const cached = statsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < 3000) {
        return cached.data
    }

    try {
        // Use docker.info() and docker.df() — no Alpine container needed
        const memTotal = info.MemTotal || 0
        const ncpu = info.NCPU || 1

        // Storage from docker.df() (disk usage)
        let storage = { total: 0, used: 0, usedPercent: 0 }
        try {
            const df = await docker.df()
            // Sum up image + container + volume + build cache usage
            let totalUsed = 0
            if (df.Images) totalUsed += df.Images.reduce((sum, img) => sum + (img.Size || 0), 0)
            if (df.Containers) totalUsed += df.Containers.reduce((sum, c) => sum + (c.SizeRw || 0) + (c.SizeRootFs || 0), 0)
            if (df.Volumes) totalUsed += df.Volumes.reduce((sum, v) => sum + (v.UsageData?.Size || 0), 0)
            if (df.BuildCache) totalUsed += df.BuildCache.reduce((sum, b) => sum + (b.Size || 0), 0)

            // Driver root dir size from info
            const driverStatus = info.DriverStatus || []
            let driverTotal = 0
            let driverUsed = 0
            for (const [key, value] of driverStatus) {
                if (key === 'Data Space Total' || key === 'Total Space') {
                    driverTotal = parseSize(value)
                }
                if (key === 'Data Space Used' || key === 'Used Space') {
                    driverUsed = parseSize(value)
                }
            }
            if (driverTotal > 0) {
                storage = { total: driverTotal, used: driverUsed || totalUsed, usedPercent: ((driverUsed || totalUsed) / driverTotal) * 100 }
            } else if (info.SystemStatus) {
                // Some drivers report through SystemStatus
                storage = { total: 0, used: totalUsed, usedPercent: 0 }
            } else {
                storage = { total: 0, used: totalUsed, usedPercent: 0 }
            }
        } catch (e) {
            // docker.df() might fail on some hosts
        }

        // RAM from container stats (aggregate all running containers)
        let ramUsed = 0
        try {
            const containers = await docker.listContainers({ all: false }) // running only
            const statsPromises = containers.slice(0, 10).map(async (c) => {
                try {
                    const ct = docker.getContainer(c.Id)
                    const stats = await ct.stats({ stream: false })
                    return (stats.memory_stats?.usage || 0) - (stats.memory_stats?.stats?.cache || 0)
                } catch { return 0 }
            })
            const usages = await Promise.all(statsPromises)
            ramUsed = usages.reduce((sum, u) => sum + u, 0)
        } catch (e) { }

        const ram = memTotal > 0 ? (ramUsed / memTotal) * 100 : 0

        const data = {
            storage,
            ram,
            ramUsed,
            ramTotal: memTotal,
            cpu: 0 // CPU for TCP hosts is calculated in smartCache from container stats
        }

        statsCache.set(cacheKey, { data, ts: Date.now() })
        return data
    } catch (e) {
        console.error('Failed to get host stats:', e.message)
    }

    const prev = statsCache.get(cacheKey)
    return prev?.data || { storage: { total: 0, used: 0, usedPercent: 0 }, ram: 0, ramUsed: 0, ramTotal: 0, cpu: 0 }
}

/** Parse Docker size strings like "10.5 GB" to bytes */
function parseSize(str) {
    if (!str) return 0
    const match = str.match(/([\d.]+)\s*([KMGTPE]?B?)/i)
    if (!match) return 0
    const num = parseFloat(match[1])
    const unit = (match[2] || '').toUpperCase()
    const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4, 'PB': 1024 ** 5 }
    return num * (multipliers[unit] || 1)
}
