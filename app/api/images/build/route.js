import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

export const dynamic = 'force-dynamic'

export async function POST(req) {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })
    if (session.user?.role === 'viewer') return new Response('Forbidden', { status: 403 })

    try {
        const { dockerfile, tag } = await req.json()
        if (!dockerfile || !tag) return new Response('Missing dockerfile or tag', { status: 400 })

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docklab-build-'))
        await fs.writeFile(path.join(tempDir, 'Dockerfile'), dockerfile, 'utf8')

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            start(controller) {
                const child = spawn('docker', ['build', '-t', tag, '.'], { cwd: tempDir })

                const pushData = (data) => {
                    const lines = data.toString().split('\n')
                    for (const line of lines) {
                        if (line) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: line })}\n\n`))
                        }
                    }
                }

                child.stdout.on('data', pushData)
                child.stderr.on('data', pushData)

                child.on('close', async (code) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, code })}\n\n`))
                    controller.close()
                    // Cleanup temp dir
                    try {
                        await fs.rm(tempDir, { recursive: true, force: true })
                    } catch (e) { }
                })

                child.on('error', async (err) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
                    controller.close()
                    try {
                        await fs.rm(tempDir, { recursive: true, force: true })
                    } catch (e) { }
                })
            }
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            },
        })
    } catch (err) {
        return new Response(err.message, { status: 500 })
    }
}
