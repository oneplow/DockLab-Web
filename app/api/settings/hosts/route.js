import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/crypto'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const hosts = await prisma.dockerHost.findMany({
            orderBy: { createdAt: 'desc' },
            // Viewers only get id + name (enough for Topbar display)
            ...(session.user?.role === 'viewer' ? {
                select: { id: true, name: true, connectionType: true }
            } : {})
        })
        // Mask API keys — never expose to client
        const safeHosts = hosts.map(h => ({
            ...h,
            apiKey: h.apiKey ? '••••••••' : null,
        }))
        return NextResponse.json(safeHosts)
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function POST(req) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { name, socketPath, isLocal, connectionType, apiKey } = await req.json()
        if (!name || !socketPath) return NextResponse.json({ error: 'Name and Socket Path/URL are required' }, { status: 400 })

        const newHost = await prisma.dockerHost.create({
            data: {
                name,
                socketPath,
                isLocal: !!isLocal,
                connectionType: connectionType || 'tcp',
                apiKey: apiKey ? encrypt(apiKey) : null,
                addedById: session.user.id
            }
        })

        return NextResponse.json(newHost)
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function PATCH(req) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'developer')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id, name } = await req.json()
        if (!id || !name) return NextResponse.json({ error: 'ID and Name are required' }, { status: 400 })

        const updatedHost = await prisma.dockerHost.update({
            where: { id },
            data: { name }
        })

        return NextResponse.json(updatedHost)
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function DELETE(req) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'developer')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await req.json()
        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        // Get host info to check if we need to reset docklab-server key
        const host = await prisma.dockerHost.findUnique({ where: { id } })

        if (host && host.connectionType === 'docklab-server') {
            try {
                // Try to reset key on the agent. We don't block deletion if this fails 
                // (e.g. if the agent is already offline), but we try our best.
                const resetUrl = `${host.socketPath}/api/system/reset-key`
                await fetch(resetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${decrypt(host.apiKey)}` // Standard Auth header
                    },
                    body: JSON.stringify({ currentApiKey: decrypt(host.apiKey) })
                })
                console.log(`[Docklab] Requested API key reset for docklab-server host: ${host.name}`)
            } catch (err) {
                console.warn(`[Docklab] Failed to reset API key for host ${host.name} during deletion:`, err.message)
            }
        }

        await prisma.dockerHost.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
