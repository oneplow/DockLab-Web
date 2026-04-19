'use client'

import { useState, useEffect, useRef } from 'react'
import { Folder, File, ChevronRight, Upload, Trash2, ArrowLeft, Save, Loader2, Download, AlertCircle, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'

export default function VolumeBrowser({ volumeName }) {
    const [currentPath, setCurrentPath] = useState('/')
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // File reading/editing
    const [viewingFile, setViewingFile] = useState(null)
    const [fileContent, setFileContent] = useState('')
    const [originalContent, setOriginalContent] = useState('')
    const [saving, setSaving] = useState(false)

    const [deleteModal, setDeleteModal] = useState({ open: false, item: null })
    const fileInputRef = useRef(null)
    const toast = useToast()

    const fetchPath = async (path) => {
        setLoading(true)
        setError(null)
        setViewingFile(null)

        try {
            const res = await fetch(`/api/volumes/${volumeName}/browse?path=${encodeURIComponent(path)}`)
            const data = await res.json()

            if (data.error) {
                setError(data.error)
            } else if (data.type === 'dir') {
                // Sorting: directories first, then alphabetical
                const sorted = (data.content || []).sort((a, b) => {
                    if (a.type === 'dir' && b.type !== 'dir') return -1
                    if (a.type !== 'dir' && b.type === 'dir') return 1
                    return a.name.localeCompare(b.name)
                })
                setItems(sorted)
                setCurrentPath(path)
            } else if (data.type === 'file') {
                setViewingFile(path)
                setFileContent(data.content)
                setOriginalContent(data.content)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPath('/')
    }, [volumeName])

    const handleNavigate = (newPath) => {
        if (loading) return
        fetchPath(newPath)
    }

    const breadcrumbs = currentPath.split('/').filter(Boolean)
    const navigateBreadcrumb = (index) => {
        const path = '/' + breadcrumbs.slice(0, index + 1).join('/')
        handleNavigate(path)
    }

    const handleBack = () => {
        if (viewingFile) {
            handleNavigate(currentPath)
        } else {
            const parent = '/' + breadcrumbs.slice(0, -1).join('/')
            handleNavigate(parent || '/')
        }
    }

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        const tid = toast.loading(`Uploading ${file.name}...`)
        try {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onloadend = async () => {
                const base64Content = reader.result.split(',')[1] // extract base64
                const targetPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`

                const res = await fetch(`/api/volumes/${volumeName}/browse`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetPath, content: base64Content })
                })

                const data = await res.json()
                if (data.error) {
                    toast.update(tid, { type: 'error', message: data.error })
                } else {
                    toast.update(tid, { type: 'success', message: 'Uploaded successfully' })
                    fetchPath(currentPath)
                }
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: 'Upload failed' })
        }

        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleSaveFile = async () => {
        setSaving(true)
        const tid = toast.loading('Saving file...')
        try {
            const res = await fetch(`/api/volumes/${volumeName}/browse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: viewingFile, content: btoa(unescape(encodeURIComponent(fileContent))) })
            })

            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'File saved' })
                setOriginalContent(fileContent)
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setSaving(false)
    }

    const handleDelete = async () => {
        if (!deleteModal.item) return

        const itemPath = currentPath === '/' ? `/${deleteModal.item.name}` : `${currentPath}/${deleteModal.item.name}`
        const tid = toast.loading(`Deleting ${deleteModal.item.name}...`)

        setDeleteModal({ open: false, item: null })

        try {
            const res = await fetch(`/api/volumes/${volumeName}/browse`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: itemPath })
            })

            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Deleted successfully' })
                fetchPath(currentPath)
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
    }

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <div className="bg-card border border-border rounded-xl flex flex-col h-[700px] overflow-hidden">
            {/* Header / Breadcrumbs */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1.5 text-sm">
                    {(currentPath !== '/' || viewingFile) && (
                        <button onClick={handleBack} className="p-1.5 hover:bg-muted rounded text-muted-foreground mr-1">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => handleNavigate('/')} className="hover:text-foreground text-muted-foreground font-medium flex items-center gap-2">
                        <Folder className="w-4 h-4" />
                        /
                    </button>
                    {!viewingFile && breadcrumbs.map((crumb, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-muted-foreground">
                            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                            <button
                                onClick={() => navigateBreadcrumb(i)}
                                className={`hover:text-foreground ${i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}`}
                            >
                                {crumb}
                            </button>
                        </div>
                    ))}
                    {viewingFile && (
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
                            <File className="w-4 h-4 text-blue-400" />
                            {viewingFile.split('/').pop()}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {!viewingFile && (
                        <>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                            >
                                <Upload className="w-3.5 h-3.5" /> Upload File
                            </button>
                        </>
                    )}
                    {viewingFile && (
                        <button
                            onClick={handleSaveFile}
                            disabled={saving || fileContent === originalContent}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save Changes
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto relative bg-background">
                {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-background/50 backdrop-blur-sm z-10 space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium">Accessing volume data...</p>
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 space-y-3 p-6 text-center">
                        <AlertCircle className="w-10 h-10 opacity-80" />
                        <div>
                            <p className="font-semibold text-lg">Error accessing volume</p>
                            <p className="text-sm opacity-80 mt-1 max-w-md">{error}</p>
                        </div>
                        <button onClick={() => fetchPath(currentPath)} className="px-4 py-2 mt-4 bg-muted text-foreground text-sm rounded-lg hover:bg-muted/80">Try Again</button>
                    </div>
                ) : viewingFile ? (
                    <textarea
                        value={fileContent}
                        onChange={(e) => setFileContent(e.target.value)}
                        className="w-full h-full p-6 bg-transparent text-foreground font-mono text-sm leading-relaxed resize-none focus:outline-none"
                        spellCheck={false}
                    />
                ) : items.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <Folder className="w-12 h-12 opacity-20 mb-3" />
                        <p>This directory is empty</p>
                    </div>
                ) : (
                    <div className="p-2">
                        <table className="w-full text-left text-sm text-muted-foreground border-separate border-spacing-y-1">
                            <thead>
                                <tr className="text-xs uppercase tracking-wider opacity-60">
                                    <th className="font-medium pb-2 pl-4 w-1/2">Name</th>
                                    <th className="font-medium pb-2 px-2 w-24">Size</th>
                                    <th className="font-medium pb-2 px-2 w-32 hidden sm:table-cell">Modified</th>
                                    <th className="font-medium pb-2 px-2 w-24 hidden md:table-cell">Perms</th>
                                    <th className="font-medium pb-2 pr-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr
                                        key={item.name}
                                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                                        onClick={() => handleNavigate(currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)}
                                    >
                                        <td className="py-2.5 pl-4 rounded-l-lg">
                                            <div className="flex items-center gap-3">
                                                {item.type === 'dir' ? (
                                                    <Folder className="w-5 h-5 text-blue-400 fill-blue-500/20" />
                                                ) : (
                                                    <FileText className="w-5 h-5 text-muted-foreground opacity-70" />
                                                )}
                                                <span className={`font-medium ${item.type === 'dir' ? 'text-foreground hover:text-blue-500 transition-colors' : 'text-foreground'}`}>{item.name}</span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2 tabular-nums">
                                            {item.type === 'dir' ? '--' : formatSize(item.size)}
                                        </td>
                                        <td className="py-2.5 px-2 tabular-nums hidden sm:table-cell">
                                            {new Date(item.modified * 1000).toLocaleDateString()}
                                        </td>
                                        <td className="py-2.5 px-2 font-mono text-xs opacity-70 hidden md:table-cell">
                                            {item.permissions}
                                        </td>
                                        <td className="py-2.5 pr-4 rounded-r-lg text-right">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, item }) }}
                                                className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, item: null })}
                onConfirm={handleDelete}
                title="Delete File"
                message={`Are you sure you want to delete "${deleteModal.item?.name}"? Building a robust docker app sometimes requires clearing configs, but remember this is irreversible.`}
                confirmText="Delete permanently"
                variant="danger"
            />
        </div>
    )
}
