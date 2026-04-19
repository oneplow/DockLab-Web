import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getDockerClient } from '@/lib/docker/service'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

export async function GET(req, { params }) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal) return new Response('Unauthorized', { status: 401 })

    const { id } = await params
    if (!id) return new Response('Missing container ID', { status: 400 })

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

                    const url = `${docklabServerUrl}/api/containers/${id}/stats/stream`

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
                                safeEnqueue(encoder.encode(`${trimmed}\n\n`))
                            }
                        }
                    }
                } else {
                    // TCP Host / Socket Host
                    const docker = await getDockerClient()
                    const container = docker.getContainer(id)

                    dockerStream = await container.stats({ stream: true })

                    dockerStream.on('data', (chunk) => {
                        if (isClosed || abortController.signal.aborted) return
                        try {
                            const rawStr = chunk.toString('utf8')
                            const stats = JSON.parse(rawStr)

                            let cpuPercent = 0
                            const cpuUsage = stats.cpu_stats?.cpu_usage?.total_usage || 0
                            const preCpuUsage = stats.precpu_stats?.cpu_usage?.total_usage || 0
                            const systemUsage = stats.cpu_stats?.system_cpu_usage || 0
                            const preSystemUsage = stats.precpu_stats?.system_cpu_usage || 0
                            const numCpus = stats.cpu_stats?.online_cpus || stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 1

                            const cpuDelta = cpuUsage - preCpuUsage
                            const systemDelta = systemUsage - preSystemUsage

                            if (systemDelta > 0 && cpuDelta > 0) {
                                cpuPercent = (cpuDelta / systemDelta) * numCpus * 100
                            }

                            const memUsage = stats.memory_stats?.usage || 0
                            const memLimit = stats.memory_stats?.limit || 1
                            const memPercent = (memUsage / memLimit) * 100

                            let netRx = 0, netTx = 0
                            if (stats.networks) {
                                for (const iface of Object.values(stats.networks)) {
                                    netRx += iface.rx_bytes || 0
                                    netTx += iface.tx_bytes || 0
                                }
                            }

                            const output = {
                                cpu: Math.round(cpuPercent * 100) / 100,
                                memUsage,
                                memLimit,
                                memPercent: Math.round(memPercent * 100) / 100,
                                netRx,
                                netTx,
                                timestamp: Date.now(),
                            }
                            safeEnqueue(encoder.encode(`data: ${JSON.stringify(output)}\n\n`))
                        } catch (e) {
                            // ignore partial JSON from stream
                        }
                    })

                    dockerStream.on('error', (err) => {
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                        safeClose()
                    })

                    dockerStream.on('close', () => safeClose())
                }

            } catch (err) {
                if (err.name === 'AbortError') return
                console.error('Container Stats Stream Error:', err)
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
