'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'

const OperationsContext = createContext(null)

const POLL_INTERVAL = 3000 // Poll every 3 seconds

export function OperationsProvider({ children }) {
    const { data: session } = useSession()
    const [operations, setOperations] = useState([])
    const pollRef = useRef(null)
    const mountedRef = useRef(true)

    const fetchOperations = useCallback(async () => {
        if (!session || !mountedRef.current) return
        try {
            const res = await fetch('/api/operations')
            if (res.ok) {
                const data = await res.json()
                if (mountedRef.current && Array.isArray(data)) {
                    setOperations(data)
                }
            }
        } catch { }
    }, [session])

    // Start polling when session is available
    useEffect(() => {
        if (!session) return
        mountedRef.current = true

        fetchOperations() // Initial fetch
        pollRef.current = setInterval(fetchOperations, POLL_INTERVAL)

        return () => {
            mountedRef.current = false
            clearInterval(pollRef.current)
        }
    }, [session, fetchOperations])

    const cancelOperation = useCallback(async (id) => {
        try {
            const res = await fetch(`/api/operations?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                // Optimistic update
                setOperations(prev => prev.map(op =>
                    op.id === id ? { ...op, status: 'cancelled' } : op
                ))
            }
        } catch { }
    }, [])

    const refresh = useCallback(() => {
        fetchOperations()
    }, [fetchOperations])

    return (
        <OperationsContext.Provider value={{ operations, cancelOperation, refresh }}>
            {children}
        </OperationsContext.Provider>
    )
}

export function useOperations() {
    const ctx = useContext(OperationsContext)
    if (!ctx) {
        return { operations: [], cancelOperation: () => { }, refresh: () => { } }
    }
    return ctx
}
