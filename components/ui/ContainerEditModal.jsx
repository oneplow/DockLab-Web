'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, AlertTriangle, Plus, Trash2, ShieldAlert, ChevronDown, Check } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// Dropdown rendered via portal — escapes any parent stacking context / backdrop-filter
function PortalDropdown({ children, style }) {
    if (typeof document === 'undefined') return null
    return createPortal(
        <div
            className="fixed z-[9999] bg-card border border-border rounded-lg shadow-2xl py-1 animate-scale-in origin-top"
            style={style}
        >
            {children}
        </div>,
        document.body
    )
}

export default function ContainerEditModal({ isOpen, onClose, container, onSuccess }) {
    const toast = useToast()
    const [activeTab, setActiveTab] = useState('env')
    const [saving, setSaving] = useState(false)

    // Form states
    const [envVars, setEnvVars] = useState([])
    const [ports, setPorts] = useState([])
    const [mounts, setMounts] = useState([])
    const [restartPolicy, setRestartPolicy] = useState('no')

    // Network states
    const [networks, setNetworks] = useState([])
    const [selectedNetwork, setSelectedNetwork] = useState('')
    const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false)
    const [openProtocolRow, setOpenProtocolRow] = useState(null)

    // Refs for positioning
    const protocolBtnRefs = useRef({})
    const protocolDropdownRef = useRef(null)
    const [protocolDropdownPos, setProtocolDropdownPos] = useState({ top: 0, left: 0, width: 0 })
    const networkBtnRef = useRef(null)
    const networkDropdownRef = useRef(null)
    const [networkDropdownPos, setNetworkDropdownPos] = useState({ top: 0, left: 0, width: 0 })

    // Close dropdowns on outside click
    useEffect(() => {
        const handleMouseDown = (e) => {
            if (
                openProtocolRow !== null &&
                protocolDropdownRef.current &&
                !protocolDropdownRef.current.contains(e.target) &&
                !Object.values(protocolBtnRefs.current).some(btn => btn && btn.contains(e.target))
            ) {
                setOpenProtocolRow(null)
            }
            if (
                networkDropdownOpen &&
                networkDropdownRef.current &&
                !networkDropdownRef.current.contains(e.target) &&
                networkBtnRef.current &&
                !networkBtnRef.current.contains(e.target)
            ) {
                setNetworkDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleMouseDown)
        return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [openProtocolRow, networkDropdownOpen])

    useEffect(() => {
        if (!isOpen || !container) return

        // Parse Env Vars
        const parsedEnv = (container.Config.Env || []).map(e => {
            const splitIdx = e.indexOf('=')
            return {
                key: e.substring(0, splitIdx),
                value: e.substring(splitIdx + 1)
            }
        })
        setEnvVars(parsedEnv)

        // Parse Ports
        const parsedPorts = []
        const portBindings = container.HostConfig.PortBindings || {}
        Object.keys(portBindings).forEach(containerPortWithProto => {
            const [cPort, proto] = containerPortWithProto.split('/')
            const bindings = portBindings[containerPortWithProto] || []
            bindings.forEach(b => {
                parsedPorts.push({
                    hostPort: b.HostPort,
                    containerPort: cPort,
                    protocol: proto || 'tcp'
                })
            })
        })
        const exposedPorts = container.Config.ExposedPorts || {}
        Object.keys(exposedPorts).forEach(containerPortWithProto => {
            const [cPort, proto] = containerPortWithProto.split('/')
            if (!parsedPorts.find(p => p.containerPort === cPort && p.protocol === proto)) {
                parsedPorts.push({ hostPort: '', containerPort: cPort, protocol: proto || 'tcp' })
            }
        })
        setPorts(parsedPorts)

        // Parse Mounts
        const parsedMounts = (container.Mounts || []).map(m => ({
            source: m.Source || m.Name || '',
            destination: m.Destination || ''
        }))
        setMounts(parsedMounts)

        // Parse Restart Policy
        setRestartPolicy(container.HostConfig?.RestartPolicy?.Name || 'no')

        // Parse Network
        if (container.NetworkSettings?.Networks) {
            const currentNet = Object.keys(container.NetworkSettings.Networks)[0]
            if (currentNet) setSelectedNetwork(currentNet)
        }

        // Fetch available networks
        fetch('/api/networks')
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setNetworks(data) })
            .catch(err => console.error("Failed to fetch networks:", err))

        setActiveTab('env')
    }, [isOpen, container])

    if (!isOpen || !container) return null

    const handleSave = async () => {
        setSaving(true)
        const tid = toast.loading('Recreating container...')

        const formattedEnv = envVars.filter(e => e.key.trim() !== '').map(e => `${e.key}=${e.value}`)
        const formattedPorts = ports.filter(p => p.containerPort.trim() !== '')
        const formattedMounts = mounts.filter(m => m.source.trim() !== '' && m.destination.trim() !== '')

        try {
            const res = await fetch(`/api/containers/${container.Id}/recreate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    env: formattedEnv,
                    ports: formattedPorts,
                    restartPolicy,
                    mounts: formattedMounts,
                    network: selectedNetwork !== '' ? selectedNetwork : undefined
                })
            })
            const data = await res.json()
            if (data.error) {
                toast.update(tid, { type: 'error', message: data.error })
            } else {
                toast.update(tid, { type: 'success', message: 'Container recreated successfully!' })
                if (onSuccess) onSuccess(data.newId)
                onClose()
            }
        } catch (err) {
            toast.update(tid, { type: 'error', message: err.message })
        }
        setSaving(false)
    }

    const openProtocolDropdown = (index) => {
        const btn = protocolBtnRefs.current[index]
        if (btn) {
            const rect = btn.getBoundingClientRect()
            setProtocolDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
        }
        setOpenProtocolRow(openProtocolRow === index ? null : index)
    }

    const openNetworkDropdown = () => {
        const btn = networkBtnRef.current
        if (btn) {
            const rect = btn.getBoundingClientRect()
            setNetworkDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
        }
        setNetworkDropdownOpen(!networkDropdownOpen)
    }

    const hasNoMounts = mounts.length === 0

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-scale-in">
                {/* Header */}
                <div className="bg-muted px-6 py-4 border-b border-border flex justify-between items-center flex-shrink-0 rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Edit Container</h2>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">{container.Name.replace('/', '')}</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-black/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar Tabs */}
                    <div className="w-48 bg-muted/30 border-r border-border p-4 flex flex-col gap-2 flex-shrink-0">
                        {['env', 'ports', 'volumes', 'settings'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}{tab === 'volumes' && hasNoMounts && <ShieldAlert className="inline w-3 h-3 text-red-400 ml-1 mb-0.5" />}
                            </button>
                        ))}
                    </div>

                    {/* Main Editing Area */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {hasNoMounts && (
                            <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-red-400">Warning: Temporary Storage Detected</h4>
                                    <p className="text-xs text-red-300 mt-1 leading-relaxed">
                                        This container does not have any Volumes mapped to persistent storage. Making edits will recreate the container, which means <strong>ALL DATA inside it will be permanently lost</strong>. If you expect to preserve data, please map a volume in the Volumes tab before saving.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ENV TAB */}
                        {activeTab === 'env' && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-foreground mb-4">Environment Variables</h3>
                                {envVars.map((env, index) => (
                                    <div key={index} className="flex gap-3">
                                        <input
                                            type="text"
                                            value={env.key}
                                            onChange={(e) => {
                                                const newEnv = [...envVars]
                                                newEnv[index].key = e.target.value
                                                setEnvVars(newEnv)
                                            }}
                                            placeholder="KEY"
                                            className="w-1/3 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono"
                                        />
                                        <span className="text-muted-foreground mt-2">=</span>
                                        <input
                                            type="text"
                                            value={env.value}
                                            onChange={(e) => {
                                                const newEnv = [...envVars]
                                                newEnv[index].value = e.target.value
                                                setEnvVars(newEnv)
                                            }}
                                            placeholder="value"
                                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono"
                                        />
                                        <button
                                            onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))}
                                            className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                                    className="flex items-center gap-2 text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors mt-2"
                                >
                                    <Plus className="w-4 h-4" /> Add environment variable
                                </button>
                            </div>
                        )}

                        {/* PORTS TAB */}
                        {activeTab === 'ports' && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-foreground mb-4">Port Mappings</h3>
                                <div className="grid grid-cols-12 gap-3 mb-2 px-1">
                                    <div className="col-span-4 text-xs font-semibold text-muted-foreground uppercase text-center">Host Port</div>
                                    <div className="col-span-5 text-xs font-semibold text-muted-foreground uppercase text-center">Container Port</div>
                                    <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase text-center">Protocol</div>
                                </div>
                                {ports.map((port, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-3 items-center">
                                        <div className="col-span-4">
                                            <input
                                                type="text"
                                                value={port.hostPort}
                                                onChange={(e) => {
                                                    const newPorts = [...ports]
                                                    newPorts[index].hostPort = e.target.value
                                                    setPorts(newPorts)
                                                }}
                                                placeholder="e.g. 8080"
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono text-center"
                                            />
                                        </div>
                                        <div className="col-span-1 text-center text-muted-foreground">→</div>
                                        <div className="col-span-4">
                                            <input
                                                type="text"
                                                value={port.containerPort}
                                                onChange={(e) => {
                                                    const newPorts = [...ports]
                                                    newPorts[index].containerPort = e.target.value
                                                    setPorts(newPorts)
                                                }}
                                                placeholder="e.g. 80"
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono text-center"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <button
                                                ref={el => protocolBtnRefs.current[index] = el}
                                                onClick={() => openProtocolDropdown(index)}
                                                className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono flex items-center justify-between transition-colors hover:bg-muted"
                                            >
                                                <span className="truncate">{port.protocol.toUpperCase()}</span>
                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-1" />
                                            </button>
                                        </div>
                                        <div className="col-span-1 text-right">
                                            <button
                                                onClick={() => setPorts(ports.filter((_, i) => i !== index))}
                                                className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors inline-block"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setPorts([...ports, { hostPort: '', containerPort: '', protocol: 'tcp' }])}
                                    className="flex items-center gap-2 text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors mt-4"
                                >
                                    <Plus className="w-4 h-4" /> Add port mapping
                                </button>
                            </div>
                        )}

                        {/* VOLUMES TAB */}
                        {activeTab === 'volumes' && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-foreground mb-4">Volume Mounts</h3>
                                <div className="grid grid-cols-12 gap-3 mb-2 px-1">
                                    <div className="col-span-5 text-xs font-semibold text-muted-foreground uppercase text-center">Host / Volume Source</div>
                                    <div className="col-span-6 text-xs font-semibold text-muted-foreground uppercase text-center">Container Destination</div>
                                </div>
                                {mounts.map((mount, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-3 items-center mb-3">
                                        <div className="col-span-5">
                                            <input
                                                type="text"
                                                value={mount.source}
                                                onChange={(e) => {
                                                    const newMounts = [...mounts]
                                                    newMounts[index].source = e.target.value
                                                    setMounts(newMounts)
                                                }}
                                                placeholder="/path/on/host or vol_name"
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono"
                                            />
                                        </div>
                                        <div className="col-span-1 text-center text-muted-foreground">:</div>
                                        <div className="col-span-5">
                                            <input
                                                type="text"
                                                value={mount.destination}
                                                onChange={(e) => {
                                                    const newMounts = [...mounts]
                                                    newMounts[index].destination = e.target.value
                                                    setMounts(newMounts)
                                                }}
                                                placeholder="/path/in/container"
                                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono"
                                            />
                                        </div>
                                        <div className="col-span-1 text-right">
                                            <button
                                                onClick={() => setMounts(mounts.filter((_, i) => i !== index))}
                                                className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors inline-block"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setMounts([...mounts, { source: '', destination: '' }])}
                                    className="flex items-center gap-2 text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors mt-2"
                                >
                                    <Plus className="w-4 h-4" /> Add bind mount
                                </button>
                            </div>
                        )}

                        {/* SETTINGS TAB */}
                        {activeTab === 'settings' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-base font-semibold text-foreground mb-4">Restart Policy</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'no', label: 'No', desc: 'Do not automatically restart' },
                                            { id: 'always', label: 'Always', desc: 'Always restart if stopped' },
                                            { id: 'unless-stopped', label: 'Unless Stopped', desc: 'Restart unless explicitly stopped' },
                                            { id: 'on-failure', label: 'On Failure', desc: 'Restart only if exit code != 0' }
                                        ].map(policy => (
                                            <label
                                                key={policy.id}
                                                className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-colors ${restartPolicy === policy.id ? 'bg-blue-600/10 border-blue-500' : 'bg-background border-border hover:bg-muted'}`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-sm font-semibold ${restartPolicy === policy.id ? 'text-blue-400' : 'text-foreground'}`}>{policy.label}</span>
                                                    <input
                                                        type="radio"
                                                        name="restartPolicy"
                                                        value={policy.id}
                                                        checked={restartPolicy === policy.id}
                                                        onChange={() => setRestartPolicy(policy.id)}
                                                        className="hidden"
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground">{policy.desc}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <h3 className="text-base font-semibold text-foreground mb-4">Network Connection</h3>
                                    <p className="text-xs text-muted-foreground mb-3">Attach this container to a specific Docker network.</p>
                                    <div className="max-w-sm">
                                        <button
                                            ref={networkBtnRef}
                                            onClick={openNetworkDropdown}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500 flex items-center justify-between transition-colors hover:bg-muted"
                                        >
                                            <span className="truncate">
                                                {selectedNetwork === '' ? 'Keep current network' : selectedNetwork}
                                            </span>
                                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-muted px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0 rounded-b-xl">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 bg-transparent hover:bg-black/20 text-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save & Recreate
                    </button>
                </div>
            </div>

            {/* Protocol Dropdown — Portal renders directly into document.body, outside backdrop-filter */}
            {openProtocolRow !== null && (
                <PortalDropdown style={{
                    top: protocolDropdownPos.top,
                    left: protocolDropdownPos.left,
                    width: Math.max(protocolDropdownPos.width, 80)
                }}>
                    <div ref={protocolDropdownRef}>
                        {['tcp', 'udp'].map(proto => (
                            <button
                                key={proto}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors font-mono ${ports[openProtocolRow]?.protocol === proto ? 'bg-blue-600/10 text-blue-400' : 'text-foreground hover:bg-muted'}`}
                                onClick={() => {
                                    const newPorts = [...ports]
                                    newPorts[openProtocolRow].protocol = proto
                                    setPorts(newPorts)
                                    setOpenProtocolRow(null)
                                }}
                            >
                                <span>{proto.toUpperCase()}</span>
                                {ports[openProtocolRow]?.protocol === proto && <Check className="w-3.5 h-3.5" />}
                            </button>
                        ))}
                    </div>
                </PortalDropdown>
            )}

            {/* Network Dropdown — Portal renders directly into document.body, outside backdrop-filter */}
            {networkDropdownOpen && (
                <PortalDropdown style={{
                    top: networkDropdownPos.top,
                    left: networkDropdownPos.left,
                    width: Math.max(networkDropdownPos.width, 200)
                }}>
                    <div ref={networkDropdownRef} className="max-h-60 overflow-y-auto">
                        <button
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${selectedNetwork === '' ? 'bg-blue-600/10 text-blue-400' : 'text-foreground hover:bg-muted'}`}
                            onClick={() => { setSelectedNetwork(''); setNetworkDropdownOpen(false) }}
                        >
                            <span>Keep current network</span>
                            {selectedNetwork === '' && <Check className="w-4 h-4 ml-2 flex-shrink-0 text-blue-500" />}
                        </button>
                        {networks.map((net, i) => (
                            <button
                                key={net.id || net.name || i}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${selectedNetwork === net.name ? 'bg-blue-600/10 text-blue-400' : 'text-foreground hover:bg-muted'}`}
                                onClick={() => { setSelectedNetwork(net.name); setNetworkDropdownOpen(false) }}
                            >
                                <div className="truncate">
                                    <span>{net.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">({net.driver})</span>
                                </div>
                                {selectedNetwork === net.name && <Check className="w-4 h-4 ml-2 flex-shrink-0 text-blue-500" />}
                            </button>
                        ))}
                    </div>
                </PortalDropdown>
            )}
        </div>,
        document.body
    )
}