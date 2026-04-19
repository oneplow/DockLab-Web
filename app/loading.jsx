'use client'

import { Container } from 'lucide-react'

export default function Loading() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
            <div className="relative">
                {/* Outer pulsing ring */}
                <div className="absolute inset-0 rounded-2xl animate-pulse-glow" />
                {/* Logo */}
                <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center animate-pulse">
                    <Container className="w-8 h-8 text-blue-400" />
                </div>
            </div>
            <div className="flex flex-col items-center gap-2">
                <p className="text-sm font-medium text-foreground">Loading...</p>
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
            </div>
        </div>
    )
}
