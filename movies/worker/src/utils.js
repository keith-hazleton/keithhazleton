const ALLOWED_ORIGINS = [
    'https://keithhazleton.com',
    'http://localhost:8000',
    'http://localhost:5173',
];

export function corsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
    };
}

export function json(data, status = 200, cors = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
    });
}

export function unauthorized(cors) {
    return json({ error: 'Unauthorized' }, 401, cors);
}

export function badRequest(msg, cors) {
    return json({ error: msg }, 400, cors);
}
