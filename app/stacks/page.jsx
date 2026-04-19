'use client'

import { useEffect, useState } from 'react'
import { Layers, Play, Square, Trash2, RotateCcw, Loader2, AlertCircle, Box, ChevronDown, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useSession } from 'next-auth/react'

export default function StacksPage() {
    const [stacks, setStacks] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandedStacks, setExpandedStacks] = useState(new Set())
    const [actionLoading, setActionLoading] = useState(null) // "stackName:action"
    const toast = useToast()
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const fetchStacks = async () => {
        try {
            const res = await fetch('/api/stacks')
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setStacks(data.stacks || [])
        } catch (err) {
            toast.error('Failed to load stacks')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchStacks() }, [])

    const toggleExpand = (name) => {
        setExpandedStacks(prev => {
            const next = new Set(prev)
            next.has(name) ? next.delete(name) : next.add(name)
            return next
        })
    }

    const handleStackAction = async (stackName, action) => {
        const key = `${stackName}:${action}`
        setActionLoading(key)
        const tid = toast.loading(`${action === 'remove' ? 'Removing' : action === 'stop' ? 'Stopping' : action === 'start' ? 'Starting' : 'Restarting'} stack "${stackName}"...`)
        try {
            const res = await fetch('/api/stacks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, stackName })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                const failed = (data.results || []).filter(r => r.status === 'error')
                if (failed.length > 0) {
                    toast.update(tid, { type: 'error', message: `${failed.length} container(s) failed` })
                } else {
                    toast.update(tid, { type: 'success', message: `Stack "${stackName}" ${action}ed successfully` })
                }
                fetchStacks()
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setActionLoading(null)
    }

    const statusColor = (status) => {
        if (status === 'running') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        if (status === 'partial') return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        return 'bg-red-500/10 text-red-400 border-red-500/20'
    }

    const statusLabel = (status) => {
        if (status === 'running') return 'Running'
        if (status === 'partial') return 'Partial'
        return 'Stopped'
    }

    if (loading) {
        return (
            <div className="flex justify-center py-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                        <Layers className="w-7 h-7 text-purple-400" /> Stacks
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage multi-service Docker Compose deployments</p>
                </div>
            </div>

            {stacks.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-16 text-center">
                    <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Stacks Found</h3>
                    <p className="text-sm text-muted-foreground">Deploy a Docker Compose project to see it here. Stacks are automatically detected from the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">com.docker.compose.project</code> label.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {stacks.map(stack => {
                        const isExpanded = expandedStacks.has(stack.name)
                        return (
                            <div key={stack.name} className="bg-card border border-border rounded-xl overflow-hidden">
                                {/* Stack Header */}
                                <div className="px-5 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(stack.name)}>
                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                        <Layers className="w-5 h-5 text-purple-400" />
                                        <div>
                                            <h3 className="text-sm font-bold text-foreground">{stack.name}</h3>
                                            <p className="text-xs text-muted-foreground">{stack.totalCount} container{stack.totalCount !== 1 ? 's' : ''} · {stack.services.length} service{stack.services.length !== 1 ? 's' : ''}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusColor(stack.status)}`}>
                                            {statusLabel(stack.status)}
                                        </span>
                                    </div>
                                    {!isViewer && (
                                        <div className="flex items-center gap-2">
                                            {stack.status !== 'running' && (
                                                <button
                                                    onClick={() => handleStackAction(stack.name, 'start')}
                                                    disabled={!!actionLoading}
                                                    className="p-1.5 bg-muted hover:bg-emerald-500/20 hover:text-emerald-400 text-muted-foreground border border-border rounded-md transition-colors disabled:opacity-50"
                                                    title="Start All"
                                                >
                                                    {actionLoading === `${stack.name}:start` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            {stack.status !== 'stopped' && (
                                                <button
                                                    onClick={() => handleStackAction(stack.name, 'stop')}
                                                    disabled={!!actionLoading}
                                                    className="p-1.5 bg-muted hover:bg-amber-500/20 hover:text-amber-400 text-muted-foreground border border-border rounded-md transition-colors disabled:opacity-50"
                                                    title="Stop All"
                                                >
                                                    {actionLoading === `${stack.name}:stop` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleStackAction(stack.name, 'restart')}
                                                disabled={!!actionLoading}
                                                className="p-1.5 bg-muted hover:bg-blue-500/20 hover:text-blue-400 text-muted-foreground border border-border rounded-md transition-colors disabled:opacity-50"
                                                title="Restart All"
                                            >
                                                {actionLoading === `${stack.name}:restart` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => handleStackAction(stack.name, 'remove')}
                                                disabled={!!actionLoading}
                                                className="p-1.5 bg-muted hover:bg-red-500/20 hover:text-red-400 text-muted-foreground border border-border rounded-md transition-colors disabled:opacity-50"
                                                title="Remove Stack"
                                            >
                                                {actionLoading === `${stack.name}:remove` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Expanded Container List */}
                                {isExpanded && (
                                    <div className="border-t border-border">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/50">
                                                <tr className="text-left text-muted-foreground">
                                                    <th className="px-5 py-2 font-medium">Container</th>
                                                    <th className="px-5 py-2 font-medium">Service</th>
                                                    <th className="px-5 py-2 font-medium">Image</th>
                                                    <th className="px-5 py-2 font-medium w-24">State</th>
                                                    <th className="px-5 py-2 font-medium">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stack.containers.map(c => (
                                                    <tr key={c.id} className="border-t border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                                                        onClick={() => window.location.href = `/containers/${c.id}`}
                                                    >
                                                        <td className="px-5 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <Box className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                                                <span className="font-mono font-medium text-foreground">{c.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-2.5 text-muted-foreground font-mono">{c.service}</td>
                                                        <td className="px-5 py-2.5 text-muted-foreground font-mono truncate max-w-[200px]">{c.image}</td>
                                                        <td className="px-5 py-2.5">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.state === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                {c.state}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-2.5 text-muted-foreground">{c.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
