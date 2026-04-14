import { json, badRequest } from './utils.js';

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

function b64urlEncodeBytes(buf) {
    const arr = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlEncodeString(s) {
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return atob(str);
}

function b64urlDecodeToBytes(str) {
    const s = b64urlDecodeToString(str);
    const arr = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
}

async function hmacKey(secret) {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

export async function signToken(claims, secret) {
    const payload = b64urlEncodeString(JSON.stringify(claims));
    const key = await hmacKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return `${payload}.${b64urlEncodeBytes(sig)}`;
}

export async function verifyToken(token, secret) {
    try {
        const [payload, sig] = token.split('.');
        if (!payload || !sig) return null;
        const key = await hmacKey(secret);
        const valid = await crypto.subtle.verify(
            'HMAC',
            key,
            b64urlDecodeToBytes(sig),
            new TextEncoder().encode(payload)
        );
        if (!valid) return null;
        const claims = JSON.parse(b64urlDecodeToString(payload));
        if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
        return claims;
    } catch {
        return null;
    }
}

function cookieHeader(token) {
    return `ssc_token=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${TOKEN_TTL_SECONDS}`;
}

export function clearCookieHeader() {
    return 'ssc_token=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
}

export async function handleAuth(request, env, role, cors) {
    const body = await request.json().catch(() => ({}));
    const code = (body.code || '').trim();
    if (!code) return badRequest('code required', cors);

    const expected = role === 'admin' ? env.ADMIN_CODE : env.INVITE_CODE;
    if (!expected || code.toLowerCase() !== expected.toLowerCase()) {
        return json({ error: 'Invalid code' }, 401, cors);
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
        sub: role,
        sid: crypto.randomUUID(),
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
    };
    const token = await signToken(claims, env.TOKEN_SECRET);

    return new Response(JSON.stringify({ ok: true, role, token }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader(token),
            ...cors,
        },
    });
}
