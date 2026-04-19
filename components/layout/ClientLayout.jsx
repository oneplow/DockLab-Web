'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import GlobalSearch from '@/components/ui/GlobalSearch'
import { OperationsProvider } from '@/lib/contexts/OperationsContext'
import OperationsToast from '@/components/ui/OperationsToast'

export default function ClientLayout({ children }) {
    const pathname = usePathname()

    // ไม่แสดง Sidebar และ Topbar ในหน้า Login 
    if (pathname === '/login') {
        return <>{children}</>
    }

    return (
        <OperationsProvider>
            <div className="flex h-screen overflow-hidden bg-background">
                <Sidebar />
                <div className="flex flex-col flex-1 isolate">
                    <Topbar />
                    <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 position-static">
                        {children}
                        <GlobalSearch />
                    </main>
                </div>
            </div>
            <OperationsToast />
        </OperationsProvider>
    )
}
