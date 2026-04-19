import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const webhooks = await prisma.webhookSetting.findMany({
            orderBy: { createdAt: 'desc' }
        })
        return Response.json(webhooks)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { provider, name, url, events } = await request.json()

        if (!provider || !name || !url) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const newWebhook = await prisma.webhookSetting.create({
            data: { provider, name, url, events: events || 'crash' }
        })
        return Response.json(newWebhook)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function PATCH(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id, isActive } = await request.json()
        const updated = await prisma.webhookSetting.update({
            where: { id },
            data: { isActive }
        })
        return Response.json(updated)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

        await prisma.webhookSetting.delete({ where: { id } })
        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
