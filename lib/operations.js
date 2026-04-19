import { prisma } from '@/lib/prisma'

/**
 * Create a new operation record.
 * Returns the operation object with its id.
 */
export async function createOperation({ type, message, description, userId, dockerHostId }) {
    return prisma.operation.create({
        data: {
            type,
            status: 'running',
            message,
            description: description || null,
            progress: 0,
            userId: userId || null,
            dockerHostId: dockerHostId || null,
        }
    })
}

/**
 * Update progress of an operation (0-100).
 * Also optionally update message/description.
 */
export async function updateOperation(id, { progress, message, description }) {
    const data = {}
    if (progress !== undefined) data.progress = Math.min(100, Math.max(0, progress))
    if (message !== undefined) data.message = message
    if (description !== undefined) data.description = description
    return prisma.operation.update({ where: { id }, data })
}

/**
 * Mark operation as completed successfully.
 */
export async function completeOperation(id, message) {
    return prisma.operation.update({
        where: { id },
        data: {
            status: 'success',
            progress: 100,
            ...(message ? { message } : {}),
        }
    })
}

/**
 * Mark operation as failed.
 */
export async function failOperation(id, errorMessage) {
    return prisma.operation.update({
        where: { id },
        data: {
            status: 'error',
            error: errorMessage,
        }
    })
}

/**
 * Cancel an operation.
 */
export async function cancelOperation(id) {
    return prisma.operation.update({
        where: { id },
        data: { status: 'cancelled' }
    })
}

/**
 * Get all active operations (running) + recently finished (last 10 seconds).
 */
export async function getActiveOperations(userId) {
    const tenSecondsAgo = new Date(Date.now() - 10_000)

    return prisma.operation.findMany({
        where: {
            OR: [
                // All running operations
                { status: 'running' },
                // Recently completed/failed/cancelled (show briefly before disappearing)
                {
                    status: { in: ['success', 'error', 'cancelled'] },
                    updatedAt: { gte: tenSecondsAgo }
                }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    })
}

/**
 * Clean up old completed operations (older than 1 minute).
 * Call this periodically to keep the table small.
 */
export async function cleanupOperations() {
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    return prisma.operation.deleteMany({
        where: {
            status: { in: ['success', 'error', 'cancelled'] },
            updatedAt: { lt: oneMinuteAgo }
        }
    })
}
