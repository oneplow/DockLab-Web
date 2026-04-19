import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { cookies } from 'next/headers'
import { ensureWatcher, getCachedStats } from '@/lib/docker/smartCache'
import { getDockerClient } from '@/lib/docker/service'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const cookieStore = await cookies()
        const activeHostId = cookieStore.get('docklab_host_id')?.value || 'local'

        // Ensure watcher is running for this host
        ensureWatcher(activeHostId, () => getDockerClient())

        // Read from cache
        const cached = getCachedStats(activeHostId)

        // Format output
        const cpu = cached.cpu ?? 0
        const ram = cached.ram ?? 0
        const ramUsed = cached.ramUsed ?? 0
        const ramTotal = cached.ramTotal ?? 1
        const storage = cached.storage ?? 0
        const storageUsed = cached.storageUsed ?? 0
        const storageTotal = cached.storageTotal ?? 0

        return Response.json({
            ...cached,
            cpu: parseFloat((cpu || 0).toFixed(1)),
            ram: parseFloat((ram || 0).toFixed(1)),
            ramUsed,
            ramTotal,
            storage: parseFloat((storage || 0).toFixed(1)),
            storageUsed,
            storageTotal,
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}