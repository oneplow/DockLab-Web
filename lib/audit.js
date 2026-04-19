import { prisma } from '@/lib/prisma'

/**
 * Log an audit event to the database
 * @param {object} session - NextAuth session object
 * @param {string} action - Action identifier, e.g. "container.start"
 * @param {string} target - Target resource name, e.g. "my-nginx"
 * @param {string} [details] - Optional extra details
 */
export async function logAudit(session, action, target, details = null) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: session?.user?.id || null,
                userName: session?.user?.name || session?.user?.email || 'Unknown',
                userImage: session?.user?.image || null,
                action,
                target,
                details,
            }
        })
    } catch (err) {
        // Audit logging should never break the main flow
        console.error('Audit log error:', err.message)
    }
}
