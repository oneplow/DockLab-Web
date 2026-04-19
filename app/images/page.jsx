'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Trash2, Search, RefreshCw, Package, Loader2, X, Star, ArrowDownCircle, Box } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

function formatBytes(bytes) {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
}

function formatPulls(n) {
    if (n > 1e9) return (n / 1e9).toFixed(1) + 'B'
    if (n > 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n > 1e3) return (n / 1e3).toFixed(1) + 'K'
    return n
}

export default function ImagesPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const [images, setImages] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showPull, setShowPull] = useState(false)
    const [pullImage, setPullImage] = useState('')
    const [pulling, setPulling] = useState(false)
    const [removingId, setRemovingId] = useState(null)
    const [apiError, setApiError] = useState(null)
    const [deleteModal, setDeleteModal] = useState({ open: false, image: null })
    const toast = useToast()

    // Docker Hub search
    const [tab, setTab] = useState('local') // 'local' | 'hub'
    const [hubQuery, setHubQuery] = useState('')
    const [hubResults, setHubResults] = useState([])
    const [hubLoading, setHubLoading] = useState(false)
    const [pullingHub, setPullingHub] = useState(null)

    const fetchImages = () => {
        setLoading(true)
        setApiError(null)
        fetch('/api/images')
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setApiError(data.error)
                    setImages([])
                } else if (Array.isArray(data)) {
                    setImages(data)
                } else {
                    setImages([])
                }
            })
            .catch(err => setApiError(err.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchImages() }, [])

    const searchHub = async (query = hubQuery) => {
        if (!query.trim()) {
            setHubResults([])
            return
        }
        setHubLoading(true)
        try {
            const res = await fetch(`/api/hub-search?q=${encodeURIComponent(query.trim())}`)
            const data = await res.json()
            if (data.results) setHubResults(data.results)
        } catch (err) {
            toast.error('Search failed: ' + err.message)
        }
        setHubLoading(false)
    }

    // Debounce for Docker Hub Search
    useEffect(() => {
        if (tab !== 'hub') return
        const delayBounceFn = setTimeout(() => {
            if (hubQuery) {
                searchHub()
            } else {
                setHubResults([])
            }
        }, 500)
        return () => clearTimeout(delayBounceFn)
    }, [hubQuery, tab])

    const handlePullFromHub = async (imageName) => {
        setPullingHub(imageName)
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pull', image: imageName })
            })
            const data = await res.json()
            if (data.error) {
                toast.error(data.error)
            } else {
                fetchImages()
            }
        } catch (e) {
            toast.error(e.message)
        }
        setPullingHub(null)
    }

    const handlePull = async () => {
        if (!pullImage.trim()) return toast.error('Image name is required')
        setPulling(true)
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pull', image: pullImage.trim() })
            })
            const data = await res.json()
            if (data.error) {
                toast.error(data.error)
            } else {
                setShowPull(false)
                setPullImage('')
                fetchImages()
            }
        } catch (e) {
            toast.error(e.message)
        }
        setPulling(false)
    }

    const handleRemove = async () => {
        const imageId = deleteModal.image?.id
        if (!imageId) return
        setDeleteModal({ open: false, image: null })
        setRemovingId(imageId)
        const tid = toast.loading('Removing image...')
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', image: imageId })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Image removed' })
                fetchImages()
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setRemovingId(null)
    }

    const filtered = images.filter(img =>
        img.repoTags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
    )

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Images</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{images.length} images locally cached</p>
                    {apiError && <p className="text-xs text-red-400 mt-1">Error: {apiError}. Is Docker running?</p>}
                </div>
                {!isViewer && (
                    <div className="flex items-center gap-2">
                        <a href="/images/build" className="flex items-center gap-2 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground text-sm font-medium rounded-lg transition-colors">
                            <Box className="w-4 h-4" /> Build Image
                        </a>
                        <button onClick={() => setShowPull(true)} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                            <Download className="w-4 h-4" /> Pull Image
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs: Local / Docker Hub */}
            <div className="flex items-center gap-3">
                <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border">
                    <button
                        onClick={() => setTab('local')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'local' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Local Images <span className="ml-1 opacity-60">{images.length}</span>
                    </button>
                    <button
                        onClick={() => setTab('hub')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'hub' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Docker Hub Search
                    </button>
                </div>
            </div>

            {tab === 'local' ? (
                <>
                    <div className="flex items-center gap-2">
                        <div className="relative max-w-sm flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search local images..."
                                className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                            />
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Repository</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Tag</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Image ID</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Size</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i}>
                                            {Array.from({ length: 5 }).map((_, j) => (
                                                <td key={j} className="px-4 py-4">
                                                    <div className="h-4 bg-muted rounded animate-pulse" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                            No images found
                                        </td>
                                    </tr>
                                ) : filtered.map((img) => {
                                    const [repo, tag] = (img.repoTags?.[0] || '<none>:<none>').split(':')
                                    return (
                                        <tr key={img.id} className="hover:bg-muted/50 transition-colors group">
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0">
                                                        <Package className="w-3.5 h-3.5 text-blue-400" />
                                                    </div>
                                                    <span className="text-sm font-medium text-foreground">{repo}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 hidden sm:table-cell">
                                                <span className="px-2 py-0.5 bg-muted text-foreground text-xs rounded-full font-mono">{tag}</span>
                                            </td>
                                            <td className="px-4 py-3.5 hidden md:table-cell">
                                                <span className="text-xs text-muted-foreground font-mono">{img.id?.slice(0, 12)}</span>
                                            </td>
                                            <td className="px-4 py-3.5 hidden lg:table-cell">
                                                <span className="text-sm text-foreground">{formatBytes(img.size)}</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-end gap-1">
                                                    {!isViewer && (
                                                        <button
                                                            onClick={() => setDeleteModal({ open: true, image: img })}
                                                            disabled={removingId === img.id}
                                                            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                                            title="Remove"
                                                        >
                                                            {removingId === img.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                /* Docker Hub Search Tab */
                <>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-lg">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={hubQuery}
                                onChange={e => setHubQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchHub()}
                                placeholder="Search Docker Hub... (e.g. nginx, postgres)"
                                className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                            />
                        </div>
                        <button onClick={searchHub} disabled={hubLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                            {hubLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Search
                        </button>
                    </div>

                    <div className="grid gap-3">
                        {hubLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                                    <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                                    <div className="h-3 bg-muted rounded w-2/3" />
                                </div>
                            ))
                        ) : hubResults.length === 0 ? (
                            <div className="text-center py-12 text-sm text-muted-foreground">
                                {hubQuery ? 'No results found' : 'Search Docker Hub for images to pull'}
                            </div>
                        ) : hubResults.map((r, idx) => (
                            <div key={idx} className="bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors flex items-center gap-4">
                                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-foreground">{r.name}</p>
                                        {r.isOfficial && (
                                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded border border-blue-500/20 font-medium">Official</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.description || 'No description'}</p>
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Star className="w-3 h-3" /> {r.stars}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <ArrowDownCircle className="w-3 h-3" /> {formatPulls(r.pulls)}
                                        </span>
                                    </div>
                                </div>
                                {!isViewer && (
                                    <button
                                        onClick={() => handlePullFromHub(r.name)}
                                        disabled={pullingHub === r.name}
                                        className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                                    >
                                        {pullingHub === r.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                        Pull
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Pull Image Modal */}
            {showPull && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowPull(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-semibold text-foreground">Pull Image from Docker Hub</h3>
                            <button onClick={() => setShowPull(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1.5">Image Name</label>
                            <input
                                value={pullImage}
                                onChange={e => setPullImage(e.target.value)}
                                placeholder="e.g. nginx:latest, postgres:16"
                                className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40"
                                onKeyDown={e => e.key === 'Enter' && handlePull()}
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">Enter the full image name with tag</p>
                        </div>
                        <div className="flex gap-2 justify-end mt-6">
                            <button onClick={() => setShowPull(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Cancel</button>
                            <button
                                disabled={pulling}
                                onClick={handlePull}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {pulling && <Loader2 className="w-4 h-4 animate-spin" />}
                                {pulling ? 'Pulling...' : 'Pull'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Image Confirm */}
            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, image: null })}
                onConfirm={handleRemove}
                title="Remove Image"
                message="Are you sure you want to remove this image? If containers are using it, removal may fail."
                confirmText="Remove"
                variant="danger"
            />
        </div>
    )
}
