import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listImages, pullImage, removeImage } from '@/lib/docker/service'
import { logAudit } from '@/lib/audit'
import { createOperation, completeOperation, failOperation } from '@/lib/operations'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const images = await listImages()
        return Response.json(images)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // RBAC Security: Viewers cannot mutate image state
    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers can only view resources' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { action, image } = body

        if (action === 'pull') {
            // Create a persistent operation for the pull
            const op = await createOperation({
                type: 'pull_image',
                message: `Pulling ${image}...`,
                description: 'Downloading from Docker Hub',
                userId: session.user?.id,
            })

            try {
                await pullImage(image)
                await completeOperation(op.id, `Pulled ${image}`)
                await logAudit(session, 'image.pull', image)
            } catch (pullErr) {
                await failOperation(op.id, pullErr.message)
                throw pullErr
            }
        } else if (action === 'remove') {
            await removeImage(image)
            await logAudit(session, 'image.remove', image)
        }

        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
