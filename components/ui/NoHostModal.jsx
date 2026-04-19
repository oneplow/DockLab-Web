'use client'

import { AlertCircle, ArrowRight, Settings, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NoHostModal({ isOpen }) {
    const router = useRouter()

    if (!isOpen) return null

    const handleClose = () => {
        router.push('/settings')
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 shadow-2xl">
            {/* Backdrop - Click to redirect */}
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300 pointer-events-auto"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors z-10"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 relative z-20">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-2">No Docker Host Connected</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                        It looks like you haven't connected to a Docker host yet.
                        Please configure your first host in the settings to start managing your containers.
                    </p>

                    <div className="flex flex-col gap-3">
                        <Link
                            href="/settings"
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Settings className="w-4 h-4" />
                            Go to Settings
                            <ArrowRight className="w-4 h-4 ml-1" />
                        </Link>
                    </div>
                </div>

                {/* Decorative background element */}
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -top-12 -left-12 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
            </div>
        </div>
    )
}
