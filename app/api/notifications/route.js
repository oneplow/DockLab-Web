import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listContainers } from '@/lib/docker/service'
import os from 'os'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        let containers = []
        const notifications = []

        try {
            containers = await listContainers(session)
        } catch (e) {
            notifications.push({
                id: 'host-offline',
                title: 'Host Connection Failed',
                message: 'Unable to connect to the active host. Please check if the agent is running.',
                type: 'error',
                time: Date.now()
            })
        }

        // 1. Check for crashed or restarting containers
        for (const c of containers) {
            // "exited" but not "Exited (0)"
            if (c.state === 'exited' && !c.status.includes('Exited (0)')) {
                notifications.push({
                    id: `crash-${c.id}`,
                    title: 'Container Crashed',
                    message: `Container ${c.name} exited with an error.`,
                    type: 'error',
                    time: Date.now(),
                    link: `/containers/${c.id}`
                })
            }
            if (c.state === 'restarting') {
                notifications.push({
                    id: `restart-${c.id}`,
                    title: 'Container Restarting',
                    message: `Container ${c.name} is in a crash loop.`,
                    type: 'warning',
                    time: Date.now(),
                    link: `/containers/${c.id}`
                })
            }
        }

        // 2. Resource Warnings
        const freeMemPct = os.freemem() / os.totalmem()
        if (freeMemPct < 0.1) {
            notifications.push({
                id: 'high-mem',
                title: 'High Memory Usage',
                message: 'System memory is running low (< 10% free).',
                type: 'warning',
                time: Date.now()
            })
        }

        // Sort by priority (error > warning > info)
        notifications.sort((a, b) => {
            if (a.type === 'error' && b.type !== 'error') return -1
            if (b.type === 'error' && a.type !== 'error') return 1
            return 0
        })

        return Response.json(notifications)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
