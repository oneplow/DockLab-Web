import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'
import { createOperation, updateOperation, completeOperation, failOperation } from '@/lib/operations'

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // RBAC Security: Viewers cannot deploy templates
    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers cannot deploy templates' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { composeYaml } = body

        // Parsing basic details (highly simplified)
        const imageMatch = composeYaml.match(/image:\s*([^\s]+)/)
        const portMatch = composeYaml.match(/- "(\d+):(\d+)"/)

        if (imageMatch) {
            const imageName = imageMatch[1]
            const docker = await getDockerClient()

            // Create persistent operation
            const op = await createOperation({
                type: 'deploy_template',
                message: `Deploying ${imageName}...`,
                description: 'Pulling image and creating container',
                userId: session.user?.id,
            })

            try {
                // 1. Pull image first (docklab-server handles pull inside createContainer)
                if (!docker._isDocklabServerProxy) {
                    await updateOperation(op.id, { progress: 20, description: `Pulling ${imageName}...` })
                    await new Promise((resolve, reject) => {
                        docker.pull(imageName, (err, stream) => {
                            if (err) return reject(err)
                            docker.modem.followProgress(stream, resolve)
                        })
                    })
                }

                await updateOperation(op.id, { progress: 60, description: 'Creating container...' })

                // 2. Setup ports
                const ExposedPorts = {}
                const PortBindings = {}

                if (portMatch) {
                    const hostPort = portMatch[1]
                    const containerPort = portMatch[2]
                    ExposedPorts[`${containerPort}/tcp`] = {}
                    PortBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }]
                }

                // 3. Create & Start
                const container = await docker.createContainer({
                    Image: imageName,
                    ExposedPorts,
                    HostConfig: {
                        PortBindings
                    }
                })

                await container.start()
                await completeOperation(op.id, `Deployed ${imageName}`)
                return Response.json({ success: true, containerId: container.id })
            } catch (deployErr) {
                await failOperation(op.id, deployErr.message)
                throw deployErr
            }
        }

        throw new Error("Could not parse image from template")
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
