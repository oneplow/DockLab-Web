import { prisma } from '@/lib/prisma'
import { getDockerClientForHost } from '@/lib/docker/service'
import { dispatchWebhook } from './dispatcher'

// Track containers we've already alerted about to avoid spamming
const alertedContainers = new Set()
let intervalId = null

export function startMonitor() {
    if (intervalId) return
    console.log('[Webhook Monitor] Starting background task...')

    // Check every 30 seconds
    intervalId = setInterval(checkHosts, 30000)
    // Run an initial check immediately
    checkHosts()
}

async function checkHosts() {
    try {
        const hosts = await prisma.dockerHost.findMany()

        for (const host of hosts) {
            try {
                const docker = await getDockerClientForHost(host)
                const containers = await docker.listContainers({ all: true })

                const currentContainerIds = new Set()

                for (const c of containers) {
                    currentContainerIds.add(c.Id)

                    // Determine if crashed
                    const isCrashed = c.State === 'exited' && !c.Status.includes('Exited (0)')
                    const isRestarting = c.State === 'restarting'

                    if (isCrashed || isRestarting) {
                        if (!alertedContainers.has(c.Id)) {
                            // First time noticing this crash
                            alertedContainers.add(c.Id)

                            const name = c.Names[0]?.replace('/', '') || c.Id.slice(0, 12)
                            const title = `🚨 Container ${isRestarting ? 'Crash-Looping' : 'Crashed'}!`
                            const msg = `**Container**: ${name}\n**Host**: ${host.name}\n**Image**: ${c.Image}\n**Status**: ${c.Status}`

                            await dispatchWebhook('crash', title, msg)
                        }
                    } else {
                        // If it came back online or is healthy, remove from alerted set so it can trigger again later
                        if (alertedContainers.has(c.Id)) {
                            alertedContainers.delete(c.Id)

                            const name = c.Names[0]?.replace('/', '') || c.Id.slice(0, 12)
                            await dispatchWebhook('start', '✅ Container Recovered', `**Container**: ${name} on ${host.name} is now healthy.`)
                        }
                    }
                }

                // Cleanup removed containers from memory
                for (const id of alertedContainers) {
                    if (!currentContainerIds.has(id)) {
                        alertedContainers.delete(id)
                    }
                }

            } catch (err) {
                // Silently skip hosts that are offline right now
            }
        }
    } catch (err) {
        console.error('[Webhook Monitor] DB Error:', err.message)
    }
}
