'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react'

const ToastContext = createContext(null)

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((toast) => {
        const id = Date.now() + Math.random()
        const newToast = { id, ...toast }
        setToasts(prev => [...prev, newToast])

        if (toast.type !== 'loading') {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id))
            }, toast.duration || 4000)
        }

        return id
    }, [])

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const updateToast = useCallback((id, updates) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
        if (updates.type && updates.type !== 'loading') {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id))
            }, updates.duration || 4000)
        }
    }, [])

    const toast = {
        success: (message, opts = {}) => addToast({ type: 'success', message, ...opts }),
        error: (message, opts = {}) => addToast({ type: 'error', message, ...opts }),
        warning: (message, opts = {}) => addToast({ type: 'warning', message, ...opts }),
        info: (message, opts = {}) => addToast({ type: 'info', message, ...opts }),
        loading: (message, opts = {}) => addToast({ type: 'loading', message, ...opts }),
        dismiss: removeToast,
        update: updateToast,
    }

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    )
}

function ToastContainer({ toasts, onDismiss }) {
    if (toasts.length === 0) return null

    const iconMap = {
        success: <CheckCircle className="w-4 h-4 text-emerald-400" />,
        error: <XCircle className="w-4 h-4 text-red-400" />,
        warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
        info: <Info className="w-4 h-4 text-blue-400" />,
        loading: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
    }

    const progressColorMap = {
        success: 'bg-emerald-400',
        error: 'bg-red-400',
        warning: 'bg-amber-400',
        info: 'bg-blue-400',
        loading: 'bg-blue-400',
    }

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className="bg-card border border-border rounded-xl px-4 py-3 shadow-2xl flex items-start gap-3 animate-in slide-in-from-right duration-300 min-w-[280px]"
                >
                    <div className="mt-0.5 flex-shrink-0">{iconMap[t.type]}</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.message}</p>
                        {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                        {t.type === 'loading' && (
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-2">
                                <div className={`h-full ${progressColorMap[t.type]} rounded-full animate-pulse`} style={{ width: '60%' }} />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => onDismiss(t.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    )
}
