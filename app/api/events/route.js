import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const docker = await getDockerClient()

        // Get recent container events using Docker API
        const now = Math.floor(Date.now() / 1000)
        const since = now - 86400 // last 24 hours

        const events = await new Promise((resolve, reject) => {
            const results = []
            docker.getEvents({
                since,
                until: now,
                filters: { type: ['container'] }
            }, (err, stream) => {
                if (err) return reject(err)

                let data = ''
                stream.on('data', chunk => {
                    data += chunk.toString()
                })
                stream.on('end', () => {
                    try {
                        // Events come as newline-separated JSON
                        const lines = data.split('\n').filter(l => l.trim())
                        for (const line of lines) {
                            try {
                                const evt = JSON.parse(line)
                                results.push(evt)
                            } catch { /* skip malformed lines */ }
                        }
                    } catch { }
                    resolve(results)
                })
                stream.on('error', reject)

                // Timeout after 3 seconds to avoid hanging
                setTimeout(() => {
                    try { stream.destroy() } catch { }
                    resolve(results)
                }, 3000)
            })
        })

        // Format events for the frontend
        const formatted = events
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

        return Response.json(formatted)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

function formatTimeAgo(timeMs) {
    const diff = Date.now() - timeMs
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
}
