import { json, badRequest } from './utils.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadPhoto(request, env, cors) {
    const ct = request.headers.get('Content-Type') || '';
    if (!ALLOWED_TYPES.has(ct)) {
        return badRequest('Unsupported image type. Use JPEG, PNG, or WebP.', cors);
    }
    const buf = await request.arrayBuffer();
    if (buf.byteLength === 0) return badRequest('Empty upload.', cors);
    if (buf.byteLength > MAX_BYTES) return badRequest('Image too large (max 8MB).', cors);

    const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
    const key = `screenings/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    await env.CINEMA_PHOTOS.put(key, buf, {
        httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000, immutable' },
    });

    const base = env.PHOTOS_PUBLIC_BASE || 'https://second-saturday-cinema.hazletok.workers.dev/photo';
    return json({ url: `${base}/${key}`, key }, 200, cors);
}

export async function servePhoto(key, env) {
    if (!key.startsWith('screenings/')) return new Response('Not found', { status: 404 });
    const obj = await env.CINEMA_PHOTOS.get(key);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    if (!headers.has('cache-control')) {
        headers.set('cache-control', 'public, max-age=31536000, immutable');
    }
    return new Response(obj.body, { headers });
}
