'use client'

import { useEffect, useState, useCallback } from 'react'
import {
    Container, Box, HardDrive, Cpu, MemoryStick, Activity,
    TrendingUp, TrendingDown, RefreshCw, Circle, Play, Square, AlertCircle, Info
} from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import { useStats } from '@/lib/contexts/StatsContext'

// Format bytes
function fmt(bytes) {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
    return bytes + ' B'
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
    const colorMap = {
        blue: 'text-blue-400 bg-blue-400/10 border-blue-400/15',
        emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/15',
        red: 'text-red-400 bg-red-400/10 border-red-400/15',
        violet: 'text-violet-400 bg-violet-400/10 border-violet-400/15',
        amber: 'text-amber-400 bg-amber-400/10 border-amber-400/15',
        cyan: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/15',
    }
    return (
        <div className="bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors">
            <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg border ${colorMap[color]}`}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <div className="mt-3">
                <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
        </div>
    )
}

function PolicyCard({ title, label, compliance, count, countLabel, progress, color = 'blue' }) {
    const barColor = {
        blue: 'bg-blue-500',
        emerald: 'bg-emerald-500',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        violet: 'bg-violet-500',
    }
    return (
        <div className="bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{label}</p>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                </div>
                <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            </div>
            <p className="text-3xl font-bold text-foreground mb-1">{compliance}%</p>
            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <span>{progress}</span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-2">
                <div
                    className={`h-full rounded-full ${barColor[color] || barColor.blue} transition-all duration-700`}
                    style={{ width: `${compliance}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-xs">
                <div>
                    <span className="text-foreground font-semibold">{count}</span>
                    <span className="text-muted-foreground ml-1">{countLabel}</span>
                </div>
                <span className="text-muted-foreground text-[10px]">real-time</span>
            </div>
        </div>
    )
}

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                <p className="text-muted-foreground mb-1">{label}</p>
                {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color }} className="font-medium">
                        {p.name}: {p.value.toFixed(1)}%
                    </p>
                ))}
            </div>
        )
    }
    return null
}

export default function DashboardPage() {
    const { stats: liveStats, initialLoad } = useStats()
    const [stats, setStats] = useState(null)
    const [chartData, setChartData] = useState([])
    const [lastUpdated, setLastUpdated] = useState(null)
    const [events, setEvents] = useState([])

    // Sync liveStats from context into local state for chart accumulation
    useEffect(() => {
        if (!liveStats || liveStats.cpu === undefined) return
        setStats(liveStats)
        setLastUpdated(new Date())

        const now = new Date()
        const label = now.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setChartData(prev => {
            const next = [...prev, { time: label, cpu: liveStats.cpu, ram: liveStats.ram }]
            return next.slice(-20)
        })
    }, [liveStats])

    const loading = initialLoad

    // Fetch Events — mapped to SSE stream
    const [streamRetry, setStreamRetry] = useState(0)

    useEffect(() => {
        let eventSource = null

        const startStreaming = () => {
            if (!document.hidden) {
                eventSource = new EventSource(`/api/events/stream`)

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data)
                        if (data.error) return

                        if (data.history) {
                            setEvents(data.history.slice(0, 8))
                        } else if (data.live) {
                            setEvents(prev => {
                                const next = [data.live, ...prev]
                                return next.slice(0, 8)
                            })
                        }
                    } catch (e) { }
                }

                eventSource.onerror = (err) => {
                    stopStreaming()
                    if (!document.hidden) {
                        setTimeout(() => setStreamRetry(r => r + 1), 5000)
                    }
                }
            }
        }

        const stopStreaming = () => {
            if (eventSource) {
                eventSource.close()
                eventSource = null
            }
        }

        const handleVisibility = () => {
            if (document.hidden) {
                stopStreaming()
            } else {
                startStreaming()
            }
        }

        startStreaming()
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            stopStreaming()
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [streamRetry])

    const ramUsedGB = stats ? (stats.ramUsed / 1e9).toFixed(1) : '—'
    const ramTotalGB = stats ? (stats.ramTotal / 1e9).toFixed(1) : '—'

    const iconMap = {
        start: Play,
        stop: Square,
        restart: RefreshCw,
        create: Container,
        destroy: AlertCircle,
        die: AlertCircle,
        pull: TrendingDown,
        kill: Square,
    }
    const colorMap = {
        start: 'text-emerald-400',
        stop: 'text-red-400',
        restart: 'text-amber-400',
        create: 'text-blue-400',
        destroy: 'text-red-400',
        die: 'text-red-400',
        pull: 'text-blue-400',
        kill: 'text-red-400',
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Overview</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        An overview of the status of your Docker environment
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-xs text-muted-foreground">
                            Updated {lastUpdated.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => setStreamRetry(r => r + 1)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs text-foreground transition-colors border border-border"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
                <StatCard
                    icon={Container}
                    label="Total Containers"
                    value={loading ? '…' : stats?.containers?.total ?? '—'}
                    sub={`${stats?.containers?.running ?? 0} running`}
                    color="blue"
                />
                <StatCard
                    icon={Circle}
                    label="Running"
                    value={loading ? '…' : stats?.containers?.running ?? '—'}
                    sub="containers active"
                    color="emerald"
                />
                <StatCard
                    icon={Square}
                    label="Stopped"
                    value={loading ? '…' : stats?.containers?.stopped ?? '—'}
                    sub="not running"
                    color="red"
                />
                <StatCard
                    icon={Box}
                    label="Images"
                    value={loading ? '…' : stats?.images?.total ?? '—'}
                    sub="locally cached"
                    color="violet"
                />
                <StatCard
                    icon={Cpu}
                    label="CPU Usage"
                    value={loading ? '…' : `${stats?.cpu ?? 0}%`}
                    sub={`${stats?.ncpu ?? 0} cores`}
                    color="amber"
                />
                <StatCard
                    icon={MemoryStick}
                    label="RAM Usage"
                    value={loading ? '…' : `${stats?.ram ?? 0}%`}
                    sub={`${ramUsedGB} / ${ramTotalGB} GB`}
                    color="cyan"
                />
            </div>

            {/* Policy Cards — Docker Scout style */}
            <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Container Health Policies</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <PolicyCard
                        label="Docker Policy"
                        title="Running containers"
                        compliance={stats?.containers?.total ? Math.round((stats.containers.running / stats.containers.total) * 100) : 0}
                        progress={`${stats?.containers?.running ?? 0}/${stats?.containers?.total ?? 0} containers running`}
                        count={stats?.containers?.running ?? 0}
                        countLabel="running"
                        color="emerald"
                    />
                    <PolicyCard
                        label="Docker Policy"
                        title="Healthy images"
                        compliance={stats?.images?.total ? Math.round(((stats.policies?.healthyImagesCount ?? 0) / stats.images.total) * 100) : 0}
                        progress={`${stats?.policies?.healthyImagesCount ?? 0}/${stats?.images?.total ?? 0} images active`}
                        count={(stats?.images?.total ?? 0) - (stats?.policies?.healthyImagesCount ?? 0)}
                        countLabel="dangling images"
                        color="blue"
                    />
                    <PolicyCard
                        label="Docker Policy"
                        title="Resource limits set"
                        compliance={stats?.containers?.total ? Math.round(((stats.policies?.resourceLimitsSet ?? 0) / stats.containers.total) * 100) : 0}
                        progress={`${stats?.policies?.resourceLimitsSet ?? 0}/${stats?.containers?.total ?? 0} containers comply`}
                        count={(stats?.containers?.total ?? 0) - (stats?.policies?.resourceLimitsSet ?? 0)}
                        countLabel="missing limits"
                        color="amber"
                    />
                    <PolicyCard
                        label="Custom Policy"
                        title="Official base images"
                        compliance={stats?.images?.total ? Math.round(((stats.policies?.officialBaseImages ?? 0) / stats.images.total) * 100) : 0}
                        progress={`${stats?.policies?.officialBaseImages ?? 0}/${stats?.images?.total ?? 0} images official`}
                        count={(stats?.images?.total ?? 0) - (stats?.policies?.officialBaseImages ?? 0)}
                        countLabel="violations"
                        color="violet"
                    />
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* CPU + RAM Chart */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 flex flex-col">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Resource Usage</p>
                            <p className="text-sm font-semibold text-foreground mt-0.5">CPU &amp; RAM Trends</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-0.5 bg-blue-400 inline-block rounded" /> CPU
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-0.5 bg-violet-400 inline-block rounded" /> RAM
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-[200px]">
                        {chartData.length < 2 ? (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-border border-t-blue-500 rounded-full animate-spin" />
                                    <span className="text-xs">Collecting data...</span>
                                </div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="cpu" name="CPU" stroke="#60a5fa" strokeWidth={1.5} fill="url(#cpuGrad)" dot={false} />
                                    <Area type="monotone" dataKey="ram" name="RAM" stroke="#a78bfa" strokeWidth={1.5} fill="url(#ramGrad)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Recent Activity — Real Docker events */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="mb-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Activity</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">Recent events</p>
                    </div>
                    <div className="space-y-3">
                        {events.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">No recent events</p>
                        ) : events.map((item, idx) => {
                            const Icon = iconMap[item.action] || Activity
                            const clr = colorMap[item.action] || 'text-muted-foreground'
                            return (
                                <div key={idx} className="flex items-start gap-3">
                                    <div className="mt-0.5 p-1.5 rounded-md bg-muted flex-shrink-0">
                                        <Icon className={`w-3 h-3 ${clr}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-foreground font-medium truncate">{item.name || item.from}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.action} · {item.timeAgo}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Server Info */}
            <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Server Information</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Docker Version', value: stats?.serverVersion || '—' },
                        { label: 'OS', value: stats?.operatingSystem || '—' },
                        { label: 'Architecture', value: stats?.architecture || '—' },
                        { label: 'CPUs', value: `${stats?.ncpu || '—'} cores` },
                    ].map(item => (
                        <div key={item.label}>
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className="text-sm text-foreground font-medium mt-0.5">{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
