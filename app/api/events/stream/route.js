import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getDockerClient } from '@/lib/docker/service'

export const dynamic = 'force-dynamic'

function formatTimeAgo(timeMs) {
    const diff = Math.max(0, Date.now() - timeMs)
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
}

export async function GET(req) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal) return new Response('Unauthorized', { status: 401 })

    const encoder = new TextEncoder()
    const abortController = new AbortController()

    const stream = new ReadableStream({
        async start(controller) {
            let isClosed = false
            let dockerStream = null

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

                // Initial fetch to get the latest historical events first before streaming
                const docker = await getDockerClient()
                const now = Math.floor(Date.now() / 1000)
                const since = now - 86400 // last 24 hours

                // Fetch historical events
                try {
                    const eventsHistory = await new Promise((resolve, reject) => {
                        const results = []
                        docker.getEvents({
                            since,
                            until: now,
                            filters: { type: ['container'] }
                        }, (err, streamHistory) => {
                            if (err) return resolve([])

                            let data = ''
                            streamHistory.on('data', chunk => { data += chunk.toString('utf8') })
                            streamHistory.on('end', () => {
                                try {
                                    const lines = data.split('\n').filter(l => l.trim())
                                    for (const line of lines) {
                                        try { results.push(JSON.parse(line)) } catch { }
                                    }
                                } catch { }
                                resolve(results)
                            })
                            streamHistory.on('error', () => resolve([]))

                            // Timeout to avoid hanging
                            setTimeout(() => {
                                try { streamHistory.destroy() } catch { }
                                resolve(results)
                            }, 5000)
                        })
                    })

                    const formatted = eventsHistory
                        .slice(-20) // last 20 events
                        .reverse() // newest first
                        .map(evt => {
                            const timeMs = (evt.time || evt.timeNano / 1e9) * 1000
                            const ago = formatTimeAgo(timeMs)
                            const name = evt.Actor?.Attributes?.name || evt.Actor?.Attributes?.image || evt.from || 'unknown'
                            return {
                                action: evt.Action || evt.status,
                                name,
                                from: evt.from,
                                timeAgo: ago,
                                time: timeMs,
                            }
                        })

                    if (formatted.length > 0) {
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ history: formatted })}\n\n`))
                    }
                } catch (e) { }

                // Begin live streaming events directly from docker API (works for both local socket and TCP remote hosts via dockerode)
                // Note: For Docklab-server proxies, getDockerClient() returns a mocked proxy that does NOT support getEvents.
                // If it is a docklab-server connection, we skip live stream entirely, the UI just relies on the initial history fetch.
                if (typeof docker.getEvents === 'function') {
                    dockerStream = await docker.getEvents({
                        filters: JSON.stringify({ type: ['container'] })
                    })

                    dockerStream.on('data', (chunk) => {
                        if (isClosed || abortController.signal.aborted) return
                        try {
                            const str = chunk.toString('utf8')
                            const lines = str.split('\n').filter(l => l.trim())

                            for (const line of lines) {
                                const evt = JSON.parse(line)
                                const timeMs = (evt.time || evt.timeNano / 1e9) * 1000
                                const ago = formatTimeAgo(timeMs)
                                const name = evt.Actor?.Attributes?.name || evt.Actor?.Attributes?.image || evt.from || 'unknown'

                                const formatted = {
                                    action: evt.Action || evt.status,
                                    name,
                                    from: evt.from,
                                    timeAgo: ago,
                                    time: timeMs,
                                }
                                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ live: formatted })}\n\n`))
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

                req.signal.addEventListener('abort', () => {
                    if (dockerStream) try { dockerStream.destroy() } catch (e) { }
                    safeClose()
                })

            } catch (err) {
                if (err.name === 'AbortError') return
                console.error('Docker Events Stream Error:', err)
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                safeClose()
            }
        },
        cancel() {
            abortController.abort()
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
