'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Bell, Loader2, MessageSquare, Hexagon } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

export default function WebhooksManager() {
    const toast = useToast()
    const [webhooks, setWebhooks] = useState([])
    const [loading, setLoading] = useState(true)
    const [addModal, setAddModal] = useState(false)
    const [newHook, setNewHook] = useState({ name: '', provider: 'discord', url: '', events: 'crash' })
    const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: '' })

    useEffect(() => {
        fetchWebhooks()
    }, [])

    const fetchWebhooks = async () => {
        try {
            const res = await fetch('/api/settings/webhooks')
            if (res.ok) {
                const data = await res.json()
                setWebhooks(data)
            }
        } catch (err) {
            toast.error('Failed to load webhooks')
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = async () => {
        if (!newHook.name || !newHook.url) return toast.error('Name and URL are required')
        const tid = toast.loading('Adding webhook...')
        try {
            const res = await fetch('/api/settings/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newHook)
            })
            if (res.ok) {
                const added = await res.json()
                setWebhooks([added, ...webhooks])
                setAddModal(false)
                setNewHook({ name: '', provider: 'discord', url: '', events: 'crash' })
                toast.update(tid, { type: 'success', message: 'Webhook added!' })
            } else {
                const err = await res.json()
                toast.update(tid, { type: 'error', message: err.error || 'Failed to add' })
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
    }

    const handleDelete = async (id) => {
        const tid = toast.loading('Deleting webhook...')
        try {
            const res = await fetch(`/api/settings/webhooks?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                setWebhooks(webhooks.filter(w => w.id !== id))
                toast.update(tid, { type: 'success', message: 'Webhook deleted' })
            } else {
                toast.update(tid, { type: 'error', message: 'Failed to delete' })
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setDeleteConfirm({ open: false, id: null, name: '' })
    }

    const toggleActive = async (id, currentStatus) => {
        try {
            const res = await fetch(`/api/settings/webhooks`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: !currentStatus })
            })
            if (res.ok) {
                setWebhooks(webhooks.map(w => w.id === id ? { ...w, isActive: !currentStatus } : w))
            }
        } catch (err) {
            toast.error('Failed to update status')
        }
    }

    const getProviderIcon = (provider) => {
        if (provider === 'discord') return <Hexagon className="w-5 h-5 text-indigo-400" />
        if (provider === 'slack') return <Hexagon className="w-5 h-5 text-amber-500" />
        if (provider === 'line') return <MessageSquare className="w-5 h-5 text-emerald-500" />
        return <Bell className="w-5 h-5 text-blue-400" />
    }

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-pink-500" />
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Webhook Integrations</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Send alerts to Discord, Slack, or Line</p>
                    </div>
                </div>
                <button
                    onClick={() => setAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-medium rounded-md transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" /> Add Webhook
                </button>
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : webhooks.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
                        No webhooks configured. Add one to receive crash alerts.
                    </div>
                ) : (
                    webhooks.map(w => (
                        <div key={w.id} className="flex items-center justify-between p-4 bg-muted border border-border rounded-lg group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-background rounded-lg border border-border">
                                    {getProviderIcon(w.provider)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-foreground">{w.name}</h3>
                                        <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest rounded-full ${w.isActive ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-muted-foreground/10 text-muted-foreground border border-border'}`}>
                                            {w.isActive ? 'Active' : 'Disabled'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px] sm:max-w-[400px] truncate">{w.url}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => toggleActive(w.id, w.isActive)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors border ${w.isActive ? 'text-muted-foreground bg-background hover:bg-card border-border' : 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30'}`}
                                >
                                    {w.isActive ? 'Pause' : 'Enable'}
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm({ open: true, id: w.id, name: w.name })}
                                    className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Webhook Modal */}
            <ConfirmModal
                open={addModal}
                onClose={() => setAddModal(false)}
                onConfirm={handleAdd}
                title="Add Webhook Integration"
                message="Configure an endpoint to receive automated alerts from Docklab."
                confirmText="Add Webhook"
                variant="info"
            >
                <div className="space-y-4 mt-4 text-left">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Provider</label>
                        <select
                            value={newHook.provider}
                            onChange={(e) => setNewHook({ ...newHook, provider: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                        >
                            <option value="discord">Discord</option>
                            <option value="slack">Slack</option>
                            <option value="line">Line Notify</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Friendly Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Production Team Discord"
                            value={newHook.name}
                            onChange={(e) => setNewHook({ ...newHook, name: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Webhook URL</label>
                        <input
                            type="text"
                            placeholder="https://..."
                            value={newHook.url}
                            onChange={(e) => setNewHook({ ...newHook, url: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-blue-500/50"
                        />
                        {newHook.provider === 'line' && (
                            <p className="text-[10px] text-emerald-500/70 mt-1">For Line Notify, paste your Personal Access Token here.</p>
                        )}
                    </div>
                </div>
            </ConfirmModal>

            {/* Delete Webhook Modal */}
            <ConfirmModal
                open={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, id: null, name: '' })}
                onConfirm={() => handleDelete(deleteConfirm.id)}
                title="Delete Webhook"
                message={`Are you sure you want to delete the webhook "${deleteConfirm.name}"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    )
}
