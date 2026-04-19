import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    try {
        const docker = await getDockerClient()
        const container = docker.getContainer(id)
        const inspect = await container.inspect()

        const config = inspect.Config || {}
        const hostConfig = inspect.HostConfig || {}
        const networkSettings = inspect.NetworkSettings || {}

        // Build docker-compose.yml
        const serviceName = inspect.Name.replace('/', '') || 'app'
        const service = {}

        // Image
        service.image = config.Image

        // Container name
        service.container_name = serviceName

        // Ports
        const portBindings = hostConfig.PortBindings || {}
        const ports = []
        for (const [containerPort, bindings] of Object.entries(portBindings)) {
            if (bindings) {
                for (const b of bindings) {
                    const cp = containerPort.replace('/tcp', '').replace('/udp', '')
                    ports.push(`${b.HostPort}:${cp}`)
                }
            }
        }
        if (ports.length > 0) service.ports = ports

        // Environment
        if (config.Env && config.Env.length > 0) {
            service.environment = config.Env
        }

        // Volumes
        const mounts = inspect.Mounts || []
        const volumes = []
        for (const m of mounts) {
            if (m.Type === 'volume') {
                volumes.push(`${m.Name}:${m.Destination}`)
            } else if (m.Type === 'bind') {
                volumes.push(`${m.Source}:${m.Destination}`)
            }
        }
        if (volumes.length > 0) service.volumes = volumes

        // Restart policy
        if (hostConfig.RestartPolicy && hostConfig.RestartPolicy.Name && hostConfig.RestartPolicy.Name !== 'no') {
            service.restart = hostConfig.RestartPolicy.Name
        }

        // Network mode
        if (hostConfig.NetworkMode && hostConfig.NetworkMode !== 'default' && hostConfig.NetworkMode !== 'bridge') {
            service.network_mode = hostConfig.NetworkMode
        }

        // Command
        if (config.Cmd && config.Cmd.length > 0) {
            service.command = config.Cmd.join(' ')
        }

        const compose = {
            services: { [serviceName]: service }
        }

        // Add named volumes at top level
        const namedVolumes = mounts.filter(m => m.Type === 'volume').map(m => m.Name)
        if (namedVolumes.length > 0) {
            compose.volumes = {}
            for (const v of namedVolumes) {
                compose.volumes[v] = null
            }
        }

        // Convert to YAML manually (simple)
        let yaml = ''
        yaml += `services:\n`
        yaml += `  ${serviceName}:\n`
        yaml += `    image: ${service.image}\n`
        yaml += `    container_name: ${service.container_name}\n`
        if (service.ports) {
            yaml += `    ports:\n`
            for (const p of service.ports) yaml += `      - "${p}"\n`
        }
        if (service.environment) {
            yaml += `    environment:\n`
            for (const e of service.environment) yaml += `      - ${e}\n`
        }
        if (service.volumes) {
            yaml += `    volumes:\n`
            for (const v of service.volumes) yaml += `      - ${v}\n`
        }
        if (service.restart) yaml += `    restart: ${service.restart}\n`
        if (service.network_mode) yaml += `    network_mode: ${service.network_mode}\n`
        if (service.command) yaml += `    command: ${service.command}\n`

        if (namedVolumes.length > 0) {
            yaml += `\nvolumes:\n`
            for (const v of namedVolumes) yaml += `  ${v}:\n`
        }

        return Response.json({ yaml, compose })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
