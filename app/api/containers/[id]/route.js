import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
        return Response.json({ error: 'Container ID is required' }, { status: 400 })
    }

    try {
        const docker = await getDockerClient()
        const container = docker.getContainer(id)
        const inspectData = await container.inspect()

        return Response.json(inspectData)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
