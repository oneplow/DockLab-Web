import VolumeBrowser from '@/components/ui/VolumeBrowser'
import { getDockerClient } from '@/lib/docker/service'
import { HardDrive, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const dynamic = 'force-dynamic'

export default async function VolumeInspectPage({ params }) {
    const { name } = await params
    const session = await getServerSession(authOptions)
    const isViewer = session?.user?.role === 'viewer'

    let info = null
    try {
        const docker = await getDockerClient()
        const volume = docker.getVolume(name)
        info = await volume.inspect()
    } catch (e) {
        redirect('/volumes')
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/volumes"
                    className="p-2 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex flex-col items-center justify-center">
                        <HardDrive className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                            {info.Name}
                        </h1>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>Driver: <span className="text-foreground">{info.Driver}</span></span>
                            {!isViewer && <span>Mountpoint: <span className="text-foreground font-mono">{info.Mountpoint}</span></span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Browser */}
            <VolumeBrowser volumeName={name} />
        </div>
    )
}
