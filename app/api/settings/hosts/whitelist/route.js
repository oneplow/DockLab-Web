import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { createDocklabServerProxy } from '@/lib/docker/service' // Wait, I need to check if createDocklabServerProxy is exported

// I should probably use getDockerClient or similar but I need it to be for a SPECIFIC hostId
async function getDocklabServerClient(hostId) {
    const host = await prisma.dockerHost.findUnique({ where: { id: hostId } })
    if (!host || host.connectionType !== 'docklab-server') throw new Error('Invalid Docklab-server host')

    // We can manually call the proxy creator or use the existing one if we refactor it to be exportable
    // For now, I'll assume I can get it or I'll refactor service.js to export it
    return host
}

export async function GET(req) {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'developer')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const hostId = searchParams.get('hostId')
        if (!hostId) return NextResponse.json({ error: 'hostId is required' }, { status: 400 })

        const host = await prisma.dockerHost.findUnique({ where: { id: hostId } })
        if (!host || host.connectionType !== 'docklab-server') {
            return NextResponse.json({ error: 'Not a Docklab-server host' }, { status: 400 })
        }

        // We need a way to call getWhitelist on this specific host
        // Let's refactor service.js to export a way to get a proxy for a specific host
        // For now, I'll use a fetch directly here to simplify
        const res = await fetch(`${host.socketPath}/api/system/whitelist`, {
            headers: { 'Authorization': `Bearer ${host.apiKey}` }
        })
        const data = await res.json()
        return NextResponse.json(data)
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
        const { hostId, whitelist } = await req.json()
        if (!hostId || !Array.isArray(whitelist)) {
            return NextResponse.json({ error: 'hostId and whitelist array are required' }, { status: 400 })
        }

        const host = await prisma.dockerHost.findUnique({ where: { id: hostId } })
        if (!host || host.connectionType !== 'docklab-server') {
            return NextResponse.json({ error: 'Not a Docklab-server host' }, { status: 400 })
        }

        const res = await fetch(`${host.socketPath}/api/system/whitelist`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${host.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ whitelist })
        })
        const data = await res.json()
        return NextResponse.json(data)
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
