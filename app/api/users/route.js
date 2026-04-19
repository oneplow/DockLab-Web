import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true },
            orderBy: { email: 'asc' }
        })
        return Response.json(users)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function PATCH(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const { userId, role } = await request.json()
        const user = await prisma.user.update({
            where: { id: userId },
            data: { role }
        })
        return Response.json({ success: true, user })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user.role)) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const { userId } = await request.json()
        await prisma.user.delete({ where: { id: userId } })
        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
