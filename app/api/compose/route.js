import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers can only view resources' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { composeYaml, action = 'up', projectName = 'docklab-stack' } = body

        if (!composeYaml) {
            return Response.json({ error: 'Missing composeYaml' }, { status: 400 })
        }

        // Get the active Docker host (same cookie as getDockerClient)
        let host = null
        try {
            const cookieStore = await cookies()
            const hostId = cookieStore.get('docklab_host_id')?.value
            if (hostId) {
                host = await prisma.dockerHost.findUnique({ where: { id: hostId } })
            }
        } catch (e) { }
        if (!host) {
            // Fallback to first available host
            host = await prisma.dockerHost.findFirst()
        }

        if (!host) {
            return Response.json({ error: 'No Docker host configured. Add one in Settings.' }, { status: 400 })
        }

        if (host.connectionType === 'docklab-server') {
            // Proxy compose through docklab-server daemon on the remote host
            const docklabServerUrl = host.socketPath.replace(/\/+$/, '')
            const res = await fetch(`${docklabServerUrl}/api/stacks/compose`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${host.apiKey || ''}`,
                },
                body: JSON.stringify({ composeYaml, action, projectName }),
            })

            const data = await res.json()
            if (!res.ok) {
                return Response.json({ error: data.error || 'Compose failed on remote host' }, { status: res.status })
            }

            await logAudit(session, `compose.${action}`, projectName, `via docklab-server ${host.name}`)
            return Response.json(data)
        } else {
            // TCP Direct host — no CLI available, compose not supported
            return Response.json({
                error: 'Docker Compose is only supported on Docklab-server Agent hosts. TCP Direct hosts do not have docker CLI access. Please switch to a Docklab-server-connected host in Settings.'
            }, { status: 400 })
        }

    } catch (err) {
        return Response.json({ error: err.message || 'Execution failed' }, { status: 500 })
    }
}
