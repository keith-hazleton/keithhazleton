import { json, badRequest } from './utils.js';

export async function listMovies(env, cors, claims) {
    const list = await env.CINEMA_KV.list({ prefix: 'movie:' });
    const movies = [];
    for (const k of list.keys) {
        const m = await env.CINEMA_KV.get(k.name, 'json');
        if (!m || m.status === 'removed') continue;
        const v = await env.CINEMA_KV.get(`votes:${m.id}`, 'json');
        m.voteCount = v?.count || 0;
        m.hasVoted = v?.tokens?.includes(claims.sid) || false;
        movies.push(m);
    }
    movies.sort((a, b) => a.id - b.id);
    return json({ movies }, 200, cors);
}

export async function nominateMovie(request, env, claims, cors) {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').trim().slice(0, 200);
    const pitch = (body.pitch || '').trim().slice(0, 500);
    if (!title) return badRequest('title required', cors);

    const counterRaw = await env.CINEMA_KV.get('meta:movieCounter');
    const id = (parseInt(counterRaw) || 0) + 1;
    const movie = {
        id,
        title,
        pitch,
        nominatedBy: claims.sid.slice(0, 8),
        status: 'active',
        createdAt: new Date().toISOString(),
    };
    await env.CINEMA_KV.put(`movie:${id}`, JSON.stringify(movie));
    await env.CINEMA_KV.put(`votes:${id}`, JSON.stringify({ count: 0, tokens: [] }));
    await env.CINEMA_KV.put('meta:movieCounter', String(id));
    return json({ movie }, 200, cors);
}

export async function toggleVote(id, env, claims, cors) {
    const event = await env.CINEMA_KV.get('config:event', 'json');
    if (event?.votingClosesAt && new Date() > new Date(event.votingClosesAt)) {
        return json({ error: 'Voting has closed' }, 403, cors);
    }
    if (event && event.votingOpen === false) {
        return json({ error: 'Voting is closed' }, 403, cors);
    }

    const movie = await env.CINEMA_KV.get(`movie:${id}`, 'json');
    if (!movie || movie.status === 'removed') {
        return json({ error: 'Not found' }, 404, cors);
    }

    const v = (await env.CINEMA_KV.get(`votes:${id}`, 'json')) || { count: 0, tokens: [] };
    const sid = claims.sid;
    const idx = v.tokens.indexOf(sid);
    const wasVoted = idx >= 0;
    if (wasVoted) v.tokens.splice(idx, 1);
    else v.tokens.push(sid);
    v.count = v.tokens.length;
    await env.CINEMA_KV.put(`votes:${id}`, JSON.stringify(v));
    return json({ voteCount: v.count, hasVoted: !wasVoted }, 200, cors);
}

export async function removeMovie(id, env, cors) {
    const movie = await env.CINEMA_KV.get(`movie:${id}`, 'json');
    if (!movie) return json({ error: 'Not found' }, 404, cors);
    movie.status = 'removed';
    await env.CINEMA_KV.put(`movie:${id}`, JSON.stringify(movie));
    return json({ ok: true }, 200, cors);
}
