import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

export async function GET(request) {
    const session = await getServerSession(authOptions)
    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const image = searchParams.get('image')

    if (!image) {
        return Response.json({ error: 'Image parameter is required' }, { status: 400 })
    }

    try {
        const docker = await getDockerClient()
        const imageInspect = await docker.getImage(image).inspect()

        let exposedPorts = []
        if (imageInspect.Config?.ExposedPorts) {
            // Docker returns ports as {"80/tcp": {}, "443/tcp": {}}
            exposedPorts = Object.keys(imageInspect.Config.ExposedPorts).map(p => p.split('/')[0])
        }

        return Response.json({ ports: exposedPorts })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
