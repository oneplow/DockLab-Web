'use client'

import { useState } from 'react'
import { Play, Square, Upload, FileStack, Loader2, Shield } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

const DEFAULT_COMPOSE = `version: '3.8'
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
`

export default function ComposePage() {
    const [content, setContent] = useState(DEFAULT_COMPOSE)
    const [projectName, setProjectName] = useState('docklab-stack')
    const [status, setStatus] = useState('idle')
    const [logs, setLogs] = useState([])
    const [tab, setTab] = useState('editor')
    const [deploying, setDeploying] = useState(false)
    const [confirmStop, setConfirmStop] = useState(false)
    const toast = useToast()
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'

    const handleDeploy = async () => {
        setDeploying(true)
        const tid = toast.loading('Deploying stack...')
        try {
            setTab('logs')
            setLogs([`[${new Date().toLocaleTimeString()}] Starting docker-compose deployment...`])

            const res = await fetch('/api/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'up', composeYaml: content, projectName })
            })
            const data = await res.json()

            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✗ Error: ${data.error}`])
            } else {
                toast.update(tid, { type: 'success', message: 'Stack deployed successfully!' })
                setStatus('running')

                const outputLogs = (data.logs || '').split('\n').filter(Boolean).map(l => `[${new Date().toLocaleTimeString()}] ${l}`)
                setLogs(prev => [...prev, ...outputLogs, `[${new Date().toLocaleTimeString()}] ✓ Stack deployed successfully`])
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
            setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✗ ${err.message}`])
        }
        setDeploying(false)
    }

    const handleStop = async () => {
        setConfirmStop(false)
        const tid = toast.loading('Stopping stack...')
        try {
            setTab('logs')
            setLogs([`[${new Date().toLocaleTimeString()}] Stopping docker-compose stack...`])

            const res = await fetch('/api/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'down', composeYaml: content, projectName })
            })
            const data = await res.json()

            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✗ Error: ${data.error}`])
            } else {
                toast.update(tid, { type: 'success', message: 'Stack stopped successfully!' })
                setStatus('stopped')

                const outputLogs = (data.logs || '').split('\n').filter(Boolean).map(l => `[${new Date().toLocaleTimeString()}] ${l}`)
                setLogs(prev => [...prev, ...outputLogs, `[${new Date().toLocaleTimeString()}] ✓ Stack stopped successfully`])
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
            setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✗ ${err.message}`])
        }
    }

    if (isViewer) {
        return (
            <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Docker Compose</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Deploy multi-container applications</p>
                </div>

                <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center mt-10">
                    <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-6 ring-4 ring-background">
                        <Shield className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">View-Only Access</h2>
                    <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                        Your account has the <span className="text-emerald-400 font-semibold">Viewer</span> role. Deploying, editing, and managing Docker Compose stacks requires Developer or Administrator privileges.
                    </p>
                    <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground bg-muted px-4 py-2 rounded-lg border border-border/50">
                        <FileStack className="w-4 h-4 text-blue-400" />
                        <span>Contact your administrator to request access upgrades.</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Docker Compose</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Deploy multi-container applications</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    {status === 'running' ? (
                        <button onClick={() => setConfirmStop(true)} className="flex items-center gap-2 px-3.5 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
                            <Square className="w-4 h-4" /> Stop Stack
                        </button>
                    ) : (
                        <button onClick={handleDeploy} disabled={deploying} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {deploying ? 'Deploying...' : 'Deploy Stack'}
                        </button>
                    )}
                </div>
            </div>

            {/* Status Banner */}
            {status !== 'idle' && (
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm ${status === 'running'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-muted border-border text-muted-foreground'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-current opacity-50'}`} />
                    Stack {status === 'running' ? 'is running' : 'stopped'}
                </div>
            )}

            {/* Tabs & Stack Name Input */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 border border-border rounded-xl">
                <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border flex-shrink-0">
                    {['editor', 'logs'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${tab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 min-w-0">
                    <label className="text-sm font-medium text-foreground flex-shrink-0">Project Name:</label>
                    <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                        placeholder="e.g. my-app"
                        className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48 font-mono text-muted-foreground min-w-0"
                    />
                </div>
            </div>

            {tab === 'editor' ? (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                        <div className="flex items-center gap-2">
                            <FileStack className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-mono">docker-compose.yml</span>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" /> Upload file
                            <input type="file" accept=".yml,.yaml" className="hidden" onChange={e => {
                                const f = e.target.files[0]
                                if (f) { const r = new FileReader(); r.onload = ev => setContent(ev.target.result); r.readAsText(f) }
                            }} />
                        </label>
                    </div>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        className="w-full h-96 px-4 py-4 bg-transparent text-sm text-foreground font-mono resize-none focus:outline-none leading-relaxed"
                        spellCheck={false}
                    />
                </div>
            ) : (
                <div className="bg-background border border-border rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs">
                    {logs.length === 0 ? (
                        <p className="text-muted-foreground">No logs yet. Deploy a stack to see output here.</p>
                    ) : logs.map((log, i) => (
                        <p key={i} className={`py-0.5 ${log.includes('✓') ? 'text-emerald-400' : log.includes('✗') ? 'text-red-400' : 'text-muted-foreground'}`}>{log}</p>
                    ))}
                </div>
            )}

            {/* Confirm Stop */}
            <ConfirmModal
                open={confirmStop}
                onClose={() => setConfirmStop(false)}
                onConfirm={handleStop}
                title="Stop Stack"
                message="Are you sure you want to stop this docker compose stack? All containers in the stack will be stopped."
                confirmText="Stop Stack"
                variant="warning"
            />
        </div>
    )
}
