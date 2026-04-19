import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'
import { logAudit } from '@/lib/audit'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const docker = await getDockerClient()
        const containers = await docker.listContainers({ all: true })

        // Group containers by compose project label
        const stackMap = {}

        containers.forEach(c => {
            const projectName = c.Labels?.['com.docker.compose.project']
            if (!projectName) return

            if (!stackMap[projectName]) {
                stackMap[projectName] = {
                    name: projectName,
                    containers: [],
                    runningCount: 0,
                    stoppedCount: 0,
                    services: new Set(),
                    created: null
                }
            }

            const serviceName = c.Labels?.['com.docker.compose.service'] || c.Names?.[0]?.replace('/', '')
            const isRunning = c.State === 'running'

            stackMap[projectName].containers.push({
                id: c.Id,
                name: c.Names?.[0]?.replace('/', '') || c.Id.substring(0, 12),
                image: c.Image,
                state: c.State,
                status: c.Status,
                service: serviceName,
            })

            if (isRunning) stackMap[projectName].runningCount++
            else stackMap[projectName].stoppedCount++

            stackMap[projectName].services.add(serviceName)

            // Track earliest creation
            if (!stackMap[projectName].created || c.Created < stackMap[projectName].created) {
                stackMap[projectName].created = c.Created
            }
        })

        // Convert sets to arrays and compute status
        const stacks = Object.values(stackMap).map(s => ({
            ...s,
            services: [...s.services],
            totalCount: s.containers.length,
            status: s.runningCount === s.containers.length ? 'running'
                : s.runningCount === 0 ? 'stopped'
                    : 'partial'
        }))

        // Sort: running first, then by name
        stacks.sort((a, b) => {
            if (a.status === 'running' && b.status !== 'running') return -1
            if (a.status !== 'running' && b.status === 'running') return 1
            return a.name.localeCompare(b.name)
        })

        return Response.json({ stacks })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { action, stackName } = await request.json()
        if (!stackName) return Response.json({ error: 'Stack name is required' }, { status: 400 })

        const docker = await getDockerClient()
        const containers = await docker.listContainers({ all: true })

        // Filter containers that belong to this stack
        const stackContainers = containers.filter(
            c => c.Labels?.['com.docker.compose.project'] === stackName
        )

        if (stackContainers.length === 0) {
            return Response.json({ error: 'Stack not found' }, { status: 404 })
        }

        const results = []

        for (const c of stackContainers) {
            const container = docker.getContainer(c.Id)
            const name = c.Names?.[0]?.replace('/', '') || c.Id.substring(0, 12)
            try {
                if (action === 'stop') {
                    if (c.State === 'running') {
                        await container.stop()
                        results.push({ name, status: 'stopped' })
                    } else {
                        results.push({ name, status: 'already stopped' })
                    }
                } else if (action === 'start') {
                    if (c.State !== 'running') {
                        await container.start()
                        results.push({ name, status: 'started' })
                    } else {
                        results.push({ name, status: 'already running' })
                    }
                } else if (action === 'restart') {
                    await container.restart()
                    results.push({ name, status: 'restarted' })
                } else if (action === 'remove') {
                    if (c.State === 'running') await container.stop()
                    await container.remove({ force: true })
                    results.push({ name, status: 'removed' })
                } else {
                    return Response.json({ error: 'Invalid action' }, { status: 400 })
                }
            } catch (err) {
                results.push({ name, status: 'error', error: err.message })
            }
        }

        await logAudit(session, `stack.${action}`, stackName, `${results.length} containers affected`)
        return Response.json({ success: true, results })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
