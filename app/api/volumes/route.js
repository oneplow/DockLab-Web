import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listVolumes, createVolume, removeVolume } from '@/lib/docker/service'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const volumes = await listVolumes()
        return Response.json(volumes)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers can only view resources' }, { status: 403 })
    }

    try {
        let body
        try {
            body = await request.json()
        } catch {
            return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { action, name } = body

        if (!action) {
            return Response.json({ error: 'Missing action' }, { status: 400 })
        }

        if (action === 'create') {
            await createVolume(name)
        } else if (action === 'remove') {
            if (!name) return Response.json({ error: 'Missing volume name' }, { status: 400 })
            await removeVolume(name)
        } else {
            return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
        }

        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message || 'Internal server error' }, { status: 500 })
    }
}
