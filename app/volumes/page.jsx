'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HardDrive, Plus, Trash2, Link as LinkIcon, RefreshCw, Loader2, X, ChevronRight } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

export default function VolumesPage() {
    const [volumes, setVolumes] = useState([])
    const [loading, setLoading] = useState(true)
    const [show, setShow] = useState(false)
    const [name, setName] = useState('')
    const [actionLoading, setActionLoading] = useState(null)
    const [apiError, setApiError] = useState(null)
    const [deleteModal, setDeleteModal] = useState({ open: false, name: null })
    const toast = useToast()

    const fetchVolumes = () => {
        setLoading(true)
        setApiError(null)
        fetch('/api/volumes')
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setApiError(data.error)
                    setVolumes([])
                } else if (Array.isArray(data)) {
                    setVolumes(data)
                } else {
                    setVolumes([])
                }
            })
            .catch(err => setApiError(err.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchVolumes() }, [])

    const handleCreate = async () => {
        if (!name.trim()) return toast.error('Volume name is required')
        setActionLoading('creating')
        const tid = toast.loading('Creating volume...')
        try {
            const res = await fetch('/api/volumes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', name: name.trim() })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Volume created successfully' })
                setShow(false)
                setName('')
                fetchVolumes()
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setActionLoading(null)
    }

    const handleRemove = async () => {
        const volName = deleteModal.name
        if (!volName) return
        setDeleteModal({ open: false, name: null })
        setActionLoading('remove-' + volName)
        const tid = toast.loading(`Removing volume ${volName}...`)
        try {
            const res = await fetch('/api/volumes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', name: volName })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Volume removed' })
                fetchVolumes()
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setActionLoading(null)
    }

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Volumes</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Persistent storage for your containers</p>
                    {apiError && <p className="text-xs text-red-400 mt-1">Error: {apiError}. Is Docker running?</p>}
                </div>
                <button onClick={() => setShow(true)} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                    <Plus className="w-4 h-4" /> Create Volume
                </button>
            </div>

            <div className="grid gap-3">
                {volumes.map(v => (
                    <div key={v.name} className="bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
                            <HardDrive className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <Link href={`/volumes/${v.name}`} className="text-sm font-semibold text-foreground hover:text-blue-500 hover:underline transition-colors flex items-center gap-2 group">
                                {v.name}
                                <ChevronRight className="w-3.5 h-3.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                            </Link>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground">Driver: <span className="text-foreground">{v.driver}</span></span>
                                <span className="text-xs text-muted-foreground">Size: <span className="text-foreground">{v.size}</span></span>
                                <span className="text-xs text-muted-foreground">Created: <span className="text-foreground">{v.created}</span></span>
                            </div>
                            {v.containers?.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-2">
                                    <LinkIcon className="w-3 h-3 text-muted-foreground" />
                                    {v.containers.map(c => (
                                        <span key={c} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded font-mono">{c}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setDeleteModal({ open: true, name: v.name })}
                            disabled={!!actionLoading}
                            className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                            {actionLoading === 'remove-' + v.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                    </div>
                ))}
                {loading && (
                    <div className="text-center text-sm py-10 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading volumes...
                    </div>
                )}
                {!loading && volumes.length === 0 && !apiError && (
                    <div className="text-center text-sm py-10 text-muted-foreground">No volumes found</div>
                )}
            </div>

            {/* Create Volume Modal */}
            {show && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShow(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-semibold text-foreground">Create Volume</h3>
                            <button onClick={() => setShow(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1.5">Volume Name</label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. my-data-volume"
                                className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">A unique name for your persistent data volume</p>
                        </div>
                        <div className="flex gap-2 justify-end mt-6">
                            <button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Cancel</button>
                            <button
                                disabled={actionLoading === 'creating'}
                                onClick={handleCreate}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {actionLoading === 'creating' && <Loader2 className="w-4 h-4 animate-spin" />}
                                {actionLoading === 'creating' ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Volume Confirm */}
            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, name: null })}
                onConfirm={handleRemove}
                title="Delete Volume"
                message={`Are you sure you want to delete volume "${deleteModal.name}"? All data stored in this volume will be permanently lost.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    )
}
