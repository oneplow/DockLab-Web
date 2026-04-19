import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDockerClient } from '@/lib/docker/service'

/**
 * Strip Docker multiplexed stream 8-byte headers from log output.
 * Docker header format: [STREAM_TYPE(1), 0, 0, 0, SIZE(4 bytes big-endian)]
 * Stream types: 0=stdin, 1=stdout, 2=stderr
 */
function stripDockerHeaders(buffer) {
    // If it's already a string (docklab-server proxy), do basic cleanup
    if (typeof buffer === 'string') {
        return buffer
            .split('\n')
            .map(line => line.replace(/^[\x00-\x09\x0B-\x1F\x7F]{1,8}/, ''))
            .filter(line => line.trim().length > 0)
    }

    // Buffer-level parsing for proper Docker multiplex header stripping
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    const lines = []
    let offset = 0

    while (offset < buf.length) {
        // Check if we have a Docker multiplex header (8 bytes)
        // Byte 0 must be 0, 1, or 2 (stdin/stdout/stderr)
        if (offset + 8 <= buf.length && buf[offset] <= 2 && buf[offset + 1] === 0 && buf[offset + 2] === 0 && buf[offset + 3] === 0) {
            const frameSize = buf.readUInt32BE(offset + 4)
            if (frameSize > 0 && offset + 8 + frameSize <= buf.length) {
                const frameData = buf.slice(offset + 8, offset + 8 + frameSize).toString('utf8')
                lines.push(frameData)
                offset += 8 + frameSize
                continue
            }
        }

        // Fallback: read until next header or end of buffer
        let end = offset + 1
        while (end < buf.length) {
            if (end + 8 <= buf.length && buf[end] <= 2 && buf[end + 1] === 0 && buf[end + 2] === 0 && buf[end + 3] === 0) {
                break
            }
            end++
        }
        const chunk = buf.slice(offset, end).toString('utf8')
        if (chunk.trim()) lines.push(chunk)
        offset = end
    }

    // Join all frames, split by newlines, clean up
    return lines.join('')
        .split('\n')
        // Match start of line, grab any 0-8 chunk of invalid docker multiplex headers or stray junk (like `z`, `b`, \uFFFD)
        // just before the standard timestamp (like 2024-, 2025-, 2026-) and strip it.
        // If there's no timestamp, just strip the non-printable docker headers.
        .map(line => {
            // Match any 1-8 stray characters at the VERY BEGINNING of the line followed immediately by a timestamp
            // Also cleans out any Unicode replacement characters (\uFFFD)
            let cleaned = line.replace(/^.{1,8}?(\d{4}-\d{2}-\d{2}T)/, '$1').replace(/\uFFFD/g, '')

            // If it still has docker multiplex headers (non-printables), strip those
            cleaned = cleaned.replace(/^[\x00-\x09\x0B-\x1F\x7F]+/, '')

            return cleaned.trimEnd()
        })
        .filter(line => line.trim().length > 0)
}

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions)
    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
        return Response.json({ error: 'Container ID is required' }, { status: 400 })
    }

    try {
        const docker = await getDockerClient()
        const container = docker.getContainer(id)

        // Fetch last 500 lines of logs
        const logs = await container.logs({
            stdout: true,
            stderr: true,
            timestamps: true,
            tail: 500
        })

        const cleanLogs = stripDockerHeaders(logs)

        let processedLogs = cleanLogs

        // Hide sensitive info for viewer role
        if (session.user?.role === 'viewer') {
            processedLogs = cleanLogs.map(line => {
                // Catch standard formats: api_key=123, secret:"456", API Key:
                return line.replace(/(api_key|apikey|api-key|secret|password|token|bearer|auth|api key)(["']?\s*[:=]\s*["']?)([a-zA-Z0-9_\-]{8,})/gi, '$1$2********')
            })
        }

        return Response.json({ logs: processedLogs })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
