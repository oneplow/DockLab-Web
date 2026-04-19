import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { listContainers, getDockerClient } from '@/lib/docker/service'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import os from 'os'
import { createOperation, updateOperation, completeOperation, failOperation } from '@/lib/operations'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const containers = await listContainers(session)
        return Response.json(containers)
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // RBAC Security: Viewers cannot mutate container state
    if (session.user?.role === 'viewer') {
        return Response.json({ error: 'Forbidden: Viewers can only view resources' }, { status: 403 })
    }

    const body = await request.json()
    const { action, containerId, image, name, ports, env, network, restartPolicy, volumes, command } = body

    try {
        const docker = await getDockerClient()

        if (action === 'create') {
            // Create persistent operation
            const op = await createOperation({
                type: 'create_container',
                message: `Creating ${name || image}...`,
                description: `Image: ${image}`,
                userId: session.user?.id,
            })

            try {
                // For docklab-server proxy, createContainer already handles pull+start
                if (!docker._isDocklabServerProxy) {
                    await updateOperation(op.id, { description: `Pulling ${image}...` })
                    // Pull image first (native Docker)
                    await new Promise((resolve, reject) => {
                        docker.pull(image, (err, stream) => {
                            if (err) return reject(err)
                            docker.modem.followProgress(stream, (err) => {
                                if (err) return reject(err)
                                resolve()
                            })
                        })
                    })
                    await updateOperation(op.id, { progress: 60, description: 'Creating container...' })
                }

                // Setup port bindings
                const ExposedPorts = {}
                const PortBindings = {}
                if (ports) {
                    const portMappings = ports.split(',').map(p => p.trim()).filter(Boolean)
                    for (const mapping of portMappings) {
                        const [hostPort, containerPort] = mapping.split(':')
                        if (hostPort && containerPort) {
                            ExposedPorts[`${containerPort}/tcp`] = {}
                            PortBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }]
                        }
                    }
                }

                // Setup Environment Variables
                let Env = []
                if (env) {
                    Env = env.split('\n')
                        .map(e => e.trim())
                        .filter(e => e.includes('='))
                }

                // Setup Volume Binds (expand ~ to home dir, Docker API needs absolute paths)
                let Binds = []
                if (volumes && Array.isArray(volumes)) {
                    const homeDir = os.homedir()
                    Binds = volumes.map(v => {
                        return v
                            .replace(/^~\//, homeDir + '/')
                            .replace(/^~\\\\/, homeDir + '\\\\')
                            .replace(/^~:/, homeDir + ':')
                            .replace(/:~\//, ':' + homeDir + '/')
                            .replace(/:~\\\\/, ':' + homeDir + '\\\\')
                    })
                }

                // Setup Command
                let Cmd = undefined
                if (command) {
                    Cmd = command.split(' ').filter(Boolean)
                }

                const containerOpts = {
                    Image: image,
                    ExposedPorts,
                    Env,
                    HostConfig: {
                        PortBindings,
                        Binds: Binds.length > 0 ? Binds : undefined,
                        RestartPolicy: { Name: restartPolicy || "no" },
                        NetworkMode: network || "bridge"
                    },
                }
                if (name) containerOpts.name = name
                if (Cmd) containerOpts.Cmd = Cmd

                const container = await docker.createContainer(containerOpts)
                await container.start()
                await logAudit(session, 'container.create', name || container.id, `Image: ${image}`)

                // Auto-grant access if developer created it so they don't lose visibility
                if (session.user?.role === 'developer') {
                    const cookieStore = await cookies()
                    let hostId = cookieStore.get('docklab_host_id')?.value
                    if (!hostId) {
                        const firstHost = await prisma.dockerHost.findFirst()
                        if (firstHost) hostId = firstHost.id
                    }
                    if (hostId) {
                        await prisma.containerAccess.create({
                            data: {
                                userId: session.user.id,
                                dockerHostId: hostId,
                                containerId: container.id.slice(0, 12)
                            }
                        })
                    }
                }

                await completeOperation(op.id, `Created ${name || container.id.slice(0, 12)}`)
                return Response.json({ success: true, containerId: container.id })
            } catch (createErr) {
                await failOperation(op.id, createErr.message)
                throw createErr
            }
        }

        const container = docker.getContainer(containerId)

        if (action === 'start') {
            await container.start()
            // Check if it immediately exited
            const inspectData = await container.inspect()
            if (!inspectData.State.Running) {
                // Fetch logs to see why it crashed
                const logs = await container.logs({ stdout: true, stderr: true, tail: 50 })
                const cleanLogs = logs.toString('utf8')
                    .split('\n')
                    .map(line => line.replace(/^[\u0000-\u0009\u000B-\u001F\u007F]+/, ''))
                    .filter(line => line.trim().length > 0)
                    .join('\n')
                throw new Error(`Container exited immediately. Logs:\n${cleanLogs || 'No logs available'}`)
            }
        }
        else if (action === 'stop') await container.stop()
        else if (action === 'restart') await container.restart()
        else if (action === 'remove') await container.remove({ force: true })
        await logAudit(session, `container.${action}`, containerId)
        return Response.json({ success: true, action, containerId })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

