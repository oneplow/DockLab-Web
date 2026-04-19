'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    LayoutDashboard,
    Container,
    Image,
    HardDrive,
    Network,
    FileStack,
    Layers,
    LayoutTemplate,
    TerminalSquare,
    Settings,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
    Globe,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { clsx } from 'clsx'

const navItems = [
    { label: 'Global View', href: '/global', icon: Globe },
    { label: 'Host Overview', href: '/', icon: LayoutDashboard },
    { label: 'Containers', href: '/containers', icon: Container },
    { label: 'Images', href: '/images', icon: Image },
    { label: 'Volumes', href: '/volumes', icon: HardDrive },
    { label: 'Networks', href: '/networks', icon: Network },
    { label: 'Compose', href: '/compose', icon: FileStack },
    { label: 'Stacks', href: '/stacks', icon: Layers },
    { label: 'Templates', href: '/templates', icon: LayoutTemplate },
    { label: 'Run', href: '/run', icon: TerminalSquare },
]

const bottomItems = [
    { label: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
    const pathname = usePathname()
    const { data: session } = useSession()
    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    // Close mobile sidebar on navigation
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    const sidebarContent = (
        <aside className={clsx(
            'flex flex-col h-full bg-card border-r border-border transition-[width] duration-300',
            collapsed ? 'w-16' : 'w-56'
        )}>
            {/* Logo */}
            <div className={clsx(
                'flex items-center border-b border-border h-14 px-4 flex-shrink-0',
                collapsed ? 'justify-center' : 'gap-3'
            )}>
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <Container className="w-4 h-4 text-blue-400" />
                </div>
                {!collapsed && (
                    <span className="font-semibold text-foreground text-sm tracking-tight">Docklab</span>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                    // Hide Global View for viewers
                    if (item.href === '/global' && session?.user?.role === 'viewer') return null

                    const Icon = item.icon
                    const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={clsx(
                                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
                                active
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                collapsed && 'justify-center'
                            )}
                        >
                            <Icon className={clsx('w-4 h-4 flex-shrink-0', active ? 'text-primary' : '')} />
                            {!collapsed && <span>{item.label}</span>}
                            {active && !collapsed && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom */}
            <div className="px-2 py-3 border-t border-border space-y-0.5">
                {bottomItems.map((item) => {
                    const Icon = item.icon
                    const active = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={clsx(
                                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                                active
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                collapsed && 'justify-center'
                            )}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    )
                })}

                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={clsx(
                        'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150',
                        collapsed && 'justify-center'
                    )}
                >
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    {!collapsed && <span className="text-xs">Collapse</span>}
                </button>
            </div>
        </aside>
    )

    return (
        <>
            {/* Mobile hamburger button */}
            <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden fixed top-3 left-3 z-50 p-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-40">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <div className="relative z-50 h-full w-56">
                        <button
                            onClick={() => setMobileOpen(false)}
                            className="absolute top-3 right-3 z-50 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        {sidebarContent}
                    </div>
                </div>
            )}

            {/* Desktop sidebar */}
            <div className="hidden md:flex">
                {sidebarContent}
            </div>
        </>
    )
}
