import { getDockerClient } from '@/lib/docker/service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { logAudit } from '@/lib/audit'

export async function POST(req, { params }) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { env, ports, restartPolicy, mounts, network } = await req.json()

    try {
        const docker = await getDockerClient()
        const oldContainer = docker.getContainer(id)
        const inspectData = await oldContainer.inspect()

        const name = inspectData.Name.replace(/^\//, '')
        const image = inspectData.Config.Image

        // Process Ports mapping into Docker Engine API format
        const portBindings = {}
        const exposedPorts = {}

        if (ports && Array.isArray(ports)) {
            ports.forEach(p => {
                if (p.containerPort) {
                    const protocol = p.protocol || 'tcp'
                    const cPortString = `${p.containerPort}/${protocol}`
                    exposedPorts[cPortString] = {}

                    if (p.hostPort) {
                        portBindings[cPortString] = [{ HostPort: String(p.hostPort) }]
                    }
                }
            })
        }

        // Process Mounts mapping
        const binds = []
        if (mounts && Array.isArray(mounts)) {
            mounts.forEach(m => {
                if (m.source && m.destination) {
                    binds.push(`${m.source}:${m.destination}`)
                }
            })
        }

        // Merge existing config with updates
        const newConfig = {
            Image: image,
            name: name,
            Env: env || inspectData.Config.Env,
            Cmd: inspectData.Config.Cmd,
            Entrypoint: inspectData.Config.Entrypoint,
            WorkingDir: inspectData.Config.WorkingDir,
            Labels: inspectData.Config.Labels,
            // Only update exposed ports if ports array was explicitly given, else keep old
            ExposedPorts: ports ? exposedPorts : inspectData.Config.ExposedPorts,
            HostConfig: {
                ...inspectData.HostConfig,
                PortBindings: ports ? portBindings : inspectData.HostConfig.PortBindings,
                Binds: mounts ? binds : inspectData.HostConfig.Binds,
                RestartPolicy: restartPolicy ? { Name: restartPolicy } : inspectData.HostConfig.RestartPolicy,
            }
        }

        // Process Network settings
        if (network) {
            newConfig.NetworkingConfig = {
                EndpointsConfig: {
                    [network]: {}
                }
            }
        } else if (inspectData.NetworkSettings && inspectData.NetworkSettings.Networks) {
            newConfig.NetworkingConfig = {
                EndpointsConfig: inspectData.NetworkSettings.Networks
            }
        }

        // 1. Stop and remove the old container
        if (inspectData.State.Running) {
            await oldContainer.stop()
        }
        await oldContainer.remove({ force: true })

        // 2. Create the new container
        const newContainer = await docker.createContainer(newConfig)

        // 3. Start the newly created container
        await newContainer.start()

        await logAudit(session, 'container.recreate', name, `Old ID: ${id}`)
        return Response.json({ success: true, newId: newContainer.id })
    } catch (e) {
        console.error('Recreate Error:', e)
        return Response.json({ error: e.message }, { status: 500 })
    }
}
