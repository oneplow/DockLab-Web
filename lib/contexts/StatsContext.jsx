'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const StatsContext = createContext(null)

/**
 * StatsProvider — SSE connection เดียวต่อ tab แชร์ผ่าน React Context
 *
 * Features:
 *   - Visibility API: ปิด SSE เมื่อ tab ซ่อน, เปิดใหม่เมื่อกลับมา
 *   - Exponential backoff: 2s → 4s → 8s → ... → max 30s
 *   - Stable deps: ใช้ activeHostId เท่านั้น ไม่ใช่ session object
 *   - 'hosts-updated' event → reconnect เมื่อสลับ host
 */
export function StatsProvider({ children }) {
    const { data: session } = useSession()
    const [stats, setStats] = useState({
        cpu: 0, ram: 0, ramTotal: 0, ramUsed: 0,
        storage: 0, storageUsed: 0, storageTotal: 0,
        containers: { total: 0, running: 0, stopped: 0, paused: 0 },
        images: { total: 0 },
        policies: {},
        ncpu: 0, serverVersion: '', operatingSystem: '', architecture: '',
    })
    const [connected, setConnected] = useState(false)
    const [serverOnline, setServerOnline] = useState(true)
    const [initialLoad, setInitialLoad] = useState(true)
    const [activeHostId, setActiveHostId] = useState(null)

    const eventSourceRef = useRef(null)
    const reconnectTimerRef = useRef(null)
    const backoffRef = useRef(2000)
    const mountedRef = useRef(true)

    // Fetch active host on mount + when hosts change
    useEffect(() => {
        if (!session) return

        const fetchActiveHost = async () => {
            try {
                const res = await fetch('/api/settings/hosts/active')
                if (res.ok) {
                    const data = await res.json()
                    setActiveHostId(data.hostId || null)
                }
            } catch { }
        }

        fetchActiveHost()
        window.addEventListener('hosts-updated', fetchActiveHost)
        return () => window.removeEventListener('hosts-updated', fetchActiveHost)
    }, [session])

    // SSE connection management
    const connectSSE = useCallback(() => {
        if (!activeHostId || !mountedRef.current) return

        // Close existing
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }

        const es = new EventSource(`/api/system/stats/stream?hostId=${activeHostId}`)
        eventSourceRef.current = es

        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.error) return

                setStats(data)
                setConnected(true)
                setServerOnline(true)
                setInitialLoad(false)
                backoffRef.current = 2000 // Reset backoff on success
            } catch { }
        }

        es.onerror = () => {
            setConnected(false)
            setServerOnline(false)
            if (es) es.close()
            eventSourceRef.current = null

            // Exponential backoff reconnect
            if (mountedRef.current && !document.hidden) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = setTimeout(() => {
                    if (mountedRef.current && !document.hidden) {
                        connectSSE()
                    }
                }, backoffRef.current)
                backoffRef.current = Math.min(backoffRef.current * 2, 30000)
            }
        }
    }, [activeHostId])

    // Open/close SSE based on activeHostId
    useEffect(() => {
        if (!activeHostId) return

        connectSSE()

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }
            clearTimeout(reconnectTimerRef.current)
        }
    }, [activeHostId, connectSSE])

    // Visibility API — pause SSE when tab hidden
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                // Close SSE when tab hidden
                if (eventSourceRef.current) {
                    eventSourceRef.current.close()
                    eventSourceRef.current = null
                }
                clearTimeout(reconnectTimerRef.current)
                setConnected(false)
            } else {
                // Reconnect when tab becomes visible
                backoffRef.current = 2000
                connectSSE()
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [connectSSE])

    // Handle hosts-updated for reconnect
    useEffect(() => {
        const handleHostsUpdated = () => {
            backoffRef.current = 2000
            connectSSE()
        }
        window.addEventListener('hosts-updated', handleHostsUpdated)
        return () => window.removeEventListener('hosts-updated', handleHostsUpdated)
    }, [connectSSE])

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }
            clearTimeout(reconnectTimerRef.current)
        }
    }, [])

    const value = { stats, connected, serverOnline, initialLoad, activeHostId }

    return (
        <StatsContext.Provider value={value}>
            {children}
        </StatsContext.Provider>
    )
}

export function useStats() {
    const ctx = useContext(StatsContext)
    if (!ctx) {
        // Fallback for components outside provider
        return {
            stats: { cpu: 0, ram: 0, ramTotal: 0 },
            connected: false,
            serverOnline: true,
            initialLoad: true,
            activeHostId: null,
        }
    }
    return ctx
}
