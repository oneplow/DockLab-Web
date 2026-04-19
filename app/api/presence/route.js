import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'

const globalForPresence = globalThis;
if (!globalForPresence.activeUsers) {
    globalForPresence.activeUsers = new Map();
}
const activeUsers = globalForPresence.activeUsers;

export async function POST(req) {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body = {};
    try { body = await req.json(); } catch (e) { }

    const uid = session.user.id || session.user.email;
    activeUsers.set(uid, {
        id: uid,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: session.user.role,
        path: body.path || '/',
        lastSeen: Date.now()
    })

    // Cleanup users older than 15s (polling is every 10s)
    const now = Date.now();
    for (const [id, data] of activeUsers.entries()) {
        if (now - data.lastSeen > 20000) activeUsers.delete(id);
    }

    return NextResponse.json(Array.from(activeUsers.values()))
}
