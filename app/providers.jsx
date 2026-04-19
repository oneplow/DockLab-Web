'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { ToastProvider } from '@/components/ui/Toast'
import { StatsProvider } from '@/lib/contexts/StatsContext'

export default function Providers({ children }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <SessionProvider>
                <StatsProvider>
                    <ToastProvider>{children}</ToastProvider>
                </StatsProvider>
            </SessionProvider>
        </ThemeProvider>
    )
}
