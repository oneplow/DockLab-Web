import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

/**
 * POST /api/settings/hosts/test
 * Test connection to a docklab-server agent or Docker TCP endpoint
 * Body: { url, apiKey, connectionType }
 */
export async function POST(req) {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role === 'viewer') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { url, apiKey, connectionType } = await req.json()

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }

        if (connectionType === 'docklab-server') {
            // Test docklab-server connection
            if (!apiKey) {
                return NextResponse.json({ error: 'API Key is required for docklab-server connections' }, { status: 400 })
            }

            const pingUrl = url.replace(/\/+$/, '') + '/api/ping'

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

            try {
                const response = await fetch(pingUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    },
                    signal: controller.signal
                })

                clearTimeout(timeout)

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}))
                    return NextResponse.json({
                        success: false,
                        error: errorData.message || `Connection failed with status ${response.status}`
                    }, { status: 400 })
                }

                const data = await response.json()
                return NextResponse.json({
                    success: true,
                    docker: data.docker,
                    'docklab-server': ['docklab-server'],
                })
            } catch (fetchErr) {
                clearTimeout(timeout)
                if (fetchErr.name === 'AbortError') {
                    return NextResponse.json({ success: false, error: 'Connection timed out (10s)' }, { status: 408 })
                }
                return NextResponse.json({ success: false, error: fetchErr.message }, { status: 400 })
            }
        } else {
            // Test TCP Docker connection
            const Docker = (await import('dockerode')).default
            const parsedUrl = new URL(url.replace('tcp://', 'http://'))
            const docker = new Docker({ host: parsedUrl.hostname, port: parsedUrl.port || 2375 })

            const version = await docker.version()
            return NextResponse.json({
                success: true,
                docker: {
                    version: version.Version,
                    apiVersion: version.ApiVersion,
                    os: version.Os,
                    arch: version.Arch,
                }
            })
        }
    } catch (e) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }
}
