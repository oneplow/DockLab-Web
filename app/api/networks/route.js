import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listNetworks, createNetwork, removeNetwork } from '@/lib/docker/service'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const networks = await listNetworks()
        return Response.json(networks)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // RBAC Security: Viewers cannot mutate network state
    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers can only view resources' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { action, name, id } = body

        if (action === 'create') {
            await createNetwork(name)
        } else if (action === 'remove') {
            await removeNetwork(id)
        }

        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
