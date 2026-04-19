/**
 * lib/docker/smartCache.js — Global Event-Driven Docker Cache (Docklab side)
 *
 * หลักการ:
 *   - 1 Watcher ต่อ hostId — เปิด Docker event stream ค้างไว้
 *   - Metrics (CPU/RAM/Storage): อ่านจาก docklab-server SSE โดยตรง (TCP host ใช้ os module ผ่าน docklab-server)
 *     สำหรับ TCP direct host: ใช้ os.* ผ่าน getDockerHostStats เฉพาะเมื่อ docklab-server ไม่มี
 *   - Inventory (containers/images/policies): ทุก 30 วิ หรือเมื่อมี Docker event
 *   - ทุก SSE client subscribe ผ่าน listener — ไม่มีใครยิง Docker เอง
 *
 * Bug fixes จากรุ่นแรก:
 *   - ลบ PassThrough import ออก (ไม่ได้ใช้)
 *   - _fetchMetrics: ไม่เรียก getDockerHostStats (Alpine) อีกต่อไป
 *     ใช้ docker.info() + os module แทน (เบากว่ามาก)
 *   - ts_metrics/ts_inventory ไม่ถูกส่งออกใน getCachedStats() — strip ออกก่อน
 */

// ─── Cache stores ─────────────────────────────────────────────────────────────

// hostId → snapshot object
const cache = new Map()

// hostId → Watcher instance
const watchers = new Map()

const METRICS_INTERVAL = 10_000   // CPU/RAM/Storage refresh (ms)
const INVENTORY_INTERVAL = 30_000   // containers/images/policies refresh (ms)
const EVENT_DEBOUNCE = 2_000    // debounce after Docker event (ms)

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start (or reuse) a watcher for hostId.
 * @param {string} hostId
 * @param {() => Promise<object>} getClient  factory → dockerode/docklab-server client
 */
export function ensureWatcher(hostId, getClient) {
    if (watchers.has(hostId)) return
    const w = new Watcher(hostId, getClient)
    watchers.set(hostId, w)
    w.start()
}

export function stopWatcher(hostId) {
    const w = watchers.get(hostId)
    if (w) { w.stop(); watchers.delete(hostId); cache.delete(hostId) }
}

/**
 * Return cached snapshot — ts_metrics/ts_inventory stripped out.
 * Never null.
 */
export function getCachedStats(hostId) {
    const snap = cache.get(hostId)
    if (!snap) return _emptyPublicSnapshot()
    const { ts_metrics, ts_inventory, ...pub } = snap
    return pub
}

/**
 * Subscribe to cache updates for hostId.
 * Listener receives the PUBLIC snapshot (no ts_* fields).
 * Returns unsubscribe function.
 */
export function subscribe(hostId, fn) {
    const w = watchers.get(hostId)
    if (!w) return () => { }
    w.listeners.add(fn)
    return () => w.listeners.delete(fn)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _emptyPublicSnapshot() {
    return {
        cpu: 0, ram: 0, ramUsed: 0, ramTotal: 1,
        storage: 0, storageUsed: 0, storageTotal: 0,
        containers: { total: 0, running: 0, stopped: 0, paused: 0 },
        images: { total: 0 },
        policies: {},
        ncpu: 0, serverVersion: '', operatingSystem: '', architecture: '',
        serverOnline: true,
    }
}

function _emptyInternalSnapshot() {
    return { ..._emptyPublicSnapshot(), ts_metrics: 0, ts_inventory: 0 }
}

// ─── Watcher class ────────────────────────────────────────────────────────────

class Watcher {
    constructor(hostId, getClient) {
        this.hostId = hostId
        this.getClient = getClient
        this.listeners = new Set()
        this._stopped = false
        this._metricsTimer = null
        this._inventoryTimer = null
        this._eventRetryTimer = null
        this._inventoryDebounce = null
        this._eventStream = null
    }

    start() {
        this._fetchMetrics()
        this._fetchInventory()
        this._metricsTimer = setInterval(() => this._fetchMetrics(), METRICS_INTERVAL)
        this._inventoryTimer = setInterval(() => this._fetchInventory(), INVENTORY_INTERVAL)
        this._connectEventStream()
    }

    stop() {
        this._stopped = true
        clearInterval(this._metricsTimer)
        clearInterval(this._inventoryTimer)
        clearTimeout(this._eventRetryTimer)
        clearTimeout(this._inventoryDebounce)
        try { this._eventStream?.destroy() } catch { }
    }

    _notify() {
        const { ts_metrics, ts_inventory, ...pub } = cache.get(this.hostId) ?? _emptyPublicSnapshot()
        // Attach timestamps so the SSE route can decide which tier to send
        const withTs = {
            ...pub,
            ts_metrics: cache.get(this.hostId)?.ts_metrics ?? 0,
            ts_inventory: cache.get(this.hostId)?.ts_inventory ?? 0,
        }
        for (const fn of this.listeners) {
            try { fn(withTs) } catch { }
        }
    }

    // ── Metrics ─────────────────────────────────────────────────────────────
    // Uses docker.info() for server info + os module via the Node.js process
    // that runs Docklab itself — no Alpine container, no extra Docker API calls
    // beyond the single info() call we need anyway for server version etc.
    //
    // NOTE: For TCP-direct hosts, CPU/RAM reflect the Docklab server's own OS,
    // not the remote Docker host. For accurate remote host metrics, use docklab-server
    // (which runs ON the Docker machine and sends real os.* readings).

    async _fetchMetrics() {
        if (this._stopped) return
        try {
            const docker = await this.getClient()
            const info = await docker.info()

            // For docklab-server hosts, info() returns _docklabServer* fields with real host metrics
            let cpu = 0, ram = 0, ramUsed = 0, ramTotal = 1
            let storage = 0, storageUsed = 0, storageTotal = 0

            if (info._docklabServerStorage) {
                // docklab-server proxy — metrics come from the remote machine's os module
                cpu = info._docklabServerCpuUsed ?? 0
                ramUsed = info._docklabServerMemUsed ?? 0
                ramTotal = info.MemTotal ?? 1
                ram = (ramUsed / ramTotal) * 100
                storage = info._docklabServerStorage.usedPercent ?? 0
                storageUsed = info._docklabServerStorage.used ?? 0
                storageTotal = info._docklabServerStorage.total ?? 0
            } else {
                // TCP-direct: use getDockerHostStats for RAM/Storage,
                // and container stats for CPU (more reliable than loadavg via nsenter)
                try {
                    const { getDockerHostStats } = await import('./service.js')
                    const stats = await getDockerHostStats(docker, info, this.hostId)
                    ram = stats.ram ?? 0
                    ramUsed = stats.ramUsed ?? 0
                    ramTotal = stats.ramTotal ?? info.MemTotal ?? 1
                    storage = stats.storage?.usedPercent ?? 0
                    storageUsed = stats.storage?.used ?? 0
                    storageTotal = stats.storage?.total ?? 0
                    // Use host CPU from nsenter if available
                    cpu = stats.cpu ?? 0
                } catch { }

                // Fallback: compute CPU from container stats (Docker formula)
                // This is more reliable than nsenter loadavg for TCP remote hosts
                if (!cpu || cpu < 0.1) {
                    try {
                        const running = await docker.listContainers({ filters: { status: ['running'] } })
                        const statsPromises = running.slice(0, 15).map(async (c) => {
                            try {
                                const container = docker.getContainer(c.Id)
                                const s = await Promise.race([
                                    container.stats({ stream: false }),
                                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))
                                ])
                                const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0) - (s.precpu_stats?.cpu_usage?.total_usage || 0)
                                const sysDelta = (s.cpu_stats?.system_cpu_usage || 0) - (s.precpu_stats?.system_cpu_usage || 0)
                                if (sysDelta > 0 && cpuDelta > 0) {
                                    const cpus = s.cpu_stats?.online_cpus || info.NCPU || 1
                                    return (cpuDelta / sysDelta) * cpus * 100
                                }
                                return 0
                            } catch { return 0 }
                        })
                        const results = await Promise.all(statsPromises)
                        const containerCpu = results.reduce((a, b) => a + b, 0)
                        if (containerCpu > 0) cpu = containerCpu
                    } catch { }
                }
            }

            const snap = cache.get(this.hostId) ?? _emptyInternalSnapshot()
            cache.set(this.hostId, {
                ...snap,
                cpu: parseFloat((cpu || 0).toFixed(1)),
                ram: parseFloat((ram || 0).toFixed(1)),
                ramUsed,
                ramTotal,
                storage: parseFloat((storage || 0).toFixed(1)),
                storageUsed,
                storageTotal,
                // Server info — grab once from info()
                ncpu: snap.ncpu || info.NCPU || 0,
                serverVersion: snap.serverVersion || info.ServerVersion || '',
                operatingSystem: snap.operatingSystem || info.OperatingSystem || '',
                architecture: snap.architecture || info.Architecture || '',
                serverOnline: true,
                ts_metrics: Date.now(),
            })
            this._notify()
        } catch (e) {
            if (!e.message?.includes('AbortError')) {
                console.warn(`[smartCache] metrics failed (${this.hostId}):`, e.message)
                // Mark server offline but keep last values
                const snap = cache.get(this.hostId) ?? _emptyInternalSnapshot()
                cache.set(this.hostId, { ...snap, serverOnline: false })
                this._notify()
            }
        }
    }

    // ── Inventory ────────────────────────────────────────────────────────────
    // 3 Docker API calls: info() + listImages() + listContainers()
    // No per-container inspect loop — O(1) regardless of container count.

    async _fetchInventory() {
        if (this._stopped) return
        try {
            const docker = await this.getClient()
            const [info, images, containers] = await Promise.all([
                docker.info(),
                docker.listImages(),
                docker.listContainers({ all: true }),
            ])

            const danglingImages = images.filter(i => i.RepoTags?.includes('<none>:<none>')).length
            const officialBaseImages = images.filter(i => i.RepoTags?.some(t => !t.includes('/'))).length
            const resourceLimitsSet = containers.filter(c => {
                const hc = c.HostConfig ?? {}
                return (hc.Memory > 0) || (hc.NanoCpus > 0) || (hc.CpuShares > 0)
            }).length

            const snap = cache.get(this.hostId) ?? _emptyInternalSnapshot()
            cache.set(this.hostId, {
                ...snap,
                containers: {
                    total: info.Containers ?? containers.length,
                    running: info.ContainersRunning ?? containers.filter(c => c.State === 'running').length,
                    stopped: info.ContainersStopped ?? containers.filter(c => c.State === 'exited').length,
                    paused: info.ContainersPaused ?? containers.filter(c => c.State === 'paused').length,
                },
                images: { total: images.length },
                policies: {
                    healthyImagesCount: images.length - danglingImages,
                    resourceLimitsSet,
                    officialBaseImages,
                },
                ts_inventory: Date.now(),
            })
            this._notify()
        } catch (e) {
            console.warn(`[smartCache] inventory failed (${this.hostId}):`, e.message)
        }
    }

    // ── Docker Event Stream ──────────────────────────────────────────────────
    // Persistent stream — triggers debounced inventory refresh on any event.

    async _connectEventStream() {
        if (this._stopped) return
        try {
            const docker = await this.getClient()
            if (typeof docker.getEvents !== 'function') return  // docklab-server proxy — skip

            // dockerode v4 returns a Promise<stream>
            const stream = await docker.getEvents({
                filters: JSON.stringify({ type: ['container', 'image'] })
            })

            this._eventStream = stream

            stream.on('data', () => {
                if (this._stopped) return
                clearTimeout(this._inventoryDebounce)
                this._inventoryDebounce = setTimeout(() => this._fetchInventory(), EVENT_DEBOUNCE)
            })

            stream.on('end', () => { if (!this._stopped) this._scheduleEventRetry() })
            stream.on('error', () => { if (!this._stopped) this._scheduleEventRetry() })
        } catch (e) {
            this._scheduleEventRetry()
        }
    }

    _scheduleEventRetry(delay = 15_000) {
        clearTimeout(this._eventRetryTimer)
        this._eventRetryTimer = setTimeout(() => {
            if (!this._stopped) this._connectEventStream()
        }, delay)
    }
}