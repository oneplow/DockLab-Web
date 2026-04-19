import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getDockerClientForHost } from '@/lib/docker/service'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id: hostId } = await params
        const host = await prisma.dockerHost.findUnique({ where: { id: hostId } })
        if (!host) {
            return Response.json({ error: 'Host not found' }, { status: 404 })
        }

        // We use `getDockerClientForHost` to ignore the user's cookie and target the specific `hostId`
        const docker = await getDockerClientForHost(host)

        const rawContainers = await docker.listContainers({ all: true })
        const formatted = rawContainers.map(c => ({
            id: c.Id.slice(0, 12),
            name: c.Names[0]?.replace('/', '') || c.Id.slice(0, 12),
            image: c.Image
        }))

        return Response.json(formatted)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
