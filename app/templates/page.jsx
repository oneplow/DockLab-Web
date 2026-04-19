'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ZapIcon, Play, CheckCircle, Server, Database, Layers, Box, X, Loader2, Search, Star, ArrowDownCircle, Download, Package, Globe } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/components/ui/Toast'

const templates = [
    {
        id: 'nginx',
        name: 'Nginx',
        description: 'High-performance HTTP server and reverse proxy',
        icon: Server,
        color: 'emerald',
        tags: ['web', 'proxy'],
        image: 'nginx:latest',
        ports: ['80:80', '443:443'],
        compose: `services:\n  nginx:\n    image: nginx:latest\n    ports:\n      - "80:80"\n      - "443:443"\n    restart: unless-stopped`,
    },
    {
        id: 'postgres',
        name: 'PostgreSQL',
        description: 'Advanced open-source relational database',
        icon: Database,
        color: 'blue',
        tags: ['database', 'sql'],
        image: 'postgres:16',
        ports: ['5432:5432'],
        compose: `services:\n  postgres:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: password\n    ports:\n      - "5432:5432"\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:`,
    },
    {
        id: 'redis',
        name: 'Redis',
        description: 'In-memory data structure store and cache',
        icon: ZapIcon,
        color: 'red',
        tags: ['cache', 'queue'],
        image: 'redis:7-alpine',
        ports: ['6379:6379'],
        compose: `services:\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n    restart: unless-stopped`,
    },
    {
        id: 'nodejs',
        name: 'Node.js',
        description: 'JavaScript runtime built on V8 engine',
        icon: Layers,
        color: 'green',
        tags: ['runtime', 'javascript'],
        image: 'node:20-alpine',
        ports: ['3000:3000'],
        compose: `services:\n  app:\n    image: node:20-alpine\n    working_dir: /app\n    ports:\n      - "3000:3000"\n    command: node app.js`,
    },
    {
        id: 'mongodb',
        name: 'MongoDB',
        description: 'Document-oriented NoSQL database',
        icon: Database,
        color: 'green',
        tags: ['database', 'nosql'],
        image: 'mongo:7',
        ports: ['27017:27017'],
        compose: `services:\n  mongo:\n    image: mongo:7\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongodata:/data/db\nvolumes:\n  mongodata:`,
    },
    {
        id: 'grafana',
        name: 'Grafana',
        description: 'Open-source analytics and monitoring platform',
        icon: Layers,
        color: 'orange',
        tags: ['monitoring', 'analytics'],
        image: 'grafana/grafana:latest',
        ports: ['3000:3000'],
        compose: `services:\n  grafana:\n    image: grafana/grafana:latest\n    ports:\n      - "3000:3000"\n    volumes:\n      - grafana-data:/var/lib/grafana\nvolumes:\n  grafana-data:`,
    },
    {
        id: 'cloudflared',
        name: 'Cloudflare Tunnel',
        description: 'Expose your local services to the internet securely via Cloudflare',
        icon: Globe,
        color: 'cyan',
        tags: ['tunnel', 'proxy', 'cloudflare'],
        image: 'cloudflare/cloudflared:latest',
        ports: [],
        compose: `services:\n  cloudflared:\n    image: cloudflare/cloudflared:latest\n    restart: unless-stopped\n    command: tunnel --no-autoupdate run --token YOUR_TUNNEL_TOKEN`,
    },
]

const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
    green: 'text-green-400 bg-green-400/10 border-green-400/20',
    orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    violet: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
    cyan: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
}

function formatPulls(n) {
    if (n > 1e9) return (n / 1e9).toFixed(1) + 'B'
    if (n > 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n > 1e3) return (n / 1e3).toFixed(1) + 'K'
    return n
}

export default function TemplatesPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const [deployed, setDeployed] = useState(new Set())
    const [selectedTemplate, setSelectedTemplate] = useState(null)
    const [deployingId, setDeployingId] = useState(null)
    const toast = useToast()

    // Docker Hub search
    const [tab, setTab] = useState('templates') // 'templates' | 'hub'
    const [hubQuery, setHubQuery] = useState('')
    const [hubResults, setHubResults] = useState([])
    const [hubLoading, setHubLoading] = useState(false)
    const [pullingHub, setPullingHub] = useState(null)

    const handleDeploy = async () => {
        if (!selectedTemplate) return
        const template = selectedTemplate
        setSelectedTemplate(null)
        setDeployingId(template.id)
        const tid = toast.loading(`Deploying ${template.name}...`, {
            description: `Pulling ${template.image} and creating container`
        })
        try {
            const r = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ composeYaml: template.compose })
            })
            const data = await r.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: `Deploy failed: ${data.error}` })
            } else {
                toast.update(tid, { type: 'success', message: `${template.name} deployed!`, description: 'Check the Containers tab' })
                setDeployed(prev => new Set([...prev, template.id]))
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setDeployingId(null)
    }

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
        const tid = toast.loading(`Pulling ${imageName}...`)
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pull', image: imageName })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: `${imageName} pulled successfully` })
            }
        } catch (e) {
            toast.update(tid, { type: 'error', message: e.message })
        }
        setPullingHub(null)
    }

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
            <div>
                <h1 className="text-xl font-bold text-foreground">Templates</h1>
                <p className="text-sm text-muted-foreground mt-0.5">One-click deployment for common services</p>
            </div>

            {/* Tabs: Templates / Docker Hub */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border w-fit">
                <button
                    onClick={() => setTab('templates')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'templates' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Quick Deploy
                </button>
                <button
                    onClick={() => setTab('hub')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'hub' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Search Docker Hub
                </button>
            </div>

            {tab === 'templates' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map(t => {
                        const Icon = t.icon
                        const isDeployed = deployed.has(t.id)
                        return (
                            <div key={t.id} className="bg-card border border-border rounded-xl p-5 hover:border-foreground/20 transition-colors flex flex-col gap-4">
                                <div className="flex items-start justify-between">
                                    <div className={`p-2.5 rounded-xl border ${colorMap[t.color]}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex gap-1">
                                        {t.tags.map(tag => (
                                            <span key={tag} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
                                </div>
                                <div className="mt-4 flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Box className="w-3.5 h-3.5" />
                                        <span className="font-mono">{t.image}</span>
                                    </div>
                                    {!isViewer && (
                                        <button
                                            onClick={() => isDeployed ? null : setSelectedTemplate(t)}
                                            disabled={!!deployingId}
                                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${isDeployed
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                                                : 'bg-blue-600/80 hover:bg-blue-600 text-white disabled:opacity-50'
                                                }`}
                                        >
                                            {deployingId === t.id ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
                                            ) : isDeployed ? (
                                                <><CheckCircle className="w-4 h-4" /> Deployed</>
                                            ) : (
                                                <><Play className="w-4 h-4" /> Deploy</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                /* Docker Hub Search */
                <>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-lg">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={hubQuery}
                                onChange={e => setHubQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchHub()}
                                placeholder="Search Docker Hub... (e.g. mysql, rabbitmq, minio)"
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
                                {hubQuery ? 'No results found' : 'Search Docker Hub to find and deploy services'}
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

            {/* Deploy Preview Modal */}
            {selectedTemplate && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setSelectedTemplate(null)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg border ${colorMap[selectedTemplate.color]}`}>
                                    <selectedTemplate.icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-foreground">Deploy {selectedTemplate.name}</h3>
                                    <p className="text-xs text-muted-foreground">{selectedTemplate.image}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedTemplate(null)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Compose Configuration</p>
                            <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                {selectedTemplate.compose}
                            </pre>
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                            <p className="text-xs text-amber-400 font-medium">⚠️ This will pull the image and start a container on your Docker host.</p>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setSelectedTemplate(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Cancel</button>
                            {!isViewer && (
                                <button
                                    onClick={handleDeploy}
                                    disabled={!!deployingId}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    Deploy Template
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
