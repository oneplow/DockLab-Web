'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { ChevronDown, LogOut, User, Bell } from 'lucide-react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import NoHostModal from '@/components/ui/NoHostModal'
import { useStats } from '@/lib/contexts/StatsContext'

export default function Topbar() {
    const { data: session } = useSession()
    const pathname = usePathname()
    const { stats, serverOnline } = useStats()

    const [noHost, setNoHost] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [showNotifications, setShowNotifications] = useState(false)
    const [activeUsers, setActiveUsers] = useState([])
    const [hosts, setHosts] = useState([])
    const [activeHostId, setActiveHostId] = useState(null)
    const [showHostSelector, setShowHostSelector] = useState(false)

    useEffect(() => {
        const fetchHosts = async () => {
            try {
                const [hostsRes, activeRes] = await Promise.all([
                    fetch('/api/settings/hosts'),
                    fetch('/api/settings/hosts/active')
                ])
                let hostsData = []
                if (hostsRes.ok) {
                    hostsData = await hostsRes.json()
                    setHosts(hostsData)
                }
                
                if (activeRes.ok) {
                    const activeData = await activeRes.json()
                    
                    if (hostsData.length === 0) {
                        // No hosts in the DB at all — trigger the lock and blur
                        setNoHost(true)
                        setActiveHostId(null)
                    } else {
                        // Verify if the active host from the cookie actually still exists
                        const hostExists = hostsData.some(h => h.id === activeData.hostId)
                        if (hostExists) {
                            setActiveHostId(activeData.hostId)
                            setNoHost(false)
                        } else {
                            // Cookie is stale but we have other hosts, pick the first one
                            handleSwitchHost(hostsData[0].id)
                        }
                    }
                }
            } catch { }
        }
        if (session) fetchHosts()

        // Refresh when hosts are updated from settings
        window.addEventListener('hosts-updated', fetchHosts)
        return () => window.removeEventListener('hosts-updated', fetchHosts)
    }, [session])

    const handleSwitchHost = async (hostId) => {
        try {
            await fetch('/api/settings/hosts/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId })
            })
            window.location.reload()
        } catch { }
    }

    useEffect(() => {
        const updatePresence = async () => {
            try {
                const res = await fetch('/api/presence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: window.location.pathname })
                })
                if (res.ok) setActiveUsers(await res.json())
            } catch { }
        }
        updatePresence()
        const int = setInterval(updatePresence, 10000)
        return () => clearInterval(int)
    }, [])

    useEffect(() => {
        const fetchNotifs = async () => {
            try {
                const res = await fetch('/api/notifications')
                if (res.ok) setNotifications(await res.json())
            } catch { }
        }
        fetchNotifs()
        const int = setInterval(fetchNotifs, 15000)
        return () => clearInterval(int)
    }, [])

    return (
        <header className="h-14 bg-card border-b border-border flex items-center pl-14 pr-4 md:px-4 gap-4 flex-shrink-0">
            {/* Host Switcher */}
            <div className="relative">
                <button
                    onClick={() => setShowHostSelector(!showHostSelector)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors text-xs"
                >
                    <div className={`w-2 h-2 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.5)] ${serverOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-foreground font-medium hidden sm:block max-w-[150px] truncate">
                        {activeHostId ? hosts.find(h => h.id === activeHostId)?.name || 'Disconnected' : 'Select Host'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {showHostSelector && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowHostSelector(false)} />
                        <div className="absolute left-0 top-full mt-1.5 w-64 bg-card border border-border rounded-xl shadow-2xl z-20 py-2 overflow-hidden">
                            <div className="px-3 pb-2 mb-2 border-b border-border">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Docker Host</p>
                            </div>
                            <div className="max-h-60 overflow-y-auto px-1 space-y-0.5">
                                {hosts.map(host => (
                                    <button
                                        key={host.id}
                                        onClick={() => handleSwitchHost(host.id)}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm rounded-lg transition-colors ${activeHostId === host.id ? 'bg-blue-600/10 text-blue-400 font-medium' : 'text-foreground hover:bg-muted'}`}
                                    >
                                        <span className="truncate pr-2">{host.name}</span>
                                        {activeHostId === host.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* CPU */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                <span className="text-muted-foreground hidden sm:inline">CPU</span>
                <div className="w-16 sm:w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden md:block">
                    <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${stats.cpu}%` }}
                    />
                </div>
                <span className="text-foreground tabular-nums w-8 sm:w-9 font-medium">{stats.cpu?.toFixed(1)}%</span>
            </div>

            {/* RAM */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                <span className="text-muted-foreground hidden sm:inline">RAM</span>
                <div className="w-16 sm:w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden md:block">
                    <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-1000"
                        style={{ width: `${stats.ram}%` }}
                    />
                </div>
                <span className="text-foreground tabular-nums w-8 sm:w-9 font-medium">{stats.ram?.toFixed(1)}%</span>
            </div>

            {/* Storage */}
            <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="text-muted-foreground hidden lg:inline">Storage</span>
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden xl:block">
                    <div
                        className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                        style={{ width: `${stats.storage || 0}%` }}
                    />
                </div>
                <span className="text-foreground tabular-nums whitespace-nowrap text-[10px] sm:text-[11px] font-medium">
                    {stats.storageUsed ? (stats.storageUsed / 1073741824).toFixed(1) : 0}
                    <span className="text-muted-foreground mx-0.5">/</span>
                    {stats.storageTotal ? (stats.storageTotal / 1073741824).toFixed(0) : 0} GB
                </span>
            </div>

            <div className="flex-1" />

            {/* Active Users (Docs style) */}
            {activeUsers.length > 0 && (
                <div className="flex items-center -space-x-2 mr-2">
                    {activeUsers.map((u, i) => (
                        <div key={u.id} className="relative group cursor-pointer" style={{ zIndex: activeUsers.length - i }}>
                            <div className="w-8 h-8 rounded-full border-2 border-card shadow-sm overflow-hidden bg-background">
                                {u.image ? (
                                    <Image
                                        src={u.image}
                                        alt={u.name || 'User'}
                                        width={32}
                                        height={32}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                                        <span className="text-xs text-white font-bold">{u.name?.[0]?.toUpperCase() || 'U'}</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute top-10 right-0 w-max px-2.5 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all scale-95 group-hover:scale-100 origin-top flex flex-col items-end shadow-xl">
                                <span>{u.name}</span>
                                <span className="text-[10px] text-background/70 mt-0.5">
                                    Viewing {u.path === '/' ? 'Dashboard' : u.path.split('/').pop() || 'Page'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Notifications */}
            <div className="relative">
                <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                    <Bell className="w-4 h-4" />
                    {notifications.length > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-card shadow-sm" />
                    )}
                </button>
                {showNotifications && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
                        <div className="absolute right-0 top-full mt-1.5 w-80 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden">
                            <div className="px-4 py-3 border-b border-border bg-muted/50 flex justify-between items-center">
                                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                                <span className="text-xs text-muted-foreground">{notifications.length}</span>
                            </div>
                            <div className="max-h-80 overflow-y-auto p-1">
                                {notifications.length === 0 ? (
                                    <div className="text-center py-6 text-sm text-muted-foreground">
                                        No new notifications
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <a key={n.id} href={n.link || '#'} className="block p-3 hover:bg-muted/60 transition-colors rounded-lg">
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                <div>
                                                    <h4 className={`text-xs font-semibold ${n.type === 'error' ? 'text-red-400' : 'text-amber-400'}`}>{n.title}</h4>
                                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                                                </div>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Profile */}
            <div className="relative">
                <button
                    onClick={() => setShowProfile(!showProfile)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                    {session?.user?.image ? (
                        <Image
                            src={session.user.image}
                            alt={session.user.name || 'User'}
                            width={26}
                            height={26}
                            className="rounded-full"
                        />
                    ) : (
                        <div className="w-6.5 h-6.5 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                    )}
                    <div className="hidden sm:block text-left">
                        <p className="text-xs font-medium text-foreground leading-none">{session?.user?.name?.split(' ')[0] || 'User'}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{session?.user?.role || 'developer'}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
                </button>

                {showProfile && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowProfile(false)} />
                        <div className="absolute right-0 top-full mt-1.5 w-56 bg-card border border-border rounded-xl shadow-2xl z-20 py-1 overflow-hidden">
                            <div className="px-3 py-2.5 border-b border-border">
                                <p className="text-xs font-medium text-foreground">{session?.user?.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
                            </div>
                            <button
                                onClick={() => signOut({ callbackUrl: '/login' })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                Sign out
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* No Host Modal */}
            <NoHostModal isOpen={noHost && pathname !== '/settings'} />
        </header>
    )
}
