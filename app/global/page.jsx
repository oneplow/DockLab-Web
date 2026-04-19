'use client'

import { useState, useEffect } from 'react'
import { Server, Activity, Cpu, HardDrive, Box, Loader2, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function GlobalDashboardPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [hosts, setHosts] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (session?.user?.role === 'viewer') {
            router.push('/')
            return
        }
        fetchGlobalData()

        // Auto-refresh every 15 seconds
        const interval = setInterval(fetchGlobalData, 15000)
        return () => clearInterval(interval)
    }, [session, router])

    const fetchGlobalData = async () => {
        try {
            const res = await fetch('/api/global')
            if (!res.ok) throw new Error('Failed to fetch global metrics')
            const data = await res.json()
            setHosts(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const formatBytes = (bytes) => {
        if (!+bytes) return '0 B'
        const k = 1024
        const dm = 1
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    // Aggregates
    const activeHosts = hosts.filter(h => h.status === 'online')
    const totalContainers = activeHosts.reduce((acc, h) => acc + h.containers.total, 0)
    const totalRunning = activeHosts.reduce((acc, h) => acc + h.containers.running, 0)
    const totalCPU = activeHosts.reduce((acc, h) => acc + (h.ncpu || 0), 0)
    const totalMem = activeHosts.reduce((acc, h) => acc + (h.memTotal || 0), 0)

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in p-2 sm:p-0">
            <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Activity className="w-6 h-6 text-blue-500" />
                    Global Command Center
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">Real-time aggregate overview of all connected infrastructure</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-20 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : error ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                    <p className="text-sm font-semibold text-red-500">{error}</p>
                </div>
            ) : (
                <>
                    {/* Top Level Aggregates */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                <Server className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Servers</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{hosts.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                <span className="text-emerald-500 font-semibold">{activeHosts.length} Online</span> • {hosts.length - activeHosts.length} Offline
                            </p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                <Box className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Containers</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{totalContainers}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                <span className="text-emerald-500 font-semibold">{totalRunning} Running</span> across all hosts
                            </p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                <Cpu className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Compute</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{totalCPU} <span className="text-lg font-medium text-muted-foreground">Cores</span></div>
                            <p className="text-xs text-muted-foreground mt-1">Combined CPU Resources</p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                <HardDrive className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Memory</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{formatBytes(totalMem)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Combined RAM capacity</p>
                        </div>
                    </div>

                    {/* Nodes Grid */}
                    <h2 className="text-lg font-semibold text-foreground pt-4">Nodes Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {hosts.map(host => (
                            <div key={host.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative">
                                {/* Status Indicator Strip */}
                                <div className={`absolute top-0 left-0 w-full h-1 ${host.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />

                                <div className="p-5">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                                {host.name}
                                                {host.status === 'online' ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <ShieldAlert className="w-4 h-4 text-red-500" />
                                                )}
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {host.connectionType === 'docklab-server' ? 'Docklab-server Agent' : 'TCP Direct'}
                                            </p>
                                        </div>
                                    </div>

                                    {host.status === 'online' ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-muted/50 rounded-lg p-3">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Containers</p>
                                                    <p className="text-xl font-bold text-foreground">{host.containers.total}</p>
                                                    <p className="text-xs text-emerald-500 font-medium">{host.containers.running} running</p>
                                                </div>
                                                <div className="bg-muted/50 rounded-lg p-3">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Compute</p>
                                                    <p className="text-xl font-bold text-foreground">{host.ncpu} Core</p>
                                                    <p className="text-xs text-muted-foreground truncate" title={host.os}>{host.os.split(' ')[0]}</p>
                                                </div>
                                            </div>

                                            {/* Resource Bars */}
                                            {host.cpuUsedPercent !== null && (
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1 font-medium">
                                                        <span className="text-muted-foreground">CPU Usage</span>
                                                        <span className={host.cpuUsedPercent > 80 ? 'text-orange-500' : 'text-foreground'}>{host.cpuUsedPercent.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${host.cpuUsedPercent > 80 ? 'bg-orange-500' : 'bg-blue-500'}`}
                                                            style={{ width: `${Math.min(100, host.cpuUsedPercent)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <div className="flex justify-between text-xs mb-1 font-medium">
                                                    <span className="text-muted-foreground">RAM Capacity</span>
                                                    <span className="text-foreground">{formatBytes(host.memTotal)}</span>
                                                </div>
                                                {host.memUsed !== null && (
                                                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mt-1">
                                                        <div
                                                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                                            style={{ width: `${Math.min(100, (host.memUsed / host.memTotal) * 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-6 flex flex-col items-center justify-center text-center">
                                            <ShieldAlert className="w-8 h-8 text-red-500/50 mb-2" />
                                            <p className="text-sm font-semibold text-red-500">Host Offline</p>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={host.error}>{host.error}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
