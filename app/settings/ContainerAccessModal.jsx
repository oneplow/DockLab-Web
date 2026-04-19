'use client'

import { useState, useEffect } from 'react'
import { Server, Loader2, Check, X, ShieldAlert } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

export default function ContainerAccessModal({ open, onClose, user, hosts }) {
    const toast = useToast()
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [selectedHostId, setSelectedHostId] = useState('')
    const [containers, setContainers] = useState([])
    const [accessList, setAccessList] = useState(new Set()) // Set of container IDs allowed

    // Reset when modal opens
    useEffect(() => {
        if (open && hosts.length > 0) {
            setSelectedHostId(hosts[0].id)
        }
    }, [open, hosts])

    // Fetch containers and access list when host changes
    useEffect(() => {
        if (open && selectedHostId && user) {
            fetchData()
        }
    }, [open, selectedHostId, user])

    const fetchData = async () => {
        setLoading(true)
        try {
            // First get all containers on this host
            const res = await fetch(`/api/settings/hosts/${selectedHostId}/containers`)
            if (!res.ok) throw new Error('Failed to fetch containers')
            const data = await res.json()
            setContainers(data || [])

            // Then get the user's access list
            const accessRes = await fetch(`/api/users/${user.id}/access?hostId=${selectedHostId}`)
            if (accessRes.ok) {
                const accessData = await accessRes.json()
                setAccessList(new Set(accessData.map(a => a.containerId)))
            } else {
                setAccessList(new Set())
            }
        } catch (err) {
            toast.error(err.message)
            setContainers([])
            setAccessList(new Set())
        } finally {
            setLoading(false)
        }
    }

    const toggleAccess = (containerId) => {
        const newSet = new Set(accessList)
        if (newSet.has(containerId)) {
            newSet.delete(containerId)
        } else {
            newSet.add(containerId)
        }
        setAccessList(newSet)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/users/${user.id}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostId: selectedHostId,
                    containerIds: Array.from(accessList)
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to update access')
            }
            toast.success('Access updated successfully')
            onClose()
        } catch (err) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <ConfirmModal
            open={open}
            onClose={onClose}
            onConfirm={handleSave}
            title={`Container Access: ${user?.name || user?.email}`}
            message="Select which containers this viewer is allowed to see and manage on the selected host."
            confirmText={saving ? 'Saving...' : 'Save Permissions'}
            variant="info"
        >
            <div className="mt-4 space-y-4 text-left">
                {/* Host Selector */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select Docker Host</label>
                    <div className="relative">
                        <Server className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <select
                            value={selectedHostId}
                            onChange={(e) => setSelectedHostId(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                        >
                            {hosts.map(h => (
                                <option key={h.id} value={h.id}>{h.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Container List */}
                <div className="bg-muted/50 border border-border rounded-lg overflow-hidden flex flex-col h-[300px]">
                    <div className="px-3 py-2 bg-muted border-b border-border flex justify-between items-center shrink-0">
                        <span className="text-xs font-semibold text-foreground">Containers</span>
                        {containers.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAccessList(new Set(containers.map(c => c.id)))}
                                    className="text-[10px] uppercase font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                                >
                                    Select All
                                </button>
                                <span className="text-muted-foreground/30">|</span>
                                <button
                                    onClick={() => setAccessList(new Set())}
                                    className="text-[10px] uppercase font-bold text-red-500 hover:text-red-400 transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="overflow-y-auto p-2 space-y-1.5 flex-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-xs">Loading containers...</span>
                            </div>
                        ) : containers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4 text-center">
                                <ShieldAlert className="w-6 h-6 opacity-50" />
                                <span className="text-xs">No containers found on this host or failed to connect.</span>
                            </div>
                        ) : (
                            containers.map(container => (
                                <label
                                    key={container.id}
                                    className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer border transition-colors ${accessList.has(container.id)
                                            ? 'bg-blue-500/10 border-blue-500/30'
                                            : 'bg-background hover:bg-muted border-border'
                                        }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${accessList.has(container.id)
                                            ? 'bg-blue-500 border-blue-500 text-white'
                                            : 'border-muted-foreground/30 bg-card'
                                        }`}>
                                        {accessList.has(container.id) && <Check className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{container.name}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">{container.image}</p>
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-center">
                    Changes take effect immediately for the selected user.
                </p>
            </div>
        </ConfirmModal>
    )
}
