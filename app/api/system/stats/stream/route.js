import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { ensureWatcher, getCachedStats, subscribe } from '@/lib/docker/smartCache'
import { getDockerClient } from '@/lib/docker/service'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

function formatStats(data) {
    const cpu = data.cpu?.usedPercent ?? data.cpu ?? 0

    // RAM: Prioritize flat ram percent if present (from hostStats), otherwise calculate from memory object
    let ramPct = data.ram ?? 0
    let ramTotal = data.ramTotal ?? 1
    let ramUsed = data.ramUsed ?? 0

    // Check if we have a memory object but no top-level ram property
    if (data.memory && (!data.ram || data.ram === 0)) {
        ramTotal = data.memory.total || 1
        ramUsed = data.memory.used || 0
        ramPct = (ramUsed / ramTotal) * 100
    }

    // Storage: Same logic, prioritizing flat storage percent if present
    let storagePct = data.storage?.usedPercent ?? data.storage ?? 0
    let storageUsed = data.storage?.used ?? data.storageUsed ?? 0
    let storageTotal = data.storage?.total ?? data.storageTotal ?? 0

    return {
        ...data,
        cpu: parseFloat(Number(cpu || 0).toFixed(1)),
        ram: parseFloat(Number(ramPct || 0).toFixed(1)),
        ramUsed,
        ramTotal,
        storage: parseFloat(Number(storagePct || 0).toFixed(1)),
        storageUsed,
        storageTotal,
    }
}

export async function GET(req) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal) return new Response('Unauthorized', { status: 401 })

    const encoder = new TextEncoder()
    let unsubscribe = null
    const abortController = new AbortController()

    const urlParams = new URL(req.url).searchParams
    const queryHostId = urlParams.get('hostId')

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
                let activeHostId = queryHostId

                // Fallback to cookies if no query param
                if (!activeHostId) {
                    const cookieStore = await cookies()
                    activeHostId = cookieStore.get('docklab_host_id')?.value
                }

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
                    // Proxy from Docklab-server Agent — forward SSE stream directly
                    const docklabServerUrl = (activeHost.socketPath || '').replace(/\/$/, '')

                    if (!docklabServerUrl) {
                        throw new Error('Host socketPath is missing')
                    }

                    const url = `${docklabServerUrl}/api/system/stats/stream`

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
                                    const rawData = JSON.parse(trimmed.slice(6))
                                    const formatted = formatStats(rawData)
                                    safeEnqueue(encoder.encode(`data: ${JSON.stringify(formatted)}\n\n`))
                                } catch (e) {
                                    if (e.code !== 'ERR_INVALID_STATE') {
                                        console.error('Failed to parse Docklab-server SSE chunk', e)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // TCP hosts — use smartCache watcher
                    ensureWatcher(activeHostId, () => getDockerClient())

                    // Send current cache immediately
                    const current = getCachedStats(activeHostId)
                    const formatted = formatStats(current)
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify(formatted)}\n\n`))

                    // Subscribe to future updates
                    unsubscribe = subscribe(activeHostId, (snapshot) => {
                        if (isClosed || abortController.signal.aborted) {
                            if (unsubscribe) unsubscribe()
                            return
                        }
                        try {
                            const formatted = formatStats(snapshot)
                            safeEnqueue(encoder.encode(`data: ${JSON.stringify(formatted)}\n\n`))
                        } catch { }
                    })
                }

            } catch (err) {
                if (err.name === 'AbortError') return
                console.error('Stats Stream Error:', err)
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                safeClose()
            }
        },
        cancel() {
            abortController.abort()
            if (unsubscribe) unsubscribe()
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