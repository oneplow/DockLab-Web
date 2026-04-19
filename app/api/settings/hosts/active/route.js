import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

// GET returns the current active host ID
// If no host is selected but hosts exist, auto-select the first one
export async function GET() {
    const cookieStore = await cookies()
    let hostId = cookieStore.get('docklab_host_id')?.value || null

    // Auto-select: if no active host cookie, pick the first available host
    if (!hostId) {
        try {
            const firstHost = await prisma.dockerHost.findFirst({
                orderBy: { createdAt: 'asc' },
                select: { id: true }
            })
            if (firstHost) {
                hostId = firstHost.id
                cookieStore.set('docklab_host_id', hostId, {
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                })
            }
        } catch (e) {
            console.warn('Auto-select host failed:', e.message)
        }
    }

    return NextResponse.json({ hostId })
}

// POST sets the active host ID
export async function POST(req) {
    try {
        const { hostId } = await req.json()
        const cookieStore = await cookies()

        if (hostId) {
            cookieStore.set('docklab_host_id', hostId, {
                path: '/',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            })
        } else {
            // Clear the cookie for local default
            cookieStore.delete('docklab_host_id')
        }

        return NextResponse.json({ success: true, hostId })
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
