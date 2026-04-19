'use client'

import { useState } from 'react'
import { Terminal, Play, Loader2, ChevronDown, ChevronUp, Copy, Trash2, Sparkles, Shield } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/components/ui/Toast'

const exampleCommands = [
    {
        label: 'Cloudflare Tunnel',
        command: `docker run -d --name cloudflared-tunnel --restart unless-stopped cloudflare/cloudflared:latest tunnel --no-autoupdate run --token YOUR_TUNNEL_TOKEN`,
    },
    {
        label: 'Nginx Web Server',
        command: `docker run -d --name my-nginx -p 8080:80 --restart unless-stopped nginx:latest`,
    },
    {
        label: 'PostgreSQL Database',
        command: `docker run -d --name my-postgres -p 5432:5432 -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=mydb --restart unless-stopped postgres:16`,
    },
    {
        label: 'Redis Cache',
        command: `docker run -d --name my-redis -p 6379:6379 --restart unless-stopped redis:7-alpine`,
    },
]

// Parse a docker run command string into structured options
function parseDockerRun(cmd) {
    const result = {
        image: '',
        name: '',
        ports: [],
        env: [],
        volumes: [],
        network: '',
        restart: '',
        detach: false,
        command: '',
        errors: [],
    }

    // Clean up the command
    let cleaned = cmd
        .replace(/\\\n/g, ' ')      // join line continuations
        .replace(/\\\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // Remove 'docker run' prefix
    const runMatch = cleaned.match(/^docker\s+run\s+(.*)$/i)
    if (!runMatch) {
        result.errors.push('Command must start with "docker run"')
        return result
    }

    let rest = runMatch[1].trim()

    // Tokenize respecting quotes
    const tokens = []
    let current = ''
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < rest.length; i++) {
        const ch = rest[i]
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble
        } else if (ch === ' ' && !inSingle && !inDouble) {
            if (current) { tokens.push(current); current = '' }
        } else {
            current += ch
        }
    }
    if (current) tokens.push(current)

    let i = 0
    let imageDone = false

    while (i < tokens.length) {
        const t = tokens[i]

        if (t === '-d' || t === '--detach') {
            result.detach = true
            i++
        } else if (t === '--name' && i + 1 < tokens.length) {
            result.name = tokens[++i]
            i++
        } else if (t.startsWith('--name=')) {
            result.name = t.split('=').slice(1).join('=')
            i++
        } else if ((t === '-p' || t === '--publish') && i + 1 < tokens.length) {
            result.ports.push(tokens[++i])
            i++
        } else if (t.startsWith('-p') && t.length > 2 && t[2] !== '-') {
            // e.g. -p8080:80
            result.ports.push(t.substring(2))
            i++
        } else if ((t === '-e' || t === '--env') && i + 1 < tokens.length) {
            result.env.push(tokens[++i])
            i++
        } else if (t.startsWith('-e') && t.length > 2 && t[2] !== '-') {
            result.env.push(t.substring(2))
            i++
        } else if (t.startsWith('--env=')) {
            result.env.push(t.split('=').slice(1).join('='))
            i++
        } else if ((t === '-v' || t === '--volume') && i + 1 < tokens.length) {
            result.volumes.push(tokens[++i])
            i++
        } else if (t.startsWith('-v') && t.length > 2 && t[2] !== '-') {
            result.volumes.push(t.substring(2))
            i++
        } else if (t === '--network' && i + 1 < tokens.length) {
            result.network = tokens[++i]
            i++
        } else if (t.startsWith('--network=')) {
            result.network = t.split('=').slice(1).join('=')
            i++
        } else if (t === '--restart' && i + 1 < tokens.length) {
            result.restart = tokens[++i]
            i++
        } else if (t.startsWith('--restart=')) {
            result.restart = t.split('=').slice(1).join('=')
            i++
        } else if (t.startsWith('-') && !imageDone) {
            // Skip unknown flags
            // Check if it's a flag with value
            if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
                i += 2 // skip flag + value
            } else {
                i++
            }
        } else if (!imageDone) {
            // This is the image name
            result.image = t
            imageDone = true
            i++
            // Everything after is the command
            if (i < tokens.length) {
                result.command = tokens.slice(i).join(' ')
                break
            }
        } else {
            i++
        }
    }

    if (!result.image) {
        result.errors.push('No image specified')
    }

    return result
}

export default function RunPage() {
    const { data: session } = useSession()
    const isViewer = session?.user?.role === 'viewer'
    const toast = useToast()

    const [command, setCommand] = useState('')
    const [parsed, setParsed] = useState(null)
    const [running, setRunning] = useState(false)
    const [showExamples, setShowExamples] = useState(false)

    const handleParse = () => {
        if (!command.trim()) {
            toast.error('Please enter a docker run command')
            return
        }
        const result = parseDockerRun(command)
        setParsed(result)
        if (result.errors.length > 0) {
            toast.error(result.errors.join(', '))
        }
    }

    const handleRun = async () => {
        if (!parsed || parsed.errors.length > 0) return
        setRunning(true)
        try {
            const body = {
                action: 'create',
                image: parsed.image,
                name: parsed.name || undefined,
                ports: parsed.ports.length > 0 ? parsed.ports.join(',') : undefined,
                env: parsed.env.join('\n') || undefined,
                volumes: parsed.volumes.length > 0 ? parsed.volumes : undefined,
                network: parsed.network || undefined,
                restartPolicy: parsed.restart || 'no',
                command: parsed.command || undefined,
            }
            const res = await fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (data.error) {
                toast.error(data.error)
            } else {
                toast.success(`Container created successfully! ID: ${data.containerId?.substring(0, 12)}`)
                setCommand('')
                setParsed(null)
            }
        } catch (err) {
            toast.error('Failed to execute command')
        } finally {
            setRunning(false)
        }
    }

    if (isViewer) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in mt-10">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Your current role does not have permission to run containers directly.
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-blue-400" />
                    Run Command
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">Paste a <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">docker run</code> command and execute it directly</p>
            </div>

            {/* Command Input */}
            <div className="bg-card border border-border rounded-xl p-5 animate-slide-up">
                <label className="block text-xs text-muted-foreground mb-2 font-medium">Docker Run Command</label>
                <div className="relative">
                    <textarea
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        placeholder="docker run -d --name my-app -p 8080:80 nginx:latest"
                        rows={4}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed"
                    />
                </div>
                <div className="flex items-center justify-between mt-3 gap-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowExamples(!showExamples)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Examples
                            {showExamples ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {command && (
                            <button
                                onClick={() => { setCommand(''); setParsed(null) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors border border-border"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Clear
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleParse}
                        disabled={!command.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                    >
                        Parse Command
                    </button>
                </div>
            </div>

            {/* Examples */}
            {showExamples && (
                <div className="bg-card border border-border rounded-xl overflow-hidden animate-slide-down">
                    <div className="px-4 py-3 border-b border-border">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Examples</p>
                    </div>
                    <div className="divide-y divide-border">
                        {exampleCommands.map((ex, i) => (
                            <div
                                key={i}
                                onClick={() => { setCommand(ex.command); setShowExamples(false); setParsed(null) }}
                                className="px-4 py-3 hover:bg-muted cursor-pointer transition-colors flex items-center justify-between group"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{ex.label}</p>
                                    <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">{ex.command}</p>
                                </div>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Parsed Preview */}
            {parsed && parsed.errors.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-scale-in">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">📋 Parsed Options</h3>
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full font-bold">Ready</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Image */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Image</p>
                            <p className="text-sm font-mono text-foreground">{parsed.image}</p>
                        </div>

                        {/* Name */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Container Name</p>
                            <p className="text-sm font-mono text-foreground">{parsed.name || '(auto-generated)'}</p>
                        </div>

                        {/* Ports */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Ports</p>
                            {parsed.ports.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {parsed.ports.map((p, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-xs font-mono">{p}</span>
                                    ))}
                                </div>
                            ) : <p className="text-xs text-muted-foreground italic">None</p>}
                        </div>

                        {/* Network */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Network</p>
                            <p className="text-sm font-mono text-foreground">{parsed.network || 'bridge (default)'}</p>
                        </div>

                        {/* Restart */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Restart Policy</p>
                            <p className="text-sm font-mono text-foreground">{parsed.restart || 'no'}</p>
                        </div>

                        {/* Detach */}
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Detached</p>
                            <p className="text-sm text-foreground">{parsed.detach ? '✅ Yes' : '❌ No (will run detached anyway)'}</p>
                        </div>
                    </div>

                    {/* Environment */}
                    {parsed.env.length > 0 && (
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Environment Variables</p>
                            <div className="space-y-1">
                                {parsed.env.map((e, i) => {
                                    const [key, ...val] = e.split('=')
                                    return (
                                        <div key={i} className="flex gap-2 text-xs font-mono">
                                            <span className="text-violet-400">{key}</span>
                                            <span className="text-muted-foreground">=</span>
                                            <span className="text-foreground">{val.join('=')}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Volumes */}
                    {parsed.volumes.length > 0 && (
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Volumes</p>
                            <div className="space-y-1">
                                {parsed.volumes.map((v, i) => (
                                    <p key={i} className="text-xs font-mono text-foreground">{v}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Command */}
                    {parsed.command && (
                        <div className="bg-muted rounded-lg p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Command Override</p>
                            <p className="text-sm font-mono text-foreground break-all">{parsed.command}</p>
                        </div>
                    )}

                    {/* Run Button */}
                    <div className="flex justify-end pt-2">
                        {isViewer ? (
                            <p className="text-xs text-red-400">Viewers cannot create containers</p>
                        ) : (
                            <button
                                onClick={handleRun}
                                disabled={running}
                                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                            >
                                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                {running ? 'Creating...' : 'Run Container'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Errors */}
            {parsed && parsed.errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-scale-in">
                    <p className="text-sm font-medium text-red-400">❌ Parse Errors:</p>
                    <ul className="mt-1 space-y-1">
                        {parsed.errors.map((e, i) => (
                            <li key={i} className="text-xs text-red-300">• {e}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
