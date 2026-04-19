'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Square, RotateCcw, Power, Trash2, Eye, Search, RefreshCw, Plus, Loader2, X, ChevronDown, Star } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

function StatusBadge({ status }) {
    const map = {
        running: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
        exited: 'bg-red-400/10 text-red-400 border-red-400/20',
        paused: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
        created: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    }
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${map[status] || map.created}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-current'}`} />
            {status}
        </span>
    )
}

export default function ContainersPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const [containers, setContainers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const [actionLoading, setActionLoading] = useState(null)
    const [apiError, setApiError] = useState(null)
    const toast = useToast()

    // New container modal
    const [showNewModal, setShowNewModal] = useState(false)
    const [newImage, setNewImage] = useState('')
    const [newName, setNewName] = useState('')
    const [newPorts, setNewPorts] = useState('')
    const [newEnv, setNewEnv] = useState('')
    const [newNetwork, setNewNetwork] = useState('bridge')
    const [newRestartPolicy, setNewRestartPolicy] = useState('no')
    const [creating, setCreating] = useState(false)
    const [localImages, setLocalImages] = useState([])
    const [localNetworks, setLocalNetworks] = useState([])
    const [localVolumes, setLocalVolumes] = useState([])
    const [imageDropdownOpen, setImageDropdownOpen] = useState(false)
    const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false)
    const [restartDropdownOpen, setRestartDropdownOpen] = useState(false)
    const [volumeDropdownOpen, setVolumeDropdownOpen] = useState(false)
    const [inspectingImage, setInspectingImage] = useState(false)
    const [suggestedPorts, setSuggestedPorts] = useState([])
    const [newVolume, setNewVolume] = useState('')
    const [newVolumeMountPath, setNewVolumeMountPath] = useState('')

    // Favorites
    const [favorites, setFavorites] = useState([])

    // Bulk Actions
    const [selectedContainers, setSelectedContainers] = useState([])

    // Confirm modal
    const [confirmModal, setConfirmModal] = useState({ open: false, action: '', container: null })

    useEffect(() => {
        const saved = localStorage.getItem('docklab_favorites')
        if (saved) {
            try { setFavorites(JSON.parse(saved)) } catch { }
        }
    }, [])

    const toggleFavorite = (id) => {
        const newFavs = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id]
        setFavorites(newFavs)
        localStorage.setItem('docklab_favorites', JSON.stringify(newFavs))
    }

    const handleBulkAction = async (action) => {
        if (selectedContainers.length === 0) return
        const tid = toast.loading(`Bulk ${action}ing ${selectedContainers.length} containers...`)
        try {
            const promises = selectedContainers.map(id => fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, containerId: id })
            }))
            await Promise.all(promises)
            toast.update(tid, { type: 'success', message: `Successfully ${action}ed selected containers` })
            setSelectedContainers([])
            fetchContainers()
        } catch (err) {
            toast.update(tid, { type: 'error', message: `Failed to execute bulk action` })
        }
    }

    const toggleSelectAll = () => {
        if (selectedContainers.length === filtered.length) {
            setSelectedContainers([])
        } else {
            setSelectedContainers(filtered.map(c => c.id))
        }
    }

    const fetchContainers = () => {
        setLoading(true)
        setApiError(null)
        fetch('/api/containers')
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setApiError(data.error)
                    setContainers([])
                } else if (Array.isArray(data)) {
                    setContainers(data)
                } else {
                    setContainers([])
                }
            })
            .catch(err => {
                setApiError(err.message || 'An unknown error occurred')
                setContainers([])
            })
            .finally(() => setLoading(false))
    }

    const fetchImages = () => {
        fetch('/api/images')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Extract repository:tag from repoTags array
                    const tags = data.flatMap(img => img.repoTags || [])
                        .filter(tag => tag && tag !== '<none>:<none>')
                    setLocalImages([...new Set(tags)].sort())
                }
            })
            .catch(() => { }) // non-critical
    }

    const fetchNetworksList = () => {
        fetch('/api/networks')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setLocalNetworks(data)
                }
            })
            .catch(() => { }) // non-critical
    }

    const fetchVolumesList = () => {
        fetch('/api/volumes')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setLocalVolumes(data)
                }
            })
            .catch(() => { }) // non-critical
    }

    useEffect(() => {
        fetchContainers()
        fetchImages()
        fetchNetworksList()
        fetchVolumesList()
    }, [])

    // Smart Defaults System
    const imageTemplates = {
        'mysql': {
            env: 'MYSQL_ROOT_PASSWORD=secret123\nMYSQL_DATABASE=mydb',
            ports: '3306:3306',
        },
        'postgres': {
            env: 'POSTGRES_PASSWORD=secret123\nPOSTGRES_USER=postgres\nPOSTGRES_DB=mydb',
            ports: '5432:5432',
        },
        'redis': {
            env: '',
            ports: '6379:6379',
        },
        'mariadb': {
            env: 'MARIADB_ROOT_PASSWORD=secret123\nMARIADB_DATABASE=mydb',
            ports: '3306:3306',
        },
        'mongo': {
            env: 'MONGO_INITDB_ROOT_USERNAME=admin\nMONGO_INITDB_ROOT_PASSWORD=secret123',
            ports: '27017:27017',
        }
    }

    // Auto-fill logic
    const [lastAutoFilledEnv, setLastAutoFilledEnv] = useState('')
    const [lastAutoFilledPorts, setLastAutoFilledPorts] = useState('')

    useEffect(() => {
        if (!newImage) return

        // Match exact name, e.g. "postgres" or "postgres:latest" or "library/postgres"
        const lowerImage = newImage.toLowerCase()
        const match = Object.keys(imageTemplates).find(key =>
            lowerImage === key ||
            lowerImage.startsWith(key + ':') ||
            lowerImage.includes('/' + key)
        )

        if (match) {
            const template = imageTemplates[match]

            // Only auto-fill if the user hasn't changed it manually
            // (either it's empty, or it still holds the previous auto-filled value)
            if (newEnv === '' || newEnv === lastAutoFilledEnv) {
                setNewEnv(template.env)
                setLastAutoFilledEnv(template.env)
            }
            if (newPorts === '' || newPorts === lastAutoFilledPorts) {
                setNewPorts(template.ports)
                setLastAutoFilledPorts(template.ports)
            }
        }
    }, [newImage])

    const handleAction = async (action, containerId) => {
        setActionLoading(`${action}-${containerId}`)
        const tid = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing container...`)
        try {
            const res = await fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, containerId }),
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: `Container ${action}ed successfully` })
            }
            await fetchContainers()
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setActionLoading(null)
    }

    const confirmAction = () => {
        const { action, container } = confirmModal
        setConfirmModal({ open: false, action: '', container: null })
        if (action && container) {
            handleAction(action, container.id)
        }
    }

    const openConfirm = (action, container) => {
        setConfirmModal({ open: true, action, container })
    }

    const handleCreate = async () => {
        if (!newImage.trim()) return toast.error('Image name is required')
        setCreating(true)
        const tid = toast.loading('Creating container...')
        try {
            const res = await fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    image: newImage.trim(),
                    name: newName.trim() || undefined,
                    ports: newPorts.trim() || undefined,
                    env: newEnv.trim() || undefined,
                    network: newNetwork || 'bridge',
                    restartPolicy: newRestartPolicy || 'no',
                    volumes: newVolume && newVolumeMountPath ? [`${newVolume}:${newVolumeMountPath}`] : undefined,
                }),
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Container created successfully!' })
                setShowNewModal(false)
                setNewImage('')
                setNewName('')
                setNewPorts('')
                setNewEnv('')
                setNewNetwork('bridge')
                setNewRestartPolicy('no')
                setNewVolume('')
                setNewVolumeMountPath('')
                await fetchContainers()
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setCreating(false)
    }

    const filtered = containers
        .filter(c => {
            const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.image.toLowerCase().includes(search.toLowerCase())
            const matchFilter = filter === 'all' || c.status === filter
            return matchSearch && matchFilter
        })
        .sort((a, b) => {
            const aFav = favorites.includes(a.id)
            const bFav = favorites.includes(b.id)
            if (aFav && !bFav) return -1
            if (!aFav && bFav) return 1
            return 0
        })

    const counts = {
        all: containers.length,
        running: containers.filter(c => c.status === 'running').length,
        exited: containers.filter(c => c.status === 'exited').length,
        paused: containers.filter(c => c.status === 'paused').length,
    }

    const actionLabels = {
        stop: { title: 'Stop Container', msg: 'This will stop the running container.', variant: 'warning' },
        remove: { title: 'Remove Container', msg: 'This will permanently remove this container. This action cannot be undone.', variant: 'danger' },
        restart: { title: 'Restart Container', msg: 'This will restart the container.', variant: 'warning' },
    }

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Containers</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage and monitor your Docker containers</p>
                    {apiError && <p className="text-xs text-red-400 mt-1">Error: {apiError}. Is Docker running?</p>}
                </div>
                {!isViewer && (
                    <button
                        onClick={() => setShowNewModal(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" /> New Container
                    </button>
                )}
            </div>

            {/* Filters + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border">
                    {Object.entries(counts).map(([k, v]) => (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === k ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {k.charAt(0).toUpperCase() + k.slice(1)} <span className="ml-1 opacity-60">{v}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search containers..."
                            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                        />
                    </div>
                    <button onClick={fetchContainers} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-xl shadow-sm animate-fade-in overflow-hidden">
                {selectedContainers.length > 0 && !isViewer && (
                    <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-400">{selectedContainers.length} container(s) selected</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleBulkAction('stop')} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-md shadow-sm transition-colors flex items-center gap-1.5 font-medium">
                                <Square className="w-3.5 h-3.5" /> Stop Selected
                            </button>
                            <button onClick={() => handleBulkAction('remove')} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-md shadow-sm transition-colors flex items-center gap-1.5 font-medium">
                                <Trash2 className="w-3.5 h-3.5" /> Remove Selected
                            </button>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                                {!isViewer && (
                                    <th className="px-4 py-3 w-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-border bg-muted text-blue-500 focus:ring-blue-500 cursor-pointer"
                                            checked={filtered.length > 0 && selectedContainers.length === filtered.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-3 font-medium">Container Details</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Image</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Ports</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3.5">
                                                <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                        No containers found
                                    </td>
                                </tr>
                            ) : filtered.map((c) => (
                                <tr key={c.id} className={`border-b border-border/30 hover:bg-muted/30 transition-colors group ${selectedContainers.includes(c.id) ? 'bg-blue-500/5' : ''}`}>
                                    {!isViewer && (
                                        <td className="px-4 py-3.5">
                                            <input
                                                type="checkbox"
                                                className="rounded border-border bg-muted text-blue-500 focus:ring-blue-500 cursor-pointer"
                                                checked={selectedContainers.includes(c.id)}
                                                onChange={() => setSelectedContainers(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                            />
                                        </td>
                                    )}
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-2 block max-w-xs">
                                            <button onClick={() => toggleFavorite(c.id)} className="text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0 focus:outline-none">
                                                <Star className={`w-4 h-4 ${favorites.includes(c.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                                            </button>
                                            <div className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: c.status === 'running' ? 'rgb(52 211 153 / 0.4)' : c.status === 'exited' ? 'rgb(248 113 113 / 0.4)' : 'rgb(251 191 36 / 0.4)' }} />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate" title={c.name}>{c.name}</p>
                                                <p className="text-xs text-muted-foreground font-mono truncate">{c.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 hidden sm:table-cell">
                                        <span className="text-sm text-foreground font-mono">{c.image}</span>
                                    </td>
                                    <td className="px-4 py-3.5 hidden md:table-cell">
                                        <StatusBadge status={c.status} />
                                        <p className="text-xs text-muted-foreground mt-1">{c.state}</p>
                                    </td>
                                    <td className="px-4 py-3.5 hidden lg:table-cell">
                                        {c.ports?.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {c.ports.map((p, idx) => (
                                                    <span key={`${p}-${idx}`} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded font-mono">{p}</span>
                                                ))}
                                            </div>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center justify-end gap-1">
                                            {!isViewer && (
                                                <>
                                                    {actionLoading?.startsWith('start-' + c.id) || actionLoading?.startsWith('stop-' + c.id) ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                    ) : c.status === 'running' ? (
                                                        <button onClick={() => openConfirm('stop', c)} disabled={!!actionLoading} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Stop">
                                                            <Square className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => handleAction('start', c.id)} disabled={!!actionLoading} className="p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors" title="Start">
                                                            <Play className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => openConfirm('restart', c)} disabled={!!actionLoading} className="p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors" title="Restart">
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </button>
                                                    {c.status === 'running' && (
                                                        <button onClick={() => openConfirm('kill', c)} disabled={!!actionLoading} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Kill">
                                                            <Power className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <Link href={`/containers/${c.id}`} className="p-1.5 text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors" title="Inspect">
                                                <Eye className="w-3.5 h-3.5" />
                                            </Link>
                                            {!isViewer && (
                                                <button onClick={() => openConfirm('remove', c)} disabled={!!actionLoading} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Remove">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* New Container Modal */}
            {showNewModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowNewModal(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-semibold text-foreground">Create New Container</h3>
                            <button onClick={() => setShowNewModal(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="relative">
                                <label className="block text-xs text-muted-foreground mb-1.5">Image *</label>
                                <input
                                    value={newImage}
                                    onChange={e => {
                                        setNewImage(e.target.value)
                                        setImageDropdownOpen(true)
                                    }}
                                    onFocus={() => setImageDropdownOpen(true)}
                                    // Delay closing to allow clicking the dropdown item
                                    onBlur={() => setTimeout(() => setImageDropdownOpen(false), 200)}
                                    placeholder="e.g. nginx:latest, postgres:16"
                                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                />
                                {/* Custom Dropdown */}
                                {imageDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border shadow-xl rounded-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
                                        {localImages.filter(img => img.toLowerCase().includes(newImage.toLowerCase())).length > 0 ? (
                                            <ul className="py-1">
                                                {localImages
                                                    .filter(img => img.toLowerCase().includes(newImage.toLowerCase()))
                                                    .map(img => (
                                                        <li
                                                            key={img}
                                                            onClick={() => {
                                                                setNewImage(img)
                                                                setImageDropdownOpen(false)
                                                            }}
                                                            className="px-3 py-2 text-sm text-foreground font-mono hover:bg-muted cursor-pointer transition-colors"
                                                        >
                                                            {img}
                                                        </li>
                                                    ))}
                                            </ul>
                                        ) : (
                                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                                No matching local image. <br />You can still type a custom image name to pull.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1.5">Container Name (optional)</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="e.g. my-nginx"
                                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1.5">Port Mapping (optional)</label>
                                <input
                                    value={newPorts}
                                    onChange={e => setNewPorts(e.target.value)}
                                    placeholder="e.g. 8080:80"
                                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Format: host_port:container_port</p>

                                {inspectingImage ? (
                                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Detecting image ports...</p>
                                ) : suggestedPorts.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                        <span className="text-xs text-muted-foreground">Default exposed ports:</span>
                                        {suggestedPorts.map(sp => (
                                            <button
                                                key={sp}
                                                onClick={() => setNewPorts(`${sp}:${sp}`)}
                                                className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/20 rounded text-xs transition-colors font-mono"
                                                title="Click to auto-fill"
                                            >
                                                {sp}:{sp}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs text-muted-foreground mb-1.5">Network</label>
                                    <button
                                        type="button"
                                        onClick={() => { setNetworkDropdownOpen(!networkDropdownOpen); setRestartDropdownOpen(false) }}
                                        onBlur={() => setTimeout(() => setNetworkDropdownOpen(false), 200)}
                                        className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/40 text-left flex items-center justify-between"
                                    >
                                        <span className="font-mono truncate">{newNetwork}{newNetwork === 'bridge' ? ' (default)' : ''}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${networkDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {networkDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border shadow-xl rounded-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
                                            <ul className="py-1">
                                                {[{ value: 'bridge', label: 'bridge (default)' }, { value: 'host', label: 'host' }, { value: 'none', label: 'none' },
                                                ...localNetworks.filter(n => !['bridge', 'host', 'none'].includes(n.name)).map(net => ({ value: net.name, label: net.name }))
                                                ].map(opt => (
                                                    <li
                                                        key={opt.value}
                                                        onClick={() => { setNewNetwork(opt.value); setNetworkDropdownOpen(false) }}
                                                        className={`px-3 py-2 text-sm text-foreground font-mono hover:bg-muted cursor-pointer transition-colors flex items-center justify-between ${newNetwork === opt.value ? 'bg-blue-500/10 text-blue-400' : ''}`}
                                                    >
                                                        {opt.label}
                                                        {newNetwork === opt.value && <span className="text-blue-400 text-xs">✓</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <label className="block text-xs text-muted-foreground mb-1.5">Restart Policy</label>
                                    <button
                                        type="button"
                                        onClick={() => { setRestartDropdownOpen(!restartDropdownOpen); setNetworkDropdownOpen(false) }}
                                        onBlur={() => setTimeout(() => setRestartDropdownOpen(false), 200)}
                                        className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/40 text-left flex items-center justify-between"
                                    >
                                        <span className="truncate">{{ 'no': 'No', 'always': 'Always', 'unless-stopped': 'Unless Stopped', 'on-failure': 'On Failure' }[newRestartPolicy]}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${restartDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {restartDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border shadow-xl rounded-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
                                            <ul className="py-1">
                                                {[{ value: 'no', label: 'No' }, { value: 'always', label: 'Always' }, { value: 'unless-stopped', label: 'Unless Stopped' }, { value: 'on-failure', label: 'On Failure' }].map(opt => (
                                                    <li
                                                        key={opt.value}
                                                        onClick={() => { setNewRestartPolicy(opt.value); setRestartDropdownOpen(false) }}
                                                        className={`px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center justify-between ${newRestartPolicy === opt.value ? 'bg-blue-500/10 text-blue-400' : ''}`}
                                                    >
                                                        {opt.label}
                                                        {newRestartPolicy === opt.value && <span className="text-blue-400 text-xs">✓</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Volume Selector */}
                            <div className="relative">
                                <label className="block text-xs text-muted-foreground mb-1.5">Volume (optional)</label>
                                <button
                                    type="button"
                                    onClick={() => { setVolumeDropdownOpen(!volumeDropdownOpen); setNetworkDropdownOpen(false); setRestartDropdownOpen(false) }}
                                    onBlur={() => setTimeout(() => setVolumeDropdownOpen(false), 200)}
                                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/40 text-left flex items-center justify-between"
                                >
                                    <span className="font-mono truncate">{newVolume || 'None (auto-create)'}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${volumeDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {volumeDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border shadow-xl rounded-lg overflow-hidden z-20 max-h-48 overflow-y-auto">
                                        <ul className="py-1">
                                            <li
                                                onClick={() => { setNewVolume(''); setNewVolumeMountPath(''); setVolumeDropdownOpen(false) }}
                                                className={`px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors flex items-center justify-between ${!newVolume ? 'bg-blue-500/10 text-blue-400' : ''}`}
                                            >
                                                None (auto-create)
                                                {!newVolume && <span className="text-blue-400 text-xs">✓</span>}
                                            </li>
                                            {localVolumes.map(vol => (
                                                <li
                                                    key={vol.name}
                                                    onClick={() => { setNewVolume(vol.name); setVolumeDropdownOpen(false) }}
                                                    className={`px-3 py-2 text-sm text-foreground font-mono hover:bg-muted cursor-pointer transition-colors flex items-center justify-between ${newVolume === vol.name ? 'bg-blue-500/10 text-blue-400' : ''}`}
                                                >
                                                    <div className="truncate">
                                                        <span>{vol.name}</span>
                                                        {vol.size && <span className="text-xs text-muted-foreground ml-2">({vol.size})</span>}
                                                    </div>
                                                    {newVolume === vol.name && <span className="text-blue-400 text-xs">✓</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {newVolume && (
                                    <div className="mt-2">
                                        <input
                                            value={newVolumeMountPath}
                                            onChange={e => setNewVolumeMountPath(e.target.value)}
                                            placeholder="Mount path e.g. /var/lib/postgresql/data"
                                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Container path to mount the volume to</p>
                                    </div>
                                )}
                            </div>
                            <div className="pt-2">
                                <label className="block text-xs text-muted-foreground mb-1.5">Environment Variables (optional)</label>
                                <textarea
                                    value={newEnv}
                                    onChange={e => setNewEnv(e.target.value)}
                                    placeholder="MYSQL_ROOT_PASSWORD=secret&#10;MYSQL_DATABASE=mydb"
                                    rows="2"
                                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40 resize-none"
                                />
                                <p className="text-xs text-muted-foreground mt-1">One per line, format: KEY=VALUE</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-6">
                            <button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleCreate}
                                disabled={creating}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create & Start
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Confirm Action Modal */}
            <ConfirmModal
                open={confirmModal.open}
                onClose={() => setConfirmModal({ open: false, action: '', container: null })}
                onConfirm={confirmAction}
                title={actionLabels[confirmModal.action]?.title || 'Confirm Action'}
                message={`${actionLabels[confirmModal.action]?.msg || ''} Container: "${confirmModal.container?.name}"`}
                confirmText={confirmModal.action?.charAt(0).toUpperCase() + confirmModal.action?.slice(1)}
                variant={actionLabels[confirmModal.action]?.variant || 'warning'}
            />
        </div>
    )
}
