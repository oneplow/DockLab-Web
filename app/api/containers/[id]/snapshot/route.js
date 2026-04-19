import { getDockerClient } from '@/lib/docker/service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { logAudit } from '@/lib/audit'

export async function POST(req, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params
        const { repo, tag, comment } = await req.json()

        if (!id || !repo) {
            return Response.json({ error: 'Container ID and Repository name are required' }, { status: 400 })
        }

        const docker = await getDockerClient()
        const container = docker.getContainer(id)

        // Ensure container exists
        await container.inspect()

        const commitOpts = {
            repo,
            tag: tag || 'latest',
            comment: comment || `Snapshot of ${id}`
        }

        const data = await container.commit(commitOpts)

        await logAudit(session, 'container.snapshot', id, `Created image: ${repo}:${commitOpts.tag}`)

        return Response.json({ success: true, imageId: data.Id })
    } catch (e) {
        console.error('Snapshot Error:', e)
        return Response.json({ error: e.message }, { status: 500 })
    }
}
