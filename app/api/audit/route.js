import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
    const session = await getServerSession(authOptions)
    if (!session || !['admin', 'developer'].includes(session.user?.role)) {
        return Response.json({ error: 'Unauthorized — admin/developer only' }, { status: 401 })
    }

    try {
        const url = new URL(request.url)
        const page = parseInt(url.searchParams.get('page') || '1')
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const actionFilter = url.searchParams.get('action') || null

        const where = actionFilter ? { action: { contains: actionFilter } } : {}

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.auditLog.count({ where })
        ])

        return Response.json({
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
