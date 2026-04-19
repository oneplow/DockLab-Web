import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    // Only admins can view others' access control settings
    if (!session || session.user?.role !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id: userId } = await params
        const url = new URL(request.url)
        const hostId = url.searchParams.get('hostId')

        if (!hostId) return Response.json({ error: 'hostId is required' }, { status: 400 })

        const access = await prisma.containerAccess.findMany({
            where: { userId, dockerHostId: hostId }
        })

        return Response.json(access)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id: userId } = await params
        const { hostId, containerIds } = await request.json()

        if (!hostId || !Array.isArray(containerIds)) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
        }

        // Use a transaction: Delete existing access for this host for this user, then insert new ones
        await prisma.$transaction([
            prisma.containerAccess.deleteMany({
                where: { userId, dockerHostId: hostId }
            }),
            prisma.containerAccess.createMany({
                data: containerIds.map(containerId => ({
                    userId,
                    dockerHostId: hostId,
                    containerId
                }))
            })
        ])

        return Response.json({ success: true })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
