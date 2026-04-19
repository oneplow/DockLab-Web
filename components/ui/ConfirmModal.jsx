'use client'

import { AlertTriangle, Info, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

export default function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title = 'Are you sure?',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger', // 'danger' | 'warning' | 'info'
    loading = false,
    children,
}) {
    if (!open) return null

    const variantStyles = {
        danger: {
            icon: 'bg-red-500/10 text-red-400 border-red-500/20',
            button: 'bg-red-600 hover:bg-red-500 text-white',
        },
        warning: {
            icon: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            button: 'bg-amber-600 hover:bg-amber-500 text-white',
        },
        info: {
            icon: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            button: 'bg-blue-600 hover:bg-blue-500 text-white',
        },
    }

    const styles = variantStyles[variant] || variantStyles.info
    const IconComponent = variant === 'danger' || variant === 'warning' ? AlertTriangle : Info

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[calc(100vh-2rem)] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                    <div className={`p-2 rounded-xl border ${styles.icon} flex-shrink-0`}>
                        <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{title}</h3>
                        {message && <p className="text-sm text-muted-foreground mt-1 leading-relaxed break-words">{message}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Optional children content */}
                {children && <div className="mb-4">{children}</div>}

                {/* Actions */}
                <div className="flex gap-2 justify-end mt-6">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${styles.button} disabled:opacity-50`}
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
