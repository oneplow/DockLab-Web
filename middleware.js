import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

function rateLimitResponse(result) {
    return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            },
        }
    )
}

export default withAuth(
    function middleware(req) {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip')
            || req.ip
            || '127.0.0.1'

        const { pathname } = req.nextUrl

        // Rate limit for login attempts
        if (pathname.startsWith('/login')) {
            const result = rateLimit(`login:${ip}`, { windowMs: 60_000, max: 20 })
            if (!result.allowed) return rateLimitResponse(result)
        }

        // Rate limit for auth routes — higher because NextAuth polls /api/auth/session frequently
        if (pathname.startsWith('/api/auth')) {
            const result = rateLimit(`auth:${ip}`, { windowMs: 60_000, max: 200 })
            if (!result.allowed) return rateLimitResponse(result)
        }

        // General API rate limit
        if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
            // API requests can be bursty on the dashboard (multiple components fetching at once)
            const result = rateLimit(`api:${ip}`, { windowMs: 60_000, max: 300 })
            if (!result.allowed) return rateLimitResponse(result)
        }

        return NextResponse.next()
    },
    {
        callbacks: {
            authorized: ({ req, token }) => {
                const path = req.nextUrl.pathname
                // Allow public access to login and auth API
                if (path.startsWith('/login') || path.startsWith('/api/auth')) {
                    return true
                }
                // All other matched routes require authentication
                return !!token
            }
        }
    }
)

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
