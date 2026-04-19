import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getDockerClient } from '@/lib/docker/service'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

function stripDockerHeadersLines(chunk) {
    if (typeof chunk !== 'string') return []
    return chunk.split('\n')
        .map(line => line.replace(/^.{1,8}?(\d{4}-\d{2}-\d{2}T)/, '$1').replace(/\uFFFD/g, ''))
        .map(line => line.replace(/^[\x00-\x09\x0B-\x1F\x7F]+/, '').trimEnd())
        .filter(line => line.trim().length > 0)
}

function maskApiKey(line, role) {
    if (role === 'viewer') {
        return line.replace(/(api_key|apikey|api-key|secret|password|token|bearer|auth|api key)(["']?\s*[:=]\s*["']?)([a-zA-Z0-9_\-]{8,})/gi, '$1$2********')
    }
    return line
}

export async function GET(req, { params }) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal) return new Response('Unauthorized', { status: 401 })

    const { id } = await params
    if (!id) return new Response('Missing container ID', { status: 400 })

    const role = sessionLocal.user?.role || 'viewer'

    // Parse query params (e.g. ?tail=500)
    const urlParams = new URL(req.url).searchParams
    const tail = urlParams.get('tail') || 500

    const encoder = new TextEncoder()
    const abortController = new AbortController()
    let dockerStream = null

    const stream = new ReadableStream({
        async start(controller) {
            let isClosed = false

            const safeEnqueue = (data) => {
                if (isClosed || abortController.signal.aborted) return
                try {
                    if (controller.desiredSize !== null) {
                        controller.enqueue(data)
                    }
                } catch (e) {
                    isClosed = true
                }
            }

            const safeClose = () => {
                if (isClosed) return
                isClosed = true
                try { controller.close() } catch (e) { }
            }

            try {
                const cookieStore = await cookies()
                const activeHostId = cookieStore.get('docklab_host_id')?.value

                let activeHost = null
                if (activeHostId) {
                    activeHost = await prisma.dockerHost.findUnique({
                        where: { id: activeHostId }
                    })
                }

                if (!activeHost) {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No active host' })}\n\n`))
                    safeClose()
                    return
                }

                if (activeHost.connectionType === 'docklab-server') {
                    // Proxy from Docklab-server Agent
                    const docklabServerUrl = (activeHost.socketPath || '').replace(/\/$/, '')
                    if (!docklabServerUrl) throw new Error('Host socketPath is missing')

                    const url = `${docklabServerUrl}/api/containers/${id}/logs/stream?tail=${tail}`

                    const response = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${activeHost.apiKey ? decrypt(activeHost.apiKey) : ''}` },
                        signal: abortController.signal
                    })

                    if (!response.ok) {
                        throw new Error(`Docklab-server agent responded with ${response.status}`)
                    }

                    const reader = response.body.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''

                    while (true) {
                        if (isClosed || abortController.signal.aborted) break
                        const { done, value } = await reader.read()
                        if (done) break

                        buffer += decoder.decode(value, { stream: true })
                        const chunks = buffer.split('\n\n')
                        buffer = chunks.pop()

                        for (const chunk of chunks) {
                            if (isClosed || abortController.signal.aborted) break
                            const trimmed = chunk.trim()
                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const parsed = JSON.parse(trimmed.slice(6))
                                    if (parsed.log) {
                                        const cleanLine = stripDockerHeadersLines(parsed.log)[0] || parsed.log
                                        parsed.log = maskApiKey(cleanLine, role)
                                        safeEnqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))
                                    } else {
                                        safeEnqueue(encoder.encode(`${trimmed}\n\n`))
                                    }
                                } catch (e) {
                                    safeEnqueue(encoder.encode(`${trimmed}\n\n`))
                                }
                            }
                        }
                    }
                } else {
                    // TCP Host / Socket Host
                    const docker = await getDockerClient()
                    const container = docker.getContainer(id)

                    dockerStream = await container.logs({
                        stdout: true,
                        stderr: true,
                        timestamps: true,
                        tail: parseInt(tail),
                        follow: true
                    })

                    if (!dockerStream || typeof dockerStream.on !== 'function') {
                        throw new Error("Unable to read logs stream")
                    }

                    dockerStream.on('data', (chunk) => {
                        if (isClosed || abortController.signal.aborted) return
                        try {
                            // Convert chunk buffer
                            const rawStr = chunk.toString('utf8')
                            const cleanLines = stripDockerHeadersLines(rawStr)

                            for (const line of cleanLines) {
                                const masked = maskApiKey(line, role)
                                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ log: masked })}\n\n`))
                            }
                        } catch (e) {
                            // ignore partial JSON from stream
                        }
                    })

                    dockerStream.on('error', (err) => {
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                        safeClose()
                    })

                    dockerStream.on('end', () => safeClose())
                    dockerStream.on('close', () => safeClose())
                }

            } catch (err) {
                if (err.name === 'AbortError') return
                console.error('Container Logs Stream Error:', err)
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                safeClose()
            }
        },
        cancel() {
            abortController.abort()
            if (dockerStream) {
                try { dockerStream.destroy() } catch (e) { }
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    })
}
