'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Network, Plus, Trash2, Shield, RefreshCw, Loader2, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

const driverColor = {
    bridge: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    host: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    null: 'text-muted-foreground bg-muted border-border',
    overlay: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
}

export default function NetworksPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const [networks, setNetworks] = useState([])
    const [loading, setLoading] = useState(true)
    const [show, setShow] = useState(false)
    const [name, setName] = useState('')
    const [actionLoading, setActionLoading] = useState(null)
    const [apiError, setApiError] = useState(null)
    const [deleteModal, setDeleteModal] = useState({ open: false, network: null })
    const toast = useToast()

    const fetchNetworks = () => {
        setLoading(true)
        setApiError(null)
        fetch('/api/networks')
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setApiError(data.error)
                    setNetworks([])
                } else if (Array.isArray(data)) {
                    setNetworks(data)
                } else {
                    setNetworks([])
                }
            })
            .catch(err => setApiError(err.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchNetworks() }, [])

    const handleCreate = async () => {
        if (!name.trim()) return toast.error('Network name is required')
        setActionLoading('creating')
        const tid = toast.loading('Creating network...')
        try {
            const res = await fetch('/api/networks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', name: name.trim() })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Network created' })
                setShow(false)
                setName('')
                fetchNetworks()
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setActionLoading(null)
    }

    const handleRemove = async () => {
        const netId = deleteModal.network?.id
        if (!netId) return
        setDeleteModal({ open: false, network: null })
        setActionLoading('remove-' + netId)
        const tid = toast.loading('Removing network...')
        try {
            const res = await fetch('/api/networks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', id: netId })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Network removed' })
                fetchNetworks()
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
                    <h1 className="text-xl font-bold text-foreground">Networks</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage Docker networks and subnets</p>
                    {apiError && <p className="text-xs text-red-400 mt-1">Error: {apiError}. Is Docker running?</p>}
                </div>
                {!isViewer && (
                    <button onClick={() => setShow(true)} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                        <Plus className="w-4 h-4" /> Create Network
                    </button>
                )}
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Driver</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Subnet</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Containers</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading networks...</td></tr>
                        ) : networks.map((n) => (
                            <tr key={n.id} className="hover:bg-muted/50 transition-colors group">
                                <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
                                            <Network className="w-3.5 h-3.5 text-cyan-400" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{n.name}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${driverColor[n.driver] || driverColor.bridge}`}>
                                        {n.driver}
                                    </span>
                                </td>
                                <td className="px-4 py-3.5 hidden md:table-cell">
                                    <span className="text-xs text-muted-foreground font-mono">{n.subnet}</span>
                                </td>
                                <td className="px-4 py-3.5 hidden sm:table-cell">
                                    <span className="text-sm text-foreground">{n.containers}</span>
                                </td>
                                <td className="px-4 py-3.5">
                                    <div className="flex items-center justify-end gap-1">
                                        {!isViewer && n.name !== 'bridge' && n.name !== 'host' && n.name !== 'none' && (
                                            <button
                                                onClick={() => setDeleteModal({ open: true, network: n })}
                                                disabled={!!actionLoading}
                                                className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                                title="Remove"
                                            >
                                                {actionLoading === 'remove-' + n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Network Modal */}
            {show && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShow(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-semibold text-foreground">Create Network</h3>
                            <button onClick={() => setShow(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1.5">Network Name</label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. my-network"
                                className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
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

            {/* Delete Network Confirm */}
            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, network: null })}
                onConfirm={handleRemove}
                title="Delete Network"
                message={`Are you sure you want to delete network "${deleteModal.network?.name}"? Containers using this network will lose connectivity.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    )
}
