import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin and Developer can see the setting
    return NextResponse.json({
        socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    })
}
