import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getActiveOperations, cancelOperation, cleanupOperations } from '@/lib/operations'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        // Clean up old completed operations periodically
        await cleanupOperations()

        const operations = await getActiveOperations(session.user.id)
        return Response.json(operations)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return Response.json({ error: 'Missing operation id' }, { status: 400 })

        const op = await cancelOperation(id)
        return Response.json(op)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
