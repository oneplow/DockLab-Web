'use client'

import { useOperations } from '@/lib/contexts/OperationsContext'
import { X, CheckCircle, XCircle, Loader2, Ban } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function OperationsToast() {
    const { operations, cancelOperation } = useOperations()
    const [dismissedIds, setDismissedIds] = useState(new Set())

    // Auto-dismiss completed operations after 8 seconds
    useEffect(() => {
        const timers = []
        operations.forEach(op => {
            if (['success', 'error', 'cancelled'].includes(op.status) && !dismissedIds.has(op.id)) {
                const timer = setTimeout(() => {
                    setDismissedIds(prev => new Set([...prev, op.id]))
                }, 8000)
                timers.push(timer)
            }
        })
        return () => timers.forEach(clearTimeout)
    }, [operations, dismissedIds])

    // Clean dismissed IDs when they're no longer in the operations list
    useEffect(() => {
        const activeIds = new Set(operations.map(op => op.id))
        setDismissedIds(prev => {
            const cleaned = new Set([...prev].filter(id => activeIds.has(id)))
            return cleaned.size !== prev.size ? cleaned : prev
        })
    }, [operations])

    const visibleOps = operations.filter(op => !dismissedIds.has(op.id))

    if (visibleOps.length === 0) return null

    const statusConfig = {
        running: {
            icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
            barColor: 'bg-blue-500',
            borderColor: 'border-blue-500/20',
        },
        success: {
            icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
            barColor: 'bg-emerald-500',
            borderColor: 'border-emerald-500/20',
        },
        error: {
            icon: <XCircle className="w-4 h-4 text-red-400" />,
            barColor: 'bg-red-500',
            borderColor: 'border-red-500/20',
        },
        cancelled: {
            icon: <Ban className="w-4 h-4 text-muted-foreground" />,
            barColor: 'bg-muted-foreground',
            borderColor: 'border-border',
        },
    }

    return (
        <div className="fixed bottom-4 right-4 z-[99] flex flex-col gap-2 max-w-xs">
            {visibleOps.map(op => {
                const config = statusConfig[op.status] || statusConfig.running

                return (
                    <div
                        key={op.id}
                        className={`bg-card border ${config.borderColor} rounded-xl px-4 py-3 shadow-2xl min-w-[280px] animate-in slide-in-from-right duration-300 ${['success', 'error', 'cancelled'].includes(op.status) ? 'opacity-80' : ''
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                                {config.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {op.message}
                                </p>
                                {op.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {op.description}
                                    </p>
                                )}
                                {op.error && (
                                    <p className="text-xs text-red-400 mt-0.5 truncate">
                                        {op.error}
                                    </p>
                                )}
                                {op.status === 'running' && (
                                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                                        <div
                                            className={`h-full ${config.barColor} rounded-full transition-all duration-700 ease-out`}
                                            style={{
                                                width: op.progress > 0 ? `${op.progress}%` : '100%',
                                                animation: op.progress === 0 ? 'pulse 2s ease-in-out infinite' : 'none',
                                            }}
                                        />
                                    </div>
                                )}
                                {op.status === 'running' && op.progress > 0 && (
                                    <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                                        {op.progress}%
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    if (op.status === 'running') {
                                        cancelOperation(op.id)
                                    } else {
                                        setDismissedIds(prev => new Set([...prev, op.id]))
                                    }
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                title={op.status === 'running' ? 'Cancel operation' : 'Dismiss'}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
