'use client'

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ArrowLeft, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPage() {
    const { id } = useParams()
    const terminalRef = useRef(null)
    const eventSourceRef = useRef(null)
    const xtermRef = useRef(null)
    const fitAddonRef = useRef(null)
    const router = useRouter()
    const { data: session } = useSession()

    const [status, setStatus] = useState('connecting') // connecting, connected, disconnected, error
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        if (!terminalRef.current || !id) return

        if (session?.user?.role === 'viewer') {
            router.push(`/containers/${id}`)
            return
        }

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#f0f0f0',
                cursor: '#ffffff',
                selectionBackground: '#4a4a4a',
            },
            fontFamily: '"Fira Code", monospace, "Courier New", Courier',
            fontSize: 14,
        })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(terminalRef.current)
        fitAddon.fit()

        xtermRef.current = term
        fitAddonRef.current = fitAddon

        // Generate unique session ID
        const sessionId = Math.random().toString(36).substring(2, 15)

        // Setup SSE connection
        const eventSource = new EventSource(`/api/terminal?id=${id}&sessionId=${sessionId}`)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
            setStatus('connected')
            term.focus()
        }

        eventSource.onmessage = (event) => {
            try {
                // We base64 encoded it on the server to prevent SSE multiline formatting issues
                const decoded = atob(event.data)
                term.write(decoded)
            } catch (e) {
                console.error("Failed to decode terminal output:", e)
            }
        }

        eventSource.onerror = (err) => {
            if (eventSource.readyState === EventSource.CLOSED) {
                setStatus('disconnected')
            } else {
                setStatus('error')
                setErrorMsg('Connection dropped')
            }
        }

        // Send input using POST
        const onDataDisposable = term.onData(async (data) => {
            if (eventSource.readyState === EventSource.OPEN) {
                try {
                    await fetch(`/api/terminal?sessionId=${sessionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ input: data })
                    })
                } catch (err) {
                    console.error("Input send failed:", err)
                }
            }
        })

        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit()
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            onDataDisposable.dispose()
            eventSource.close()
            term.dispose()
        }
    }, [id])

    return (
        <div className="h-full flex flex-col space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/containers/${id}`)}
                        className="p-2 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                            Container Web Terminal
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{id.substring(0, 12)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === 'connecting' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium rounded-lg">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...
                        </div>
                    )}
                    {status === 'connected' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Connected
                        </div>
                    )}
                    {(status === 'disconnected' || status === 'error') && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5" /> Disconnected {errorMsg && `(${errorMsg})`}
                        </div>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border"
                        title="Reconnect"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Terminal Container */}
            <div className="flex-1 bg-[#1e1e1e] border border-border rounded-xl shadow-xl overflow-hidden p-3 min-h-[500px]">
                <div ref={terminalRef} className="w-full h-full" />
            </div>
        </div>
    )
}
