'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Box, Layers, HardDrive, Network } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function GlobalSearch() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef(null)
    const router = useRouter()

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen(true)
            }
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    useEffect(() => {
        if (open) {
            inputRef.current?.focus()
            setQuery('')
            setResults([])
        }
    }, [open])

    useEffect(() => {
        if (!query.trim()) {
            setResults([])
            return
        }

        const fetchResults = async () => {
            setLoading(true)
            try {
                // Fetch all in parallel
                const [cRes, iRes, vRes, nRes] = await Promise.all([
                    fetch('/api/containers'),
                    fetch('/api/images'),
                    fetch('/api/volumes'),
                    fetch('/api/networks')
                ])

                const containers = await cRes.json()
                const images = await iRes.json()
                const volumes = await vRes.json()
                const networks = await nRes.json()

                const q = query.toLowerCase()
                const newResults = []

                if (Array.isArray(containers)) {
                    containers.forEach(c => {
                        if (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)) {
                            newResults.push({ type: 'container', icon: <Box className="w-4 h-4 text-blue-400" />, title: c.name, subtitle: `ID: ${c.id.substring(0, 12)} • Image: ${c.image}`, link: `/containers/${c.id}` })
                        }
                    })
                }

                if (Array.isArray(images)) {
                    images.forEach(img => {
                        if (img.repoTags?.[0]?.toLowerCase().includes(q) || img.id.toLowerCase().includes(q)) {
                            newResults.push({ type: 'image', icon: <Layers className="w-4 h-4 text-emerald-400" />, title: img.repoTags?.[0] || '<none>:<none>', subtitle: `ID: ${img.id.substring(7, 19)} • Size: ${(img.size / 1024 / 1024).toFixed(1)} MB`, link: `/images` })
                        }
                    })
                }

                if (vRes.ok && Array.isArray(volumes.volumes)) {
                    volumes.volumes.forEach(v => {
                        if (v.name.toLowerCase().includes(q)) {
                            newResults.push({ type: 'volume', icon: <HardDrive className="w-4 h-4 text-amber-400" />, title: v.name, subtitle: `Driver: ${v.driver}`, link: `/volumes` })
                        }
                    })
                }

                if (Array.isArray(networks)) {
                    networks.forEach(n => {
                        if (n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) {
                            newResults.push({ type: 'network', icon: <Network className="w-4 h-4 text-violet-400" />, title: n.name, subtitle: `Driver: ${n.driver} • Scope: ${n.scope}`, link: `/networks` })
                        }
                    })
                }

                setResults(newResults.slice(0, 15)) // Limit to top 15
                setSelectedIndex(0)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }

        const debounce = setTimeout(fetchResults, 300)
        return () => clearTimeout(debounce)
    }, [query])

    const handleKeyNav = (e) => {
        if (!open) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault()
            router.push(results[selectedIndex].link)
            setOpen(false)
        }
    }

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-[10vh]" onClick={() => setOpen(false)}>
            <div className="bg-card w-full max-w-2xl border border-border shadow-2xl rounded-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center px-4 py-3 border-b border-border bg-background/50">
                    <Search className="w-5 h-5 text-muted-foreground mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyNav}
                        placeholder="Search containers, images, volumes..."
                        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-base font-medium"
                    />
                    <div className="flex items-center gap-1.5 ml-3">
                        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">ESC</kbd>
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {loading && results.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <span className="w-4 h-4 bg-muted-foreground rounded-full animate-ping" /> Searching...
                        </div>
                    ) : query.trim() && results.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                            No results found for "{query}"
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-1">
                            {results.map((res, i) => (
                                <div
                                    key={i}
                                    onClick={() => {
                                        router.push(res.link)
                                        setOpen(false)
                                    }}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-colors ${i === selectedIndex ? 'bg-blue-600 shadow-md transform scale-[1.01]' : 'hover:bg-muted/80'}`}
                                >
                                    <div className={`p-2 rounded-lg ${i === selectedIndex ? 'bg-white/20' : 'bg-background border border-border'}`}>
                                        {React.cloneElement(res.icon, { className: `w-5 h-5 ${i === selectedIndex ? 'text-white' : ''}` })}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-sm font-semibold truncate ${i === selectedIndex ? 'text-white' : 'text-foreground'}`}>{res.title}</h4>
                                        <p className={`text-xs truncate mt-0.5 ${i === selectedIndex ? 'text-blue-100' : 'text-muted-foreground'}`}>{res.subtitle}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 px-4 text-center">
                            <h3 className="text-sm font-medium text-foreground mb-1">Type to start searching</h3>
                            <p className="text-xs text-muted-foreground">Find any resource running on your Docker engine quickly.</p>
                        </div>
                    )}
                </div>

                <div className="bg-muted px-4 py-2 text-[10px] text-muted-foreground flex items-center justify-between border-t border-border">
                    <span>Use <kbd className="px-1 py-0.5 rounded border border-border bg-background">↑</kbd> <kbd className="px-1 py-0.5 rounded border border-border bg-background">↓</kbd> to navigate</span>
                    <span>Press <kbd className="px-1 py-0.5 rounded border border-border bg-background">Enter</kbd> to select</span>
                </div>
            </div>
        </div>,
        document.body
    )
}
