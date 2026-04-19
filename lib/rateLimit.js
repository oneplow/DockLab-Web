/**
 * In-memory rate limiter using sliding window counter.
 * Suitable for single-instance deployments (no Redis needed).
 * 
 * Usage:
 *   const result = rateLimit(ip, { windowMs: 60000, max: 60 })
 *   if (!result.allowed) return new Response('Too Many Requests', { status: 429 })
 */

const store = new Map()

// Auto-cleanup every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000

let cleanupTimer = null

function startCleanup() {
    if (cleanupTimer) return
    cleanupTimer = setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of store) {
            if (now - entry.windowStart > entry.windowMs * 2) {
                store.delete(key)
            }
        }
    }, CLEANUP_INTERVAL)
    // Don't block Node.js exit
    if (cleanupTimer.unref) cleanupTimer.unref()
}

/**
 * Check rate limit for a given key (usually IP address).
 * @param {string} key - Unique identifier (IP address)
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 min)
 * @param {number} options.max - Max requests per window (default: 60)
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function rateLimit(key, { windowMs = 60_000, max = 60 } = {}) {
    startCleanup()

    const now = Date.now()
    const entry = store.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
        // New window
        store.set(key, { count: 1, windowStart: now, windowMs })
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs }
    }

    entry.count++

    if (entry.count > max) {
        const resetAt = entry.windowStart + windowMs
        return { allowed: false, remaining: 0, resetAt }
    }

    return {
        allowed: true,
        remaining: max - entry.count,
        resetAt: entry.windowStart + windowMs,
    }
}
