import { json } from './utils.js';

export async function listScreenings(env, cors) {
    const list = await env.CINEMA_KV.list({ prefix: 'screening:' });
    const screenings = [];
    for (const k of list.keys) {
        const s = await env.CINEMA_KV.get(k.name, 'json');
        if (s) screenings.push(s);
    }
    screenings.sort((a, b) => new Date(b.date) - new Date(a.date));
    return json({ screenings }, 200, cors);
}
