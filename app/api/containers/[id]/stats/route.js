import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    try {
        const docker = await getDockerClient()
        const container = docker.getContainer(id)

        // Get one snapshot of stats (not streaming)
        const stats = await container.stats({ stream: false })

        // Docklab-server proxy returns pre-calculated stats
        if (stats.cpu !== undefined && stats.memUsage !== undefined) {
            return Response.json({
                cpu: stats.cpu,
                memUsage: stats.memUsage,
                memLimit: stats.memLimit,
                memPercent: stats.memPercent,
                netRx: stats.netRx || 0,
                netTx: stats.netTx || 0,
                timestamp: stats.timestamp || Date.now(),
            })
        }

        // Raw Docker stats format — calculate values
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
        const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0

        // Memory
        const memUsage = stats.memory_stats.usage || 0
        const memLimit = stats.memory_stats.limit || 1
        const memPercent = (memUsage / memLimit) * 100

        // Network
        let netRx = 0
        let netTx = 0
        if (stats.networks) {
            for (const iface of Object.values(stats.networks)) {
                netRx += iface.rx_bytes || 0
                netTx += iface.tx_bytes || 0
            }
        }

        return Response.json({
            cpu: Math.round(cpuPercent * 100) / 100,
            memUsage,
            memLimit,
            memPercent: Math.round(memPercent * 100) / 100,
            netRx,
            netTx,
            timestamp: Date.now(),
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
