import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    trustHost: true,
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            checks: ['pkce', 'none'], // Downgrade state check for LAN testing ease
        }),
    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async session({ session, token }) {
            if (session?.user && token) {
                session.user.id = token.sub || token.id
                session.user.role = token.role || 'developer'
            }
            return session
        },
        async jwt({ token, profile, user }) {
            // Initial sign in
            if (user) {
                token.id = user.id
                token.role = user.role || 'developer'
            }
            if (profile && !token.role) {
                const adminEmails = (process.env.ADMIN_EMAILS || '').split(',')
                token.role = adminEmails.includes(token.email) ? 'admin' : 'developer'
            }
            // Continuous session verification - check DB for latest role
            if (token.email) {
                try {
                    const dbUser = await prisma.user.findUnique({ where: { email: token.email } })
                    if (dbUser) {
                        token.role = dbUser.role
                    }
                } catch (err) {
                    console.error('Error fetching user for JWT update', err)
                }
            }
            return token
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
