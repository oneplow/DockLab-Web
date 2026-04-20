'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Settings, Server, Palette, Users, Save, Shield, Moon, Sun, Trash2, Monitor, Activity, Clock, Plug, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Pencil } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import ContainerAccessModal from './ContainerAccessModal'
import WebhooksManager from './WebhooksManager'

export default function SettingsPage() {
    const { data: session } = useSession()
    const { theme, setTheme } = useTheme()
    const toast = useToast()
    const [hosts, setHosts] = useState([])
    const [loadingHosts, setLoadingHosts] = useState(true)
    const [newHostModal, setNewHostModal] = useState(false)
    const [newHostForm, setNewHostForm] = useState({ name: '', socketPath: '', isLocal: false, connectionType: 'docklab-server', apiKey: '' })
    const [testResult, setTestResult] = useState(null) // { status: 'testing' | 'success' | 'error', message?, docker? }

    const [socketPath, setSocketPath] = useState('Loading...')
    const [users, setUsers] = useState([])
    const [loadingUsers, setLoadingUsers] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [deleteModal, setDeleteModal] = useState({ open: false, user: null })
    const [auditLogs, setAuditLogs] = useState([])
    const [auditPage, setAuditPage] = useState(1)
    const [auditTotalPages, setAuditTotalPages] = useState(1)
    const [hostDeleteConfirm, setHostDeleteConfirm] = useState({ open: false, hostId: null, hostName: '' })
    const [editHostModal, setEditHostModal] = useState({ open: false, hostId: null, name: '' })
    const [whitelistModal, setWhitelistModal] = useState({ open: false, hostId: null, hostName: '', list: [], loading: false })
    const [containerAccessModal, setContainerAccessModal] = useState({ open: false, user: null })

    const isAdmin = session?.user?.role === 'admin'
    const isDeveloper = session?.user?.role === 'developer'
    const isViewer = session?.user?.role === 'viewer'

    useEffect(() => {
        // Fetch actual socket path and docker hosts
        if (session && !isViewer) {
            fetch('/api/settings')
                .then(r => r.json())
                .then(data => {
                    if (data.socketPath) setSocketPath(data.socketPath)
                })
                .catch(err => console.error('Failed to fetch settings', err))

            fetch('/api/settings/hosts')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setHosts(data)
                })
                .finally(() => setLoadingHosts(false))
        }
    }, [session, isViewer])

    useEffect(() => {
        setMounted(true)
        if (isAdmin || isDeveloper) {
            setLoadingUsers(true)
            fetch('/api/users')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setUsers(data)
                })
                .finally(() => setLoadingUsers(false))

            fetchAuditLogs(1)
        }
    }, [isAdmin, isDeveloper])

    const fetchAuditLogs = async (page = 1) => {
        try {
            const res = await fetch(`/api/audit?page=${page}&limit=10`)
            if (res.ok) {
                const data = await res.json()
                setAuditLogs(data.logs || [])
                setAuditPage(data.page)
                setAuditTotalPages(data.totalPages)
            }
        } catch (err) { }
    }

    const handleTestConnection = async () => {
        if (!newHostForm.socketPath) return toast.error('URL/Socket Path is required')
        if (newHostForm.connectionType === 'docklab-server' && !newHostForm.apiKey) return toast.error('API Key is required for Docklab-server connections')

        setTestResult({ status: 'testing' })
        try {
            const res = await fetch('/api/settings/hosts/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: newHostForm.socketPath,
                    apiKey: newHostForm.apiKey,
                    connectionType: newHostForm.connectionType
                })
            })
            const data = await res.json()
            if (data.success) {
                setTestResult({ status: 'success', docker: data.docker, 'docklab-server': ['docklab-server'] })
            } else {
                setTestResult({ status: 'error', message: data.error || 'Connection failed' })
            }
        } catch (e) {
            setTestResult({ status: 'error', message: e.message })
        }
    }

    const handleAddHost = async () => {
        if (!newHostForm.name || !newHostForm.socketPath) return toast.error('Name and URL/Socket Path are required')
        if (newHostForm.connectionType === 'docklab-server' && !newHostForm.apiKey) return toast.error('API Key is required for Docklab-server connections')
        const tid = toast.loading('Adding host...')
        try {
            const res = await fetch('/api/settings/hosts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newHostForm)
            })
            if (res.ok) {
                const newHost = await res.json()
                setHosts([newHost, ...hosts])
                setNewHostModal(false)
                setNewHostForm({ name: '', socketPath: '', isLocal: false, connectionType: 'docklab-server', apiKey: '' })
                setTestResult(null)
                toast.update(tid, { type: 'success', message: 'Host added successfully' })
                window.dispatchEvent(new CustomEvent('hosts-updated'))
            } else {
                const error = await res.json()
                toast.update(tid, { type: 'error', message: error.error || 'Failed to add host' })
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
    }

    const handleDeleteHost = async (id) => {
        const tid = toast.loading('Removing host...')
        try {
            const res = await fetch('/api/settings/hosts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            })
            if (res.ok) {
                setHosts(hosts.filter(h => h.id !== id))
                toast.update(tid, { type: 'success', message: 'Host removed' })
                window.dispatchEvent(new CustomEvent('hosts-updated'))
            } else {
                toast.update(tid, { type: 'error', message: 'Failed to remove host' })
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setHostDeleteConfirm({ open: false, hostId: null, hostName: '' })
    }

    const handleEditHost = async () => {
        if (!editHostModal.name) return toast.error('Name is required')
        const tid = toast.loading('Renaming host...')
        try {
            const res = await fetch('/api/settings/hosts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editHostModal.hostId, name: editHostModal.name })
            })
            if (res.ok) {
                const updated = await res.json()
                setHosts(hosts.map(h => h.id === updated.id ? updated : h))
                toast.update(tid, { type: 'success', message: 'Host renamed' })
                window.dispatchEvent(new CustomEvent('hosts-updated'))
                setEditHostModal({ open: false, hostId: null, name: '' })
            } else {
                toast.update(tid, { type: 'error', message: 'Failed to rename host' })
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
    }

    const openWhitelist = async (host) => {
        setWhitelistModal({ open: true, hostId: host.id, hostName: host.name, list: [], loading: true })
        try {
            const res = await fetch(`/api/settings/hosts/whitelist?hostId=${host.id}`)
            if (res.ok) {
                const data = await res.json()
                setWhitelistModal(prev => ({ ...prev, list: Array.isArray(data) ? data : [], loading: false }))
            } else {
                toast.error('Failed to fetch whitelist')
                setWhitelistModal(prev => ({ ...prev, loading: false }))
            }
        } catch (e) {
            toast.error(e.message)
            setWhitelistModal(prev => ({ ...prev, loading: false }))
        }
    }

    const handleUpdateWhitelist = async (newList) => {
        const tid = toast.loading('Updating whitelist...')
        try {
            const res = await fetch('/api/settings/hosts/whitelist', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId: whitelistModal.hostId, whitelist: newList })
            })
            if (res.ok) {
                toast.update(tid, { type: 'success', message: 'Whitelist updated' })
                setWhitelistModal(prev => ({ ...prev, list: newList, open: false }))
            } else {
                const err = await res.json()
                toast.update(tid, { type: 'error', message: err.error || 'Failed to update whitelist' })
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
    }

    const handleChangeRole = async (userId, newRole) => {
        const tid = toast.loading('Changing user role...')
        try {
            const res = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role: newRole })
            })
            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
                toast.update(tid, { type: 'success', message: 'Role updated' })
            } else {
                toast.update(tid, { type: 'error', message: 'Failed to update role' })
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
    }

    const handleDeleteUser = async () => {
        const userId = deleteModal.user?.id
        if (!userId) return
        const tid = toast.loading('Deleting user...')
        try {
            const res = await fetch('/api/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            })
            if (res.ok) {
                setUsers(users.filter(u => u.id !== userId))
                toast.update(tid, { type: 'success', message: 'User deleted' })
            } else {
                toast.update(tid, { type: 'error', message: 'Failed to delete user' })
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setDeleteModal({ open: false, user: null })
    }

    const themeOptions = [
        { value: 'dark', label: 'Dark', icon: Moon },
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'system', label: 'System', icon: Monitor },
    ]

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            <div>
                <h1 className="text-xl font-bold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Configure your Docklab instance</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    {/* Docker Configuration */}
                    {!isViewer ? (
                        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Server className="w-5 h-5 text-blue-400" />
                                    <h2 className="text-sm font-semibold text-foreground">Docker Hosts Management</h2>
                                </div>
                                <button
                                    onClick={() => setNewHostModal(true)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
                                >
                                    + Add Host
                                </button>
                            </div>

                            {/* Remote Hosts */}
                            <div className="space-y-3">
                                {loadingHosts ? (
                                    <div className="text-center py-4 text-xs text-muted-foreground">Loading hosts...</div>
                                ) : hosts.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">No additional hosts configured.</div>
                                ) : hosts.map(host => (
                                    <div key={host.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted rounded-lg border border-border">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-sm font-bold text-foreground">{host.name}</h3>
                                                {host.isLocal && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded-full uppercase font-bold tracking-wider">Local</span>}
                                                <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-bold tracking-wider ${host.connectionType === 'docklab-server'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                    }`}>
                                                    {host.connectionType === 'docklab-server' ? 'Docklab-server' : 'TCP'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{host.socketPath}</p>
                                        </div>
                                        {(isAdmin || isDeveloper) && (
                                            <div className="flex items-center gap-1 self-end sm:self-auto">
                                                {host.connectionType === 'docklab-server' && (
                                                    <button
                                                        onClick={() => openWhitelist(host)}
                                                        title="Security Settings"
                                                        className="p-2 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors"
                                                    >
                                                        <Shield className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setEditHostModal({ open: true, hostId: host.id, name: host.name })}
                                                    title="Rename Host"
                                                    className="p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setHostDeleteConfirm({ open: true, hostId: host.id, hostName: host.name })}
                                                    title="Remove Host"
                                                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center">
                                <Server className="w-8 h-8 opacity-80" />
                            </div>
                            <div>
                                <h3 className="text-foreground font-semibold">Docker Configuration</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-[250px]">
                                    Only Developers or Administrators can view and modify core Docker settings.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Appearance - Real-time theme toggle */}
                    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Palette className="w-5 h-5 text-violet-400" />
                            <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-foreground">Theme Preference</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Changes apply instantly across all devices</p>
                            </div>
                            <div className="flex gap-2">
                                {mounted ? themeOptions.map(opt => {
                                    const Icon = opt.icon
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => setTheme(opt.value)}
                                            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all border ${theme === opt.value
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4" /> {opt.label}
                                        </button>
                                    )
                                }) : (
                                    <div className="w-[200px] h-[36px] bg-muted rounded-lg animate-pulse" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* User Account */}
                    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-5 h-5 text-emerald-400" />
                            <h2 className="text-sm font-semibold text-foreground">Current Account</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-muted rounded-lg border border-border">
                            {session?.user?.image && (
                                <img src={session.user.image} alt="" className="w-12 h-12 rounded-full border-2 border-border flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-base font-bold text-foreground">{session?.user?.name || 'User'}</p>
                                <p className="text-sm text-muted-foreground truncate">{session?.user?.email}</p>
                            </div>
                            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-full font-bold uppercase tracking-wider self-start sm:self-auto flex-shrink-0">
                                {session?.user?.role || 'developer'}
                            </span>
                        </div>
                    </div>

                    {/* User Management (Admin / Developer) */}
                    {(isAdmin || isDeveloper) && (
                        <div className="bg-card border border-border rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4 hover:group">
                                <Users className="w-5 h-5 text-orange-400" />
                                <h2 className="text-sm font-semibold text-foreground">User Management</h2>
                                <span className="ml-auto px-2 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] rounded-full border border-orange-500/20 font-bold uppercase tracking-wider">{isAdmin ? 'Admin' : 'Developer'}</span>
                            </div>
                            <div className="space-y-3">
                                {loadingUsers ? (
                                    <div className="text-center py-8 text-xs text-muted-foreground">Loading users...</div>
                                ) : users.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-muted-foreground">No users found or error loading.</div>
                                ) : (
                                    users.map(u => (
                                        <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-4 bg-muted rounded-lg border border-border">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-sm text-blue-400 font-bold flex-shrink-0">
                                                    {u.name?.[0] || u.email?.[0] || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{u.name || 'Unnamed'}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                                                    disabled={session?.user?.id === u.id}
                                                    className={`px-3 py-1.5 text-xs rounded-lg border font-bold uppercase tracking-wider focus:outline-none appearance-none cursor-pointer bg-card ${u.role === 'admin' ? 'text-orange-400 border-orange-500/30'
                                                        : u.role === 'developer' ? 'text-blue-400 border-blue-500/30'
                                                            : 'text-muted-foreground border-border'
                                                        }`}
                                                >
                                                    <option value="viewer">Viewer</option>
                                                    <option value="developer">Developer</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                {['viewer', 'developer'].includes(u.role) && (
                                                    <button
                                                        onClick={() => setContainerAccessModal({ open: true, user: u })}
                                                        title="Manage Container Access"
                                                        className="p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors"
                                                    >
                                                        <Shield className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setDeleteModal({ open: true, user: u })}
                                                    disabled={session?.user?.id === u.id}
                                                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors disabled:opacity-30"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* Webhooks Manager (Admin / Developer) */}
            {(isAdmin || isDeveloper) && (
                <div className="mt-6">
                    <WebhooksManager />
                </div>
            )}

            {/* Audit Logs (Admin / Developer) */}
            {(isAdmin || isDeveloper) && (
                <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
                    <div className="flex items-center gap-2 p-6 pb-4 border-b border-border">
                        <Activity className="w-5 h-5 text-purple-400" />
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">System Audit Log</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Timeline of all administrative and user actions.</p>
                        </div>
                        <span className="ml-auto px-2 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] rounded-full border border-orange-500/20 font-bold uppercase tracking-wider">{isAdmin ? 'Admin' : 'Developer'}</span>
                    </div>
                    {auditLogs.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">No activity logs found.</div>
                    ) : (
                        <>
                            {/* Desktop table view */}
                            <div className="hidden md:block">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b border-border">
                                        <tr className="text-left text-muted-foreground/80">
                                            <th className="px-5 py-3 font-medium">Time</th>
                                            <th className="px-5 py-3 font-medium">User</th>
                                            <th className="px-5 py-3 font-medium">Action</th>
                                            <th className="px-5 py-3 font-medium">Target</th>
                                            <th className="px-5 py-3 font-medium">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map((log) => (
                                            <tr key={log.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                                <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 min-w-[120px]">
                                                        <Clock className="w-3.5 h-3.5 opacity-60" />
                                                        {new Date(log.createdAt).toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {log.userImage ? (
                                                            <img src={log.userImage} alt="" className="w-5 h-5 rounded-full" />
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px] font-bold">
                                                                {log.userName?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                        )}
                                                        <span className="font-medium text-foreground text-xs">{log.userName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-muted/60 text-foreground/80">
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 font-mono text-xs">{log.target || '-'}</td>
                                                <td className="px-5 py-3 text-muted-foreground text-xs">{log.details || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Mobile card view */}
                            <div className="md:hidden divide-y divide-border/30">
                                {auditLogs.map((log) => (
                                    <div key={log.id} className="p-4 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {log.userImage ? (
                                                    <img src={log.userImage} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                                        {log.userName?.charAt(0)?.toUpperCase() || '?'}
                                                    </div>
                                                )}
                                                <span className="font-medium text-foreground text-xs truncate">{log.userName}</span>
                                            </div>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-muted/60 text-foreground/80 flex-shrink-0">
                                                {log.action}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock className="w-3 h-3 opacity-60 flex-shrink-0" />
                                            {new Date(log.createdAt).toLocaleString()}
                                        </div>
                                        {log.target && log.target !== '-' && (
                                            <p className="text-xs font-mono text-foreground/70 truncate">Target: {log.target}</p>
                                        )}
                                        {log.details && log.details !== '-' && (
                                            <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {/* Pagination */}
                    {auditTotalPages > 1 && (
                        <div className="px-5 py-3 bg-muted/30 flex justify-between items-center">
                            <button
                                disabled={auditPage <= 1}
                                onClick={() => fetchAuditLogs(auditPage - 1)}
                                className="px-3 py-1.5 text-xs font-semibold bg-background border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                            >Previous</button>
                            <span className="text-xs font-medium text-muted-foreground">Page {auditPage} of {auditTotalPages}</span>
                            <button
                                disabled={auditPage >= auditTotalPages}
                                onClick={() => fetchAuditLogs(auditPage + 1)}
                                className="px-3 py-1.5 text-xs font-semibold bg-background border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                            >Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* Delete User Confirm Modal */}
            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, user: null })}
                onConfirm={handleDeleteUser}
                title="Delete User"
                message={`Are you sure you want to delete "${deleteModal.user?.name || deleteModal.user?.email}"? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
            />

            {/* Delete Host Confirm Modal */}
            <ConfirmModal
                open={hostDeleteConfirm.open}
                onClose={() => setHostDeleteConfirm({ open: false, hostId: null, hostName: '' })}
                onConfirm={() => handleDeleteHost(hostDeleteConfirm.hostId)}
                title="Remove Docker Host"
                message={`Are you sure you want to remove "${hostDeleteConfirm.hostName}"? This will disconnect Docklab from this host.`}
                confirmText="Remove"
                variant="danger"
            />

            {/* Edit Host Modal */}
            <ConfirmModal
                open={editHostModal.open}
                onClose={() => setEditHostModal({ open: false, hostId: null, name: '' })}
                onConfirm={handleEditHost}
                title="Rename Docker Host"
                message="Choose a new display name for this host."
                confirmText="Save Name"
                variant="info"
            >
                <div className="mt-4">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Display Name</label>
                    <input
                        type="text"
                        value={editHostModal.name}
                        onChange={(e) => setEditHostModal({ ...editHostModal, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleEditHost()}
                        autoFocus
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                    />
                </div>
            </ConfirmModal>

            {/* Whitelist Modal */}
            <ConfirmModal
                open={whitelistModal.open}
                onClose={() => setWhitelistModal({ open: false, hostId: null, hostName: '', list: [], loading: false })}
                onConfirm={() => handleUpdateWhitelist(whitelistModal.list)}
                title={`Security Whitelist: ${whitelistModal.hostName}`}
                message="Restrict connections to this host to only these IPs. Leave empty to allow all."
                confirmText="Save Whitelist"
                variant="success"
            >
                {whitelistModal.loading ? (
                    <div className="py-10 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-xs text-muted-foreground">Fetching whitelist...</span>
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                            {whitelistModal.list.map((ip, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={ip}
                                        onChange={(e) => {
                                            const newList = [...whitelistModal.list]
                                            newList[idx] = e.target.value
                                            setWhitelistModal({ ...whitelistModal, list: newList })
                                        }}
                                        placeholder="e.g. 1.2.3.4 or 10.0.*"
                                        className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50 transition-colors"
                                    />
                                    <button
                                        onClick={() => {
                                            const newList = whitelistModal.list.filter((_, i) => i !== idx)
                                            setWhitelistModal({ ...whitelistModal, list: newList })
                                        }}
                                        className="p-2 text-muted-foreground hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => setWhitelistModal({ ...whitelistModal, list: [...whitelistModal.list, ''] })}
                                className="w-full py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-all"
                            >
                                + Add IP / Pattern
                            </button>
                        </div>
                        <div className="p-3 bg-muted rounded-lg border border-border">
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                <span className="font-bold text-emerald-400">Tip:</span> You can use exact IPs like <code className="text-foreground/70">1.2.3.4</code> or wildcard patterns like <code className="text-foreground/70">192.168.*</code>
                            </p>
                        </div>
                    </div>
                )}
            </ConfirmModal>

            {/* Add Host Modal */}
            <ConfirmModal
                open={newHostModal}
                onClose={() => { setNewHostModal(false); setTestResult(null) }}
                onConfirm={handleAddHost}
                title="Add Docker Host"
                message="Connect to a Docker host using Docklab-server Agent (recommended) or direct TCP."
                confirmText="Save Host"
                variant="info"
            >
                <div className="space-y-4 mt-4 text-left">
                    {/* Connection Type Selector */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2">Connection Type</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setNewHostForm({ ...newHostForm, connectionType: 'docklab-server', socketPath: '', apiKey: '' }); setTestResult(null) }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${newHostForm.connectionType === 'docklab-server'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/20'
                                    : 'bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                                    }`}
                            >
                                <Shield className="w-4 h-4" />
                                Docklab-server Agent
                            </button>
                            <button
                                type="button"
                                onClick={() => { setNewHostForm({ ...newHostForm, connectionType: 'tcp', socketPath: '', apiKey: '' }); setTestResult(null) }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${newHostForm.connectionType === 'tcp'
                                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 ring-1 ring-orange-500/20'
                                    : 'bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                                    }`}
                            >
                                <Wifi className="w-4 h-4" />
                                TCP Direct
                            </button>
                        </div>
                        {newHostForm.connectionType === 'docklab-server' && (
                            <p className="text-[10px] text-emerald-400/70 mt-1.5">Secure — uses API key authentication via docklab-server daemon</p>
                        )}
                        {newHostForm.connectionType === 'tcp' && (
                            <p className="text-[10px] text-orange-400/70 mt-1.5">⚠ Not recommended for public IPs — no authentication</p>
                        )}
                    </div>

                    {/* Host Name */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Host Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Production VPS"
                            value={newHostForm.name}
                            onChange={(e) => setNewHostForm({ ...newHostForm, name: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>

                    {/* URL / Socket Path */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                            {newHostForm.connectionType === 'docklab-server' ? 'Docklab-server URL' : 'Socket Path / URL'}
                        </label>
                        <input
                            type="text"
                            placeholder={newHostForm.connectionType === 'docklab-server' ? 'e.g. http://1.2.3.4:9117' : 'e.g. tcp://192.168.1.10:2375'}
                            value={newHostForm.socketPath}
                            onChange={(e) => { setNewHostForm({ ...newHostForm, socketPath: e.target.value }); setTestResult(null) }}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>

                    {/* API Key (docklab-server only) */}
                    {newHostForm.connectionType === 'docklab-server' && (
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">API Key</label>
                            <input
                                type="password"
                                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                value={newHostForm.apiKey}
                                onChange={(e) => { setNewHostForm({ ...newHostForm, apiKey: e.target.value }); setTestResult(null) }}
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Get this from <code className="text-foreground/70">docker logs docklab-server</code> on your VPS</p>
                        </div>
                    )}

                    {/* Local host checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                        <input
                            type="checkbox"
                            checked={newHostForm.isLocal}
                            onChange={(e) => setNewHostForm({ ...newHostForm, isLocal: e.target.checked })}
                            className="rounded border-border text-blue-500 bg-muted focus:ring-blue-500"
                        />
                        <span className="text-xs text-muted-foreground font-medium">Mark as local host</span>
                    </label>

                    {/* Test Connection Button */}
                    <div className="pt-1">
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={testResult?.status === 'testing'}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-muted border border-border rounded-lg text-sm font-medium text-foreground hover:bg-card hover:border-blue-500/30 transition-all disabled:opacity-50"
                        >
                            {testResult?.status === 'testing' ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Connection...</>
                            ) : (
                                <><Plug className="w-4 h-4" /> Connection</>
                            )}
                        </button>

                        {/* Test Result */}
                        {testResult?.status === 'success' && (
                            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-emerald-400">Connected successfully!</p>
                                    {testResult.docker && (
                                        <p className="text-[10px] text-emerald-400/70 mt-0.5">
                                            Docker {testResult.docker.version} • {testResult.docker.os}/{testResult.docker.arch}
                                            {['docklab-server'] && ` • docklab-server ${['docklab-server']}`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        {testResult?.status === 'error' && (
                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-red-400">Connection failed</p>
                                    <p className="text-[10px] text-red-400/70 mt-0.5">{testResult.message}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </ConfirmModal>

            {/* View Container Access Modal */}
            <ContainerAccessModal
                open={containerAccessModal.open}
                onClose={() => setContainerAccessModal({ open: false, user: null })}
                user={containerAccessModal.user}
                hosts={hosts}
            />
        </div>
    )
}
