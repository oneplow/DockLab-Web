import { getDockerClient } from '@/lib/docker/service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// Use global to persist across Next.js dev reloads
if (!global.__terminalSessions) {
    global.__terminalSessions = new Map()
}

export const dynamic = 'force-dynamic'

export async function GET(req) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal || sessionLocal.user?.role === 'viewer') return new Response('Unauthorized', { status: 401 })

    const { searchParams } = new URL(req.url)
    const containerId = searchParams.get('id')
    const sessionId = searchParams.get('sessionId')

    if (!containerId || !sessionId) return new Response('Missing id or sessionId', { status: 400 })

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            let controllerClosed = false

            const safeEnqueue = (chunk) => {
                if (!controllerClosed) {
                    try { controller.enqueue(chunk) } catch { controllerClosed = true }
                }
            }
            const safeClose = () => {
                if (!controllerClosed) {
                    controllerClosed = true
                    try { controller.close() } catch { }
                }
            }

            try {
                const docker = await getDockerClient()
                const container = docker.getContainer(containerId)

                // Fallback to /bin/sh if bash is missing
                const exec = await container.exec({
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    Tty: true,
                    Cmd: ['/bin/sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi']
                })

                const execStream = await exec.start({ stdin: true, hijack: true })

                global.__terminalSessions.set(sessionId, { stream: execStream })

                // Fire and forget audit log
                import('@/lib/audit').then(({ logAudit }) => {
                    logAudit(sessionLocal, 'terminal.session', containerId)
                }).catch(() => { })

                const pushData = (data) => {
                    let text = data.toString('utf-8')

                    // Intercept OCI runtime errors for distroless/scratch containers
                    if (text.includes('no such file or directory') && text.includes('/bin/sh')) {
                        text += '\r\n\x1b[33m[Docklab] This container appears to be a minimal or "distroless" image.\r\nIt does not have a shell (like /bin/sh or bash) installed.\r\nTerminal access is not possible in this container.\x1b[0m\r\n'
                    }

                    const b64 = Buffer.from(text).toString('base64')
                    safeEnqueue(encoder.encode(`data: ${b64}\n\n`))
                }

                execStream.on('data', pushData)

                execStream.on('end', () => {
                    safeClose()
                    global.__terminalSessions.delete(sessionId)
                })

                execStream.on('error', (err) => {
                    const b64 = Buffer.from(`\r\n\x1b[31mTerminal Error: ${err.message}\x1b[0m\r\n`).toString('base64')
                    safeEnqueue(encoder.encode(`data: ${b64}\n\n`))
                })

            } catch (err) {
                const b64 = Buffer.from(`\r\n\x1b[31mFailed to start terminal: ${err.message}\x1b[0m\r\n`).toString('base64')
                safeEnqueue(encoder.encode(`data: ${b64}\n\n`))
                safeClose()
                global.__terminalSessions.delete(sessionId)
            }
        },
        cancel() {
            const session = global.__terminalSessions.get(sessionId)
            if (session) {
                try { session.stream.end() } catch (e) { }
                global.__terminalSessions.delete(sessionId)
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    })
}

export async function POST(req) {
    const sessionLocal = await getServerSession(authOptions)
    if (!sessionLocal || sessionLocal.user?.role === 'viewer') return new Response('Unauthorized', { status: 401 })

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) return new Response('Missing sessionId', { status: 400 })

    const sessionRef = global.__terminalSessions.get(sessionId)
    if (!sessionRef) return new Response('Session not found or expired', { status: 404 })

    try {
        const { input } = await req.json()
        if (input && sessionRef.stream?.writable) {
            sessionRef.stream.write(input)
        }
        return new Response('OK', { status: 200 })
    } catch (err) {
        return new Response(err.message, { status: 500 })
    }
}
