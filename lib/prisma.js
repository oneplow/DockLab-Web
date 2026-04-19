import { PrismaClient } from "@prisma/client"

const globalForPrisma = global

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// Start background workers
if (!globalForPrisma.webhookMonitorStarted && typeof window === 'undefined') {
    globalForPrisma.webhookMonitorStarted = true
    import('./webhooks/monitor').then(m => m.startMonitor()).catch(e => console.error(e))
}
