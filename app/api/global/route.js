import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getDockerClientForHost, getDockerHostStats } from '@/lib/docker/service'
import { getCachedStats, ensureWatcher } from '@/lib/docker/smartCache'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // Viewers cannot see global dashboard to prevent leaking infrastructure data
    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const hosts = await prisma.dockerHost.findMany()

        const hostDataPromises = hosts.map(async (host) => {
            try {
                // Kick-start the watcher so future requests use the cache
                ensureWatcher(host.id, () => getDockerClientForHost(host))

                // Try smartCache first
                const stats = getCachedStats(host.id)
                const cacheHasData = stats && stats.ncpu > 0 && stats.serverOnline

                if (cacheHasData) {
                    return {
                        id: host.id,
                        name: host.name,
                        status: 'online',
                        ncpu: stats.ncpu || 0,
                        memTotal: stats.ramTotal || 0,
                        memUsed: stats.ramUsed || 0,
                        cpuUsedPercent: stats.cpu || null,
                        containers: {
                            total: stats.containers?.total || 0,
                            running: stats.containers?.running || 0,
                            stopped: stats.containers?.stopped || 0,
                            paused: stats.containers?.paused || 0,
                        },
                        os: stats.operatingSystem || 'Unknown',
                        version: stats.serverVersion || 'Unknown',
                        connectionType: host.connectionType
                    }
                }

                // Fallback: cache is empty (cold start) → fetch directly from Docker
                const docker = await getDockerClientForHost(host)
                const info = await docker.info()

                // For docklab-server hosts, info() already has _docklabServer* fields
                let cpuUsedPercent = info._docklabServerCpuUsed || null
                let memUsed = info._docklabServerMemUsed || null

                // For TCP Direct: use getDockerHostStats for RAM + CPU
                if (!info._docklabServerStorage && host.connectionType !== 'docklab-server') {
                    try {
                        const hostStats = await getDockerHostStats(docker, info, host.id)
                        cpuUsedPercent = hostStats.cpu || null
                        memUsed = hostStats.ramUsed || null
                    } catch { }
                }

                return {
                    id: host.id,
                    name: host.name,
                    status: 'online',
                    ncpu: info.NCPU,
                    memTotal: info.MemTotal,
                    memUsed,
                    cpuUsedPercent,
                    containers: {
                        total: info.Containers,
                        running: info.ContainersRunning,
                        stopped: info.ContainersStopped,
                        paused: info.ContainersPaused,
                    },
                    os: info.OperatingSystem,
                    version: info.ServerVersion,
                    connectionType: host.connectionType
                }
            } catch (err) {
                return {
                    id: host.id,
                    name: host.name,
                    status: 'offline',
                    error: err.message,
                    connectionType: host.connectionType
                }
            }
        })

        const results = await Promise.all(hostDataPromises)
        return Response.json(results)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

