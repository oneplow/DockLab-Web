'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Play, Box, Upload, Terminal, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

export default function BuildImagePage() {
    const [dockerfile, setDockerfile] = useState(`FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`)
    const [tag, setTag] = useState('')
    const [logs, setLogs] = useState([])
    const [isBuilding, setIsBuilding] = useState(false)
    const [buildStatus, setBuildStatus] = useState('idle') // idle, building, success, error
    const logsEndRef = useRef(null)
    const router = useRouter()
    const toast = useToast()

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [logs])

    const handleBuild = async () => {
        if (!tag.trim()) {
            toast.error('Image tag is required')
            return
        }
        if (!dockerfile.trim()) {
            toast.error('Dockerfile content cannot be empty')
            return
        }

        setIsBuilding(true)
        setBuildStatus('building')
        setLogs([`[Step] Starting build for ${tag}...`])

        try {
            const res = await fetch('/api/images/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dockerfile, tag })
            })

            const reader = res.body.getReader()
            const decoder = new TextDecoder()

            let doneStream = false
            while (!doneStream) {
                const { value, done } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n\n').filter(Boolean)

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6))
                            if (data.log) {
                                setLogs(prev => [...prev, data.log])
                            } else if (data.done) {
                                doneStream = true
                                if (data.code === 0) {
                                    setBuildStatus('success')
                                    setLogs(prev => [...prev, `[Success] Successfully built ${tag}`])
                                    toast.success('Image built successfully!')
                                } else {
                                    setBuildStatus('error')
                                    setLogs(prev => [...prev, `[Error] Build failed with exit code ${data.code}`])
                                    toast.error('Image build failed.')
                                }
                            } else if (data.error) {
                                doneStream = true
                                setBuildStatus('error')
                                setLogs(prev => [...prev, `[Fatal Error] ${data.error}`])
                                toast.error('An error occurred during build.')
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE line', line)
                        }
                    }
                }
            }
        } catch (err) {
            setBuildStatus('error')
            setLogs(prev => [...prev, `[Client Error] ${err.message}`])
            toast.error('Build API request failed.')
        } finally {
            setIsBuilding(false)
        }
    }

    const handleFileUpload = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (ev) => setDockerfile(ev.target.result)
            reader.readAsText(file)
        }
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/images')}
                        className="p-2 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Build Image</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">Build a new Docker image from a Dockerfile</p>
                    </div>
                </div>
                <button
                    onClick={handleBuild}
                    disabled={isBuilding}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                    {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isBuilding ? 'Building...' : `Build ${tag || 'Image'}`}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Input */}
                <div className="space-y-4">
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <label className="block text-sm font-medium text-foreground mb-2">Image Tag <span className="text-red-400">*</span></label>
                        <input
                            type="text"
                            value={tag}
                            onChange={e => setTag(e.target.value)}
                            placeholder="e.g. my-app:latest"
                            className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>

                    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-[500px]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                            <div className="flex items-center gap-2">
                                <Box className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-semibold text-foreground">Dockerfile</span>
                            </div>
                            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 border border-border text-xs text-foreground cursor-pointer rounded-lg transition-colors">
                                <Upload className="w-3.5 h-3.5" /> Upload File
                                <input type="file" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        <textarea
                            value={dockerfile}
                            onChange={e => setDockerfile(e.target.value)}
                            spellCheck={false}
                            className="flex-1 w-full bg-transparent p-4 text-sm font-mono text-foreground focus:outline-none resize-none"
                            placeholder="FROM ubuntu:latest..."
                        />
                    </div>
                </div>

                {/* Right Column: Build Logs */}
                <div className="bg-[#1e1e1e] border border-border rounded-xl shadow-sm overflow-hidden flex flex-col relative h-[612px]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#252526]">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-mono text-gray-300">Build Console</span>
                        </div>
                        {buildStatus !== 'idle' && (
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                                {buildStatus === 'building' && <span className="text-blue-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Building</span>}
                                {buildStatus === 'success' && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</span>}
                                {buildStatus === 'error' && <span className="text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Failed</span>}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs">
                        {logs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
                                <Terminal className="w-12 h-12 stroke-1 opacity-20" />
                                <p>Build logs will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {logs.map((log, i) => {
                                    if (log.includes('[Success]')) return <div key={i} className="text-emerald-400 font-bold">{log}</div>
                                    if (log.includes('[Error]')) return <div key={i} className="text-red-400 font-bold">{log}</div>
                                    if (log.includes('[Fatal Error]')) return <div key={i} className="text-red-500 font-bold">{log}</div>
                                    if (log.includes('[Step]')) return <div key={i} className="text-blue-400">{log}</div>
                                    // Make regular stdout grayish
                                    return <div key={i} className="text-gray-300 leading-relaxed whitespace-pre-wrap">{log}</div>
                                })}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
