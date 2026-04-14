import { json } from './utils.js';

export async function handleAdmin(request, env, cors) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/admin/event' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const current = (await env.CINEMA_KV.get('config:event', 'json')) || {};
        const next = { ...current, ...body };
        await env.CINEMA_KV.put('config:event', JSON.stringify(next));
        return json({ event: next }, 200, cors);
    }

    if (path === '/admin/reset' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const clear = body.clearNominees === true;
        if (clear) {
            const list = await env.CINEMA_KV.list({ prefix: 'movie:' });
            for (const k of list.keys) {
                const m = await env.CINEMA_KV.get(k.name, 'json');
                if (m && m.status === 'active') {
                    m.status = 'removed';
                    await env.CINEMA_KV.put(k.name, JSON.stringify(m));
                }
            }
        }
        const votes = await env.CINEMA_KV.list({ prefix: 'votes:' });
        for (const k of votes.keys) {
            await env.CINEMA_KV.put(k.name, JSON.stringify({ count: 0, tokens: [] }));
        }
        return json({ ok: true }, 200, cors);
    }

    const selMatch = path.match(/^\/admin\/select\/(\d+)$/);
    if (selMatch && method === 'POST') {
        const id = parseInt(selMatch[1]);
        const movie = await env.CINEMA_KV.get(`movie:${id}`, 'json');
        if (!movie) return json({ error: 'Not found' }, 404, cors);
        movie.status = 'selected';
        await env.CINEMA_KV.put(`movie:${id}`, JSON.stringify(movie));
        const event = (await env.CINEMA_KV.get('config:event', 'json')) || {};
        event.selectedMovie = { id, title: movie.title };
        await env.CINEMA_KV.put('config:event', JSON.stringify(event));
        return json({ event }, 200, cors);
    }

    if (path === '/admin/screening' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.title || !body.date) {
            return json({ error: 'title and date required' }, 400, cors);
        }
        const counterRaw = await env.CINEMA_KV.get('meta:screeningCounter');
        const id = (parseInt(counterRaw) || 0) + 1;
        const screening = {
            id,
            movieId: body.movieId || null,
            title: body.title,
            date: body.date,
            photoUrl: body.photoUrl || null,
            review: body.review || null,
            createdAt: new Date().toISOString(),
        };
        await env.CINEMA_KV.put(`screening:${id}`, JSON.stringify(screening));
        await env.CINEMA_KV.put('meta:screeningCounter', String(id));
        return json({ screening }, 200, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
}
