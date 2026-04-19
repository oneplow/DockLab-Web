import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// Docker Hub search API - public endpoint, no Docker daemon needed
export async function GET(request) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const page = searchParams.get('page') || 1
    const pageSize = searchParams.get('page_size') || 25

    if (!query) return Response.json({ error: 'Query parameter "q" is required' }, { status: 400 })

    try {
        const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}`
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        })

        if (!res.ok) {
            return Response.json({ error: 'Docker Hub search failed' }, { status: res.status })
        }

        const data = await res.json()

        const results = (data.results || []).map(r => ({
            name: r.repo_name || r.name,
            description: r.short_description || r.description || '',
            stars: r.star_count || 0,
            pulls: r.pull_count || 0,
            isOfficial: r.is_official || false,
            isAutomated: r.is_automated || false,
        }))

        return Response.json({
            results,
            total: data.count || results.length,
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
