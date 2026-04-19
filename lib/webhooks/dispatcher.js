import { prisma } from '@/lib/prisma'

/**
 * Dispatch an alert to all active webhooks listening to the specific event category 
 * @param {string} eventCategory 'crash', 'ram_spike', 'start', 'stop'
 * @param {string} title 
 * @param {string} message 
 */
export async function dispatchWebhook(eventCategory, title, message) {
    try {
        const hooks = await prisma.webhookSetting.findMany({
            where: { isActive: true }
        })

        const activeHooks = hooks.filter(hook => hook.events.split(',').includes(eventCategory))

        for (const hook of activeHooks) {
            try {
                if (hook.provider === 'discord') {
                    await fetch(hook.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: title,
                                description: message,
                                color: eventCategory === 'crash' || eventCategory === 'ram_spike' ? 16711680 : 65280, // Red : Green
                                timestamp: new Date().toISOString()
                            }]
                        })
                    })
                } else if (hook.provider === 'slack') {
                    await fetch(hook.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: `*${title}*\n${message}`
                        })
                    })
                } else if (hook.provider === 'line') {
                    // Line Notify: hook.url stores the access token (per UI design)
                    // The actual API endpoint is always https://notify-api.line.me/api/notify
                    const LINE_NOTIFY_URL = 'https://notify-api.line.me/api/notify'
                    const params = new URLSearchParams()
                    params.append('message', `\n${title}\n${message}`)
                    await fetch(LINE_NOTIFY_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Bearer ${hook.url}`
                        },
                        body: params.toString()
                    })
                }
            } catch (err) {
                console.error(`Failed to dispatch webhook to ${hook.provider}:`, err.message)
            }
        }
    } catch (err) {
        console.error('Webhook DB Error:', err.message)
    }
}
