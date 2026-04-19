'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Box, CheckCircle, Clock, Cpu, HardDrive, Play, Square, Network, TerminalSquare, AlertCircle, Loader2, Terminal, RefreshCw, FolderOpen, FileText, ChevronRight, Eye, X, Download, BarChart3, Activity, Wifi, Trash2, RotateCcw, Power, Pencil, Save, Camera } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ContainerEditModal from '@/components/ui/ContainerEditModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import moment from 'moment'

export default function ContainerInspectPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const params = useParams()
    const router = useRouter()
    const { id } = params

    const [container, setContainer] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('details') // details | json | logs | files | stats
    const [logs, setLogs] = useState([])
    const [loadingLogs, setLoadingLogs] = useState(false)
    const logsContainerRef = useRef(null)

    // Stats state
    const [statsHistory, setStatsHistory] = useState([])
    const [statsLoading, setStatsLoading] = useState(false)

    // Export state
    const [exportYaml, setExportYaml] = useState('')
    const [showExport, setShowExport] = useState(false)
    const [exportLoading, setExportLoading] = useState(false)

    // File Explorer state
    const [fileBrowserPath, setFileBrowserPath] = useState('/')
    const [files, setFiles] = useState([])
    const [loadingFiles, setLoadingFiles] = useState(false)
    const [fileViewContent, setFileViewContent] = useState('')
    const [fileViewName, setFileViewName] = useState('')
    const [fileViewOpen, setFileViewOpen] = useState(false)
    const [fileViewPath, setFileViewPath] = useState('')
    const [fileEditing, setFileEditing] = useState(false)
    const [fileEditContent, setFileEditContent] = useState('')
    const [fileSaving, setFileSaving] = useState(false)

    const [actionLoading, setActionLoading] = useState(null)
    const [confirmModal, setConfirmModal] = useState({ open: false, action: '' })
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [snapshotModalOpen, setSnapshotModalOpen] = useState(false)
    const [snapshotForm, setSnapshotForm] = useState({ repo: '', tag: 'latest', comment: '' })
    const [snapshotLoading, setSnapshotLoading] = useState(false)

    const toast = useToast()

    useEffect(() => {
        const fetchContainer = async () => {
            try {
                const res = await fetch(`/api/containers/${id}`)
                const data = await res.json()
                if (data.error) throw new Error(data.error)
                setContainer(data)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        if (id) fetchContainer()
    }, [id])

    // Fetch Logs — mapped to SSE stream
    useEffect(() => {
        let eventSource = null

        const startStreaming = () => {
            if (activeTab === 'logs' && !document.hidden && id) {
                if (logs.length === 0) setLoadingLogs(true)

                eventSource = new EventSource(`/api/containers/${id}/logs/stream?tail=200`)

                eventSource.onmessage = (event) => {
                    setLoadingLogs(false)
                    try {
                        const data = JSON.parse(event.data)
                        if (data.error) {
                            console.error('Logs stream error:', data.error)
                            return
                        }
                        if (data.log) {
                            const el = logsContainerRef.current
                            const wasAtBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight < 50) : true

                            setLogs(prev => {
                                const next = [...prev, data.log]
                                return next.slice(-500) // Keep last 500 lines in memory
                            })

                            if (wasAtBottom && el) {
                                requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
                            }
                        }
                    } catch (e) { }
                }

                eventSource.onerror = (err) => {
                    setLoadingLogs(false)
                    stopStreaming()
                    // Reconnect on error to maintain live tail
                    if (activeTab === 'logs' && !document.hidden) {
                        setTimeout(startStreaming, 3000)
                    }
                }
            }
        }

        const stopStreaming = () => {
            if (eventSource) {
                eventSource.close()
                eventSource = null
            }
        }

        const handleVisibility = () => {
            if (document.hidden) {
                stopStreaming()
            } else {
                startStreaming()
            }
        }

        startStreaming()
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            stopStreaming()
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [activeTab, id])

    // Fetch Stats — with visibility guard mapped to SSE stream
    useEffect(() => {
        let eventSource = null

        const startStreaming = () => {
            if (activeTab === 'stats' && !document.hidden && id) {
                if (statsHistory.length === 0) setStatsLoading(true)

                eventSource = new EventSource(`/api/containers/${id}/stats/stream`)

                eventSource.onmessage = (event) => {
                    setStatsLoading(false)
                    try {
                        const data = JSON.parse(event.data)
                        if (data.error) {
                            console.error('Stats stream error:', data.error)
                            return
                        }

                        setStatsHistory(prev => {
                            const next = [...prev, data]
                            return next.slice(-30) // keep last 30 data points
                        })
                    } catch (e) { }
                }

                eventSource.onerror = (err) => {
                    setStatsLoading(false)
                    stopStreaming()
                    // Wait a bit before reconnecting if active
                    if (activeTab === 'stats' && !document.hidden) {
                        setTimeout(startStreaming, 3000)
                    }
                }
            }
        }

        const stopStreaming = () => {
            if (eventSource) {
                eventSource.close()
                eventSource = null
            }
        }

        const handleVisibility = () => {
            if (document.hidden) {
                stopStreaming()
            } else {
                startStreaming()
            }
        }

        startStreaming()
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            stopStreaming()
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [activeTab, id])

    const handleExport = async () => {
        setExportLoading(true)
        try {
            const res = await fetch(`/api/containers/${id}/export`)
            const data = await res.json()
            if (data.yaml) {
                setExportYaml(data.yaml)
                setShowExport(true)
            } else {
                toast.error(data.error || 'Failed to export')
            }
        } catch {
            toast.error('Failed to export')
        }
        setExportLoading(false)
    }

    const handleAction = async (action) => {
        setActionLoading(action)
        const tid = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing container...`)
        try {
            const res = await fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, containerId: id }),
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: `Container ${action}ed successfully` })

                if (action === 'remove') {
                    router.push('/containers')
                    return
                }

                // Refresh container data
                const refetch = await fetch(`/api/containers/${id}`)
                const newData = await refetch.json()
                if (!newData.error) setContainer(newData)
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setActionLoading(null)
    }

    const confirmAction = () => {
        const { action } = confirmModal
        setConfirmModal({ open: false, action: '' })
        if (action) {
            handleAction(action)
        }
    }

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    const handleSnapshot = async () => {
        if (!snapshotForm.repo) return toast.error('Repository name is required')

        setSnapshotLoading(true)
        const tid = toast.loading('Creating snapshot...')
        try {
            const res = await fetch(`/api/containers/${id}/snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshotForm)
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)

            toast.update(tid, { type: 'success', message: `Snapshot created: ${snapshotForm.repo}:${snapshotForm.tag}` })
            setSnapshotModalOpen(false)
            setSnapshotForm({ repo: '', tag: 'latest', comment: '' })
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        } finally {
            setSnapshotLoading(false)
        }
    }

    // Fetch Files
    const fetchFiles = async (path = '/') => {
        setLoadingFiles(true)
        try {
            const res = await fetch(`/api/containers/${id}/files?path=${encodeURIComponent(path)}`)
            const data = await res.json()
            if (data.error) {
                toast.error(data.error)
                setFiles([])
            } else {
                setFiles(data.files || [])
            }
        } catch (err) {
            toast.error('Failed to fetch files')
            setFiles([])
        } finally {
            setLoadingFiles(false)
        }
    }

    const readFile = async (filePath, name) => {
        try {
            const res = await fetch(`/api/containers/${id}/files?action=read&path=${encodeURIComponent(filePath)}`)
            const data = await res.json()
            if (data.error) {
                toast.error(data.error)
                return
            }
            setFileViewContent(data.content || '')
            setFileEditContent(data.content || '')
            setFileViewName(name)
            setFileViewPath(filePath)
            setFileEditing(false)
            setFileViewOpen(true)
        } catch (err) {
            toast.error('Failed to read file')
        }
    }

    const saveFile = async () => {
        setFileSaving(true)
        const tid = toast.loading('Saving file...')
        try {
            const res = await fetch(`/api/containers/${id}/files`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fileViewPath, content: fileEditContent })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'File saved successfully!' })
                setFileViewContent(fileEditContent)
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setFileSaving(false)
    }

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
    }

    useEffect(() => {
        if (activeTab === 'files' && id) {
            fetchFiles(fileBrowserPath)
        }
    }, [activeTab])

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || !container) {
        return (
            <div className="max-w-3xl mx-auto mt-8 bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                    <h3 className="text-sm font-semibold text-red-400">Error Loading Container</h3>
                    <p className="text-sm text-red-400/80 mt-1">{error || 'Container not found'}</p>
                    <button onClick={() => router.push('/containers')} className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium rounded-lg transition-colors">
                        Back to Containers
                    </button>
                </div>
            </div>
        )
    }

    const { State, Config, NetworkSettings, HostConfig } = container
    const isRunning = State.Running

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/containers')} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors mt-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-foreground flex items-center gap-3">
                            {container.Name.replace('/', '')}
                            {!isViewer && (
                                <button onClick={() => setEditModalOpen(true)} className="p-1.5 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors" title="Edit Container">
                                    <Pencil className="w-4 h-4" />
                                </button>
                            )}
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                {State.Status}
                            </span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{id.substring(0, 12)}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        {!isViewer && isRunning && (
                            <a
                                href={`/containers/${id}/terminal`}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium"
                            >
                                <Terminal className="w-3.5 h-3.5" />
                                Open Terminal
                            </a>
                        )}
                        <button
                            onClick={handleExport}
                            disabled={exportLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 border border-border rounded-lg transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            {exportLoading ? 'Exporting...' : 'Export YAML'}
                        </button>
                        {!isViewer && (
                            <button
                                onClick={() => setSnapshotModalOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                            >
                                <Camera className="w-3.5 h-3.5" />
                                Snapshot
                            </button>
                        )}
                    </div>

                    {!isViewer && (
                        <div className="flex items-center gap-2 mt-1">
                            {isRunning ? (
                                <>
                                    <button onClick={() => setConfirmModal({ open: true, action: 'stop' })} disabled={!!actionLoading} className="p-1.5 bg-muted hover:bg-amber-500/20 hover:text-amber-400 text-muted-foreground border border-border rounded-md transition-colors" title="Stop">
                                        {actionLoading === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => setConfirmModal({ open: true, action: 'restart' })} disabled={!!actionLoading} className="p-1.5 bg-muted hover:bg-blue-500/20 hover:text-blue-400 text-muted-foreground border border-border rounded-md transition-colors" title="Restart">
                                        {actionLoading === 'restart' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => setConfirmModal({ open: true, action: 'kill' })} disabled={!!actionLoading} className="p-1.5 bg-muted hover:bg-red-500/20 hover:text-red-400 text-muted-foreground border border-border rounded-md transition-colors" title="Kill">
                                        {actionLoading === 'kill' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => handleAction('start')} disabled={!!actionLoading} className="p-1.5 bg-muted hover:bg-emerald-500/20 hover:text-emerald-400 text-muted-foreground border border-border rounded-md transition-colors" title="Start">
                                    {actionLoading === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                            )}
                            <button onClick={() => setConfirmModal({ open: true, action: 'remove' })} disabled={!!actionLoading} className="p-1.5 bg-muted hover:bg-red-500/20 hover:text-red-400 text-muted-foreground border border-border rounded-md transition-colors" title="Delete">
                                {actionLoading === 'remove' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex gap-2 p-1 bg-muted rounded-lg border border-border w-fit max-w-full overflow-x-auto">
                <button
                    onClick={() => setActiveTab('details')}
                    className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'details' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Details
                </button>
                <button
                    onClick={() => setActiveTab('json')}
                    className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors outline-none whitespace-nowrap ${activeTab === 'json' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Raw JSON
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors outline-none flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'logs' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Terminal className="w-3.5 h-3.5" /> Logs
                </button>
                {!isViewer && (
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors outline-none flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'files' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <FolderOpen className="w-3.5 h-3.5" /> Files
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors outline-none flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <BarChart3 className="w-3.5 h-3.5" /> Stats
                </button>
            </div>

            {activeTab === 'details' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-card border border-border rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                                <Box className="w-4 h-4 text-blue-400" /> Image Details
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Image</p>
                                    <p className="text-sm text-foreground font-mono">{Config.Image}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Command</p>
                                    <p className="text-sm text-foreground font-mono bg-muted px-2 py-1 rounded w-fit max-w-full truncate">
                                        {isViewer ? '••••••••••••••••' : ((Config.Cmd || []).join(' ') || (Config.Entrypoint || []).join(' ') || 'N/A')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Created At</p>
                                    <p className="text-sm text-foreground flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                        {moment(container.Created).format('MMM D, YYYY HH:mm:ss')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Started At</p>
                                    <p className="text-sm text-foreground">{moment(State.StartedAt).fromNow()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                                <Network className="w-4 h-4 text-emerald-400" /> Network & Ports
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Port Bindings</p>
                                    {Object.keys(HostConfig.PortBindings || {}).length > 0 ? (
                                        <div className="space-y-2">
                                            {Object.entries(HostConfig.PortBindings).map(([containerPort, bindings]) => (
                                                <div key={containerPort} className="flex flex-wrap gap-2">
                                                    {bindings.map((b, i) => (
                                                        <span key={i} className="px-2 py-1 bg-muted border border-border text-foreground text-xs rounded-md font-mono">
                                                            {b.HostIp ? `${b.HostIp}:` : ''}{b.HostPort} → {containerPort}
                                                        </span>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-foreground font-mono">—</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Networks</p>
                                    <div className="space-y-3">
                                        {Object.entries(NetworkSettings.Networks).map(([netName, net]) => (
                                            <div key={netName}>
                                                <p className="text-xs font-semibold text-emerald-400">{netName}</p>
                                                <p className="text-sm text-foreground font-mono mt-0.5">{net.IPAddress || 'No IP'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                                <TerminalSquare className="w-4 h-4 text-violet-400" /> Environment Variables
                            </h3>
                            <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                                {(Config.Env || []).length > 0 ? (
                                    (Config.Env || []).map((env, i) => {
                                        const [key, ...valParts] = env.split('=')
                                        const val = valParts.join('=')
                                        return (
                                            <div key={i} className="flex border-b border-border/50 pb-1 mb-1 last:border-0">
                                                <span className="text-xs font-semibold text-violet-300 w-1/3 break-words pr-2">{key}</span>
                                                <span className="text-xs text-foreground font-mono w-2/3 break-words">
                                                    {isViewer ? '••••••••••••••••' : val}
                                                </span>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <p className="text-sm text-foreground">No environment variables set</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-card border border-border rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-foreground mb-4">State</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Status</span>
                                    <span className="text-foreground capitalize">{State.Status}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Exit Code</span>
                                    <span className="text-foreground font-mono">{State.ExitCode}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">OOM Killed</span>
                                    <span className={State.OOMKilled ? 'text-red-400' : 'text-foreground'}>{State.OOMKilled ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Restarting</span>
                                    <span className={State.Restarting ? 'text-amber-400' : 'text-foreground'}>{State.Restarting ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Restart Count</span>
                                    <span className={container.RestartCount > 0 ? 'text-amber-400 font-bold' : 'text-foreground'}>{container.RestartCount || 0}</span>
                                </div>
                                {HostConfig.RestartPolicy && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Restart Policy</span>
                                        <span className="text-foreground font-mono">{HostConfig.RestartPolicy.Name || 'no'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6 overflow-hidden">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Volume Mounts</h3>
                            {container.Mounts.length === 0 ? (
                                <p className="text-sm text-foreground">No volumes mounted</p>
                            ) : (
                                <div className="space-y-4">
                                    {container.Mounts.map((m, i) => (
                                        <div key={i} className="text-sm">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
                                                <HardDrive className="w-3.5 h-3.5" /> {m.Type.toUpperCase()}
                                            </div>
                                            <p className="text-xs text-muted-foreground w-full break-all">Source <span className="text-foreground font-mono">{isViewer ? '••••••••••••••••' : (m.Source || m.Name)}</span></p>
                                            <p className="text-xs text-muted-foreground mt-0.5 w-full break-all">Destination <span className="text-foreground font-mono">{m.Destination}</span></p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'json' ? (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted px-4 py-2 border-b border-border flex justify-between items-center">
                        <span className="text-xs font-mono text-muted-foreground">container.json</span>
                    </div>
                    <pre className="p-4 overflow-auto max-h-[670px] text-xs font-mono text-blue-300">
                        {JSON.stringify(isViewer ? {
                            message: "Sensitive container configuration is hidden for viewer roles.",
                            error: "Access Denied"
                        } : container, null, 2)}
                    </pre>
                </div>
            ) : activeTab === 'logs' ? (
                <div className="bg-[#0a0e1a] border border-border rounded-xl flex flex-col h-[700px] overflow-hidden">
                    <div className="bg-card px-4 py-2 border-b border-border flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-mono text-muted-foreground">container logs (stdout/stderr)</span>
                        </div>
                        {loadingLogs && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    <div ref={logsContainerRef} className="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed text-gray-300/90 whitespace-pre-wrap break-all">
                        {logs.length === 0 && !loadingLogs ? (
                            <p className="text-muted-foreground italic text-center my-auto">No logs found</p>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="hover:bg-white/5 px-2 py-0.5 rounded -mx-2 transition-colors">{log}</div>
                            ))
                        )}
                    </div>
                </div>
            ) : activeTab === 'files' ? (
                /* Files Tab */
                <div className="bg-card border border-border rounded-xl flex flex-col h-[700px] overflow-hidden">
                    {/* Breadcrumb Header */}
                    <div className="bg-muted px-4 py-2.5 border-b border-border flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground overflow-x-auto">
                            <FolderOpen className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            {fileBrowserPath.split('/').filter(Boolean).length === 0 ? (
                                <span className="text-foreground font-semibold">/</span>
                            ) : (
                                <>
                                    <button onClick={() => { setFileBrowserPath('/'); fetchFiles('/') }} className="hover:text-foreground transition-colors">/</button>
                                    {fileBrowserPath.split('/').filter(Boolean).map((seg, i, arr) => {
                                        const fullPath = '/' + arr.slice(0, i + 1).join('/')
                                        const isLast = i === arr.length - 1
                                        return (
                                            <span key={i} className="flex items-center gap-1.5">
                                                <ChevronRight className="w-3 h-3" />
                                                {isLast ? (
                                                    <span className="text-foreground font-semibold">{seg}</span>
                                                ) : (
                                                    <button onClick={() => { setFileBrowserPath(fullPath); fetchFiles(fullPath) }} className="hover:text-foreground transition-colors">{seg}</button>
                                                )}
                                            </span>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                        <button onClick={() => fetchFiles(fileBrowserPath)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* File List */}
                    <div className="flex-1 overflow-y-auto">
                        {loadingFiles ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : !isRunning ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                                <AlertCircle className="w-8 h-8" />
                                <p className="text-sm">Container must be running to browse files</p>
                            </div>
                        ) : files.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                Empty directory
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead className="bg-muted/50 sticky top-0">
                                    <tr className="text-left text-muted-foreground">
                                        <th className="px-4 py-2 font-medium">Name</th>
                                        <th className="px-4 py-2 font-medium w-24">Size</th>
                                        <th className="px-4 py-2 font-medium w-28">Modified</th>
                                        <th className="px-4 py-2 font-medium w-28">Permissions</th>
                                        <th className="px-4 py-2 font-medium w-20">Owner</th>
                                        <th className="px-4 py-2 font-medium w-12"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map((f, i) => (
                                        <tr
                                            key={i}
                                            className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${f.isDirectory ? 'cursor-pointer' : ''}`}
                                            onClick={() => {
                                                if (f.isDirectory) {
                                                    const newPath = f.name === '..'
                                                        ? fileBrowserPath.split('/').slice(0, -1).join('/') || '/'
                                                        : (fileBrowserPath === '/' ? '/' + f.name : fileBrowserPath + '/' + f.name)
                                                    setFileBrowserPath(newPath)
                                                    fetchFiles(newPath)
                                                }
                                            }}
                                        >
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    {f.isDirectory ? (
                                                        <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                                    ) : (
                                                        <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                                    )}
                                                    <span className={`font-mono truncate ${f.isDirectory ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
                                                        {f.name}
                                                        {f.isSymlink && <span className="text-muted-foreground ml-1">→ {f.symlinkTarget}</span>}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground font-mono">
                                                {f.isDirectory ? '—' : formatFileSize(f.size)}
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground">{f.modified}</td>
                                            <td className="px-4 py-2 text-muted-foreground font-mono text-[10px]">{f.permissions}</td>
                                            <td className="px-4 py-2 text-muted-foreground">{f.owner}</td>
                                            <td className="px-4 py-2">
                                                {!f.isDirectory && f.size < 1048576 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); readFile(fileBrowserPath === '/' ? '/' + f.name : fileBrowserPath + '/' + f.name, f.name) }}
                                                        className="text-muted-foreground hover:text-blue-400 transition-colors"
                                                        title="View file"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* File Editor Modal */}
                    {fileViewOpen && typeof document !== 'undefined' && createPortal(
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-8" onClick={() => { setFileViewOpen(false); setFileEditing(false) }}>
                            <div className="bg-card border border-border rounded-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-mono text-foreground">{fileViewName}</span>
                                        {fileEditing && fileEditContent !== fileViewContent && (
                                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">Unsaved</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isViewer && (
                                            <>
                                                {fileEditing && (
                                                    <button
                                                        onClick={saveFile}
                                                        disabled={fileSaving || fileEditContent === fileViewContent}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        {fileSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                        Save
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        if (!fileEditing) setFileEditContent(fileViewContent)
                                                        setFileEditing(!fileEditing)
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${fileEditing
                                                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                                        : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                                                        }`}
                                                >
                                                    {fileEditing ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                                                    {fileEditing ? 'Read-only' : 'Edit'}
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => { setFileViewOpen(false); setFileEditing(false) }} className="text-muted-foreground hover:text-foreground transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                {fileEditing ? (
                                    <textarea
                                        value={fileEditContent}
                                        onChange={(e) => setFileEditContent(e.target.value)}
                                        onKeyDown={(e) => {
                                            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                                e.preventDefault()
                                                if (fileEditContent !== fileViewContent) saveFile()
                                            }
                                            if (e.key === 'Tab') {
                                                e.preventDefault()
                                                const start = e.target.selectionStart
                                                const end = e.target.selectionEnd
                                                setFileEditContent(
                                                    fileEditContent.substring(0, start) + '    ' + fileEditContent.substring(end)
                                                )
                                                setTimeout(() => {
                                                    e.target.selectionStart = e.target.selectionEnd = start + 4
                                                }, 0)
                                            }
                                        }}
                                        spellCheck={false}
                                        className="flex-1 p-4 overflow-auto text-xs font-mono text-foreground/90 bg-background resize-none focus:outline-none leading-relaxed"
                                    />
                                ) : (
                                    <pre className="p-4 overflow-auto flex-1 text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
                                        {fileViewContent}
                                    </pre>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            ) : null}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
                <div className="space-y-4">
                    {statsLoading && statsHistory.length === 0 ? (
                        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : !isRunning ? (
                        <div className="bg-card border border-border rounded-xl p-12 text-center">
                            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Container must be running to view stats</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* CPU */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5 text-blue-400" /> CPU Usage
                                </h3>
                                <p className="text-3xl font-bold text-foreground mb-3">{statsHistory.length > 0 ? statsHistory[statsHistory.length - 1].cpu.toFixed(1) : '0'}%</p>
                                <div className="flex items-end gap-0.5 h-16">
                                    {statsHistory.map((s, i) => (
                                        <div key={i} className="flex-1 bg-blue-500/20 rounded-t relative overflow-hidden" style={{ height: '100%' }}>
                                            <div className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t transition-all" style={{ height: `${Math.min(s.cpu, 100)}%` }} />
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 30 - statsHistory.length) }).map((_, i) => (
                                        <div key={`e-${i}`} className="flex-1 bg-muted rounded-t" style={{ height: '100%' }} />
                                    ))}
                                </div>
                            </div>

                            {/* Memory */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> Memory Usage
                                </h3>
                                <p className="text-3xl font-bold text-foreground mb-1">
                                    {statsHistory.length > 0 ? formatBytes(statsHistory[statsHistory.length - 1].memUsage) : '0 B'}
                                </p>
                                <p className="text-xs text-muted-foreground mb-3">
                                    of {statsHistory.length > 0 ? formatBytes(statsHistory[statsHistory.length - 1].memLimit) : '—'} ({statsHistory.length > 0 ? statsHistory[statsHistory.length - 1].memPercent.toFixed(1) : '0'}%)
                                </p>
                                <div className="flex items-end gap-0.5 h-16">
                                    {statsHistory.map((s, i) => (
                                        <div key={i} className="flex-1 bg-emerald-500/20 rounded-t relative overflow-hidden" style={{ height: '100%' }}>
                                            <div className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t transition-all" style={{ height: `${Math.min(s.memPercent, 100)}%` }} />
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 30 - statsHistory.length) }).map((_, i) => (
                                        <div key={`e-${i}`} className="flex-1 bg-muted rounded-t" style={{ height: '100%' }} />
                                    ))}
                                </div>
                            </div>

                            {/* Network */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Wifi className="w-3.5 h-3.5 text-violet-400" /> Network I/O
                                </h3>
                                <div className="space-y-1 mb-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">↓ RX</span>
                                        <span className="text-foreground font-mono">{statsHistory.length > 0 ? formatBytes(statsHistory[statsHistory.length - 1].netRx) : '0 B'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">↑ TX</span>
                                        <span className="text-foreground font-mono">{statsHistory.length > 0 ? formatBytes(statsHistory[statsHistory.length - 1].netTx) : '0 B'}</span>
                                    </div>
                                </div>
                                <div className="flex items-end gap-0.5 h-16">
                                    {statsHistory.map((s, i) => {
                                        const maxNet = Math.max(...statsHistory.map(h => h.netRx + h.netTx)) || 1
                                        const pct = ((s.netRx + s.netTx) / maxNet) * 100
                                        return (
                                            <div key={i} className="flex-1 bg-violet-500/20 rounded-t relative overflow-hidden" style={{ height: '100%' }}>
                                                <div className="absolute bottom-0 left-0 right-0 bg-violet-500 rounded-t transition-all" style={{ height: `${pct}%` }} />
                                            </div>
                                        )
                                    })}
                                    {Array.from({ length: Math.max(0, 30 - statsHistory.length) }).map((_, i) => (
                                        <div key={`e-${i}`} className="flex-1 bg-muted rounded-t" style={{ height: '100%' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {statsHistory.length > 0 && (
                        <p className="text-[10px] text-muted-foreground text-center">Polling every 2 seconds • {statsHistory.length}/30 data points</p>
                    )}
                </div>
            )}

            {/* Export YAML Modal */}
            {showExport && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowExport(false)}>
                    <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Download className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-medium text-foreground">docker-compose.yml</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { navigator.clipboard.writeText(exportYaml); toast.success('Copied to clipboard!') }}
                                    className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
                                >
                                    Copy
                                </button>
                                <button onClick={() => setShowExport(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <pre className="p-4 overflow-auto flex-1 text-xs font-mono text-foreground/90 whitespace-pre-wrap">
                            {exportYaml}
                        </pre>
                    </div>
                </div>,
                document.body
            )}

            {/* Snapshot Modal */}
            <ConfirmModal
                open={snapshotModalOpen}
                onClose={() => setSnapshotModalOpen(false)}
                onConfirm={handleSnapshot}
                title="Create Container Snapshot"
                message="Commit the current state of this container to a new Docker image."
                confirmText={snapshotLoading ? "Creating..." : "Create Snapshot"}
                variant="info"
            >
                <div className="space-y-4 mt-4 text-left">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repository Name (Required)</label>
                        <input
                            type="text"
                            placeholder="my-app-snapshot"
                            value={snapshotForm.repo}
                            onChange={(e) => setSnapshotForm({ ...snapshotForm, repo: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tag</label>
                        <input
                            type="text"
                            placeholder="latest"
                            value={snapshotForm.tag}
                            onChange={(e) => setSnapshotForm({ ...snapshotForm, tag: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment (Optional)</label>
                        <input
                            type="text"
                            placeholder="Before upgrading dependencies"
                            value={snapshotForm.comment}
                            onChange={(e) => setSnapshotForm({ ...snapshotForm, comment: e.target.value })}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>
                </div>
            </ConfirmModal>

            {/* Confirmation Modal */}
            {confirmModal.open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setConfirmModal({ open: false, action: '' })}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-400">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Confirm Action</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Are you sure you want to <strong className="uppercase">{confirmModal.action}</strong> this container?
                                {confirmModal.action === 'remove' && ' This will delete the container permanently.'}
                            </p>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setConfirmModal({ open: false, action: '' })}
                                    className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmAction}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm capitalize"
                                >
                                    Confirm {confirmModal.action}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ContainerEditModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                container={container}
                onSuccess={(newId) => router.push(`/containers/${newId}`)}
            />
        </div>
    )
}
