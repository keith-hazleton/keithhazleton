import { verifyToken, handleAuth, clearCookieHeader } from './auth.js';
import { listMovies, nominateMovie, toggleVote, removeMovie } from './movies.js';
import { handleAdmin } from './admin.js';
import { listScreenings } from './screenings.js';
import { corsHeaders, json, unauthorized } from './utils.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const cors = corsHeaders(origin);

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: cors });
        }

        try {
            if (url.pathname === '/auth' && request.method === 'POST') {
                return handleAuth(request, env, 'guest', cors);
            }
            if (url.pathname === '/auth/admin' && request.method === 'POST') {
                return handleAuth(request, env, 'admin', cors);
            }
            if (url.pathname === '/auth/logout' && request.method === 'POST') {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Set-Cookie': clearCookieHeader(),
                        ...cors,
                    },
                });
            }

            const token = getToken(request);
            const claims = token ? await verifyToken(token, env.TOKEN_SECRET) : null;
            if (!claims) return unauthorized(cors);

            const isAdmin = claims.sub === 'admin';

            if (url.pathname === '/me' && request.method === 'GET') {
                return json({ role: claims.sub }, 200, cors);
            }
            if (url.pathname === '/event' && request.method === 'GET') {
                const event = await env.CINEMA_KV.get('config:event', 'json');
                return json({ event: event || {} }, 200, cors);
            }
            if (url.pathname === '/movies' && request.method === 'GET') {
                return listMovies(env, cors, claims);
            }
            if (url.pathname === '/movies' && request.method === 'POST') {
                return nominateMovie(request, env, claims, cors);
            }
            const voteMatch = url.pathname.match(/^\/movies\/(\d+)\/vote$/);
            if (voteMatch && request.method === 'POST') {
                return toggleVote(voteMatch[1], env, claims, cors);
            }
            const delMatch = url.pathname.match(/^\/movies\/(\d+)$/);
            if (delMatch && request.method === 'DELETE') {
                if (!isAdmin) return unauthorized(cors);
                return removeMovie(delMatch[1], env, cors);
            }
            if (url.pathname === '/screenings' && request.method === 'GET') {
                return listScreenings(env, cors);
            }

            if (url.pathname.startsWith('/admin')) {
                if (!isAdmin) return unauthorized(cors);
                return handleAdmin(request, env, cors);
            }

            return json({ error: 'Not found' }, 404, cors);
        } catch (err) {
            return json({ error: err.message || 'Server error' }, 500, cors);
        }
    },
};

function getToken(request) {
    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/ssc_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}
