const API = 'https://second-saturday-cinema.hazletok.workers.dev';
const TOKEN_KEY = 'ssc-token';
const ROLE_KEY = 'ssc-role';

const state = {
    role: null,
    movies: [],
    event: null,
    screenings: [],
};

// ---------- API CLIENT ----------
function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return sessionStorage.getItem(TOKEN_KEY); }
}
function setToken(token, role) {
    try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(ROLE_KEY, role); return; } catch {}
    try { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(ROLE_KEY, role); } catch {}
}
function getRole() {
    try { return localStorage.getItem(ROLE_KEY); } catch { return sessionStorage.getItem(ROLE_KEY); }
}
function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY); } catch {}
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(ROLE_KEY); } catch {}
}

async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers });
    let data = {};
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
}

// ---------- AUTH ----------
async function loginGuest(code) {
    const { status, data } = await api('/auth', { method: 'POST', body: JSON.stringify({ code }) });
    if (status === 200 && data.token) {
        setToken(data.token, data.role);
        state.role = data.role;
        return true;
    }
    return false;
}

async function loginAdmin(code) {
    const { status, data } = await api('/auth/admin', { method: 'POST', body: JSON.stringify({ code }) });
    if (status === 200 && data.token) {
        setToken(data.token, data.role);
        state.role = data.role;
        return true;
    }
    return false;
}

async function checkAuth() {
    if (!getToken()) return null;
    const { status, data } = await api('/me');
    if (status === 200) {
        state.role = data.role;
        return data.role;
    }
    clearToken();
    return null;
}

function signout() {
    clearToken();
    state.role = null;
    location.hash = '';
    location.reload();
}

// ---------- DATA ----------
async function loadEvent() {
    const { data } = await api('/event');
    state.event = data.event || {};
}
async function loadMovies() {
    const { data } = await api('/movies');
    state.movies = data.movies || [];
}
async function loadScreenings() {
    const { data } = await api('/screenings');
    state.screenings = data.screenings || [];
}

// ---------- RENDER: TICKET ----------
function renderTicket() {
    const ev = state.event || {};
    const dateEl = document.getElementById('ticket-date');
    const timeEl = document.getElementById('ticket-time');
    const featureEl = document.getElementById('ticket-feature');
    if (ev.date) {
        const d = new Date(ev.date + 'T12:00:00');
        const fmt = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        dateEl.textContent = fmt.replace(/,/g, ' ·');
    }
    if (ev.time) timeEl.textContent = ev.time;
    if (ev.selectedMovie && ev.selectedMovie.title) {
        featureEl.innerHTML = `<strong>${escapeHtml(ev.selectedMovie.title)}</strong>`;
    } else {
        featureEl.innerHTML = `TBD — <a href="#ballot">cast your vote</a>`;
    }
}

// ---------- RENDER: BALLOT ----------
function votingClosed() {
    const ev = state.event || {};
    if (ev.votingOpen === false) return true;
    if (ev.votingClosesAt && new Date() > new Date(ev.votingClosesAt)) return true;
    return false;
}

function renderDeadline() {
    const el = document.getElementById('ballot-deadline');
    const ev = state.event || {};
    if (!ev.votingClosesAt) { el.textContent = ''; return; }
    const d = new Date(ev.votingClosesAt);
    const fmt = d.toLocaleString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
    if (votingClosed()) {
        el.innerHTML = `<span class="closed">Voting closed.</span>`;
    } else {
        el.innerHTML = `Voting closes <strong>${fmt}</strong>`;
    }
}

function renderBallot() {
    const grid = document.getElementById('ballot-grid');
    const closed = votingClosed();
    const maxVotes = Math.max(1, ...state.movies.map(m => m.voteCount || 0));

    grid.innerHTML = state.movies.map(m => {
        const pct = Math.round(100 * (m.voteCount || 0) / maxVotes);
        return `
            <div class="ballot-card${m.hasVoted ? ' voted' : ''}${m.status === 'selected' ? ' selected' : ''}" data-id="${m.id}">
                <div class="ballot-card-body">
                    <h3>${escapeHtml(m.title)}</h3>
                    ${m.pitch ? `<p class="pitch">${escapeHtml(m.pitch)}</p>` : ''}
                    <div class="vote-bar"><div class="vote-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <button class="vote-btn" data-id="${m.id}" ${closed ? 'disabled' : ''}>
                    <span class="vote-count">${m.voteCount || 0}</span>
                    <span class="vote-label">${m.hasVoted ? 'Voted' : 'Vote'}</span>
                </button>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', onVoteClick);
    });
}

async function onVoteClick(e) {
    const btn = e.currentTarget;
    const id = btn.dataset.id;
    btn.disabled = true;
    const { status, data } = await api(`/movies/${id}/vote`, { method: 'POST' });
    btn.disabled = false;
    if (status !== 200) {
        alert(data.error || 'Vote failed.');
        return;
    }
    const movie = state.movies.find(m => String(m.id) === String(id));
    if (movie) {
        movie.voteCount = data.voteCount;
        movie.hasVoted = data.hasVoted;
    }
    renderBallot();
}

// ---------- NOMINATION ----------
function initNominationForm() {
    const form = document.getElementById('nominate-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const title = (fd.get('title') || '').trim();
        const pitch = (fd.get('pitch') || '').trim();
        if (!title) return;
        const btn = form.querySelector('button');
        btn.disabled = true;
        const { status, data } = await api('/movies', {
            method: 'POST', body: JSON.stringify({ title, pitch }),
        });
        btn.disabled = false;
        if (status !== 200) {
            alert(data.error || 'Nomination failed.');
            return;
        }
        form.reset();
        form.closest('details').open = false;
        await loadMovies();
        renderBallot();
    });
}

// ---------- RENDER: GALLERY ----------
function renderGallery() {
    const section = document.getElementById('gallery-section');
    const grid = document.getElementById('gallery-grid');
    if (!state.screenings.length) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    section.classList.add('visible');
    grid.innerHTML = state.screenings.map(s => {
        const d = new Date(s.date + 'T12:00:00');
        const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
            <article class="gallery-card">
                ${s.photoUrl ? `<img src="${escapeAttr(s.photoUrl)}" alt="${escapeAttr(s.title)}" loading="lazy">` : '<div class="gallery-placeholder">🎞️</div>'}
                <div class="gallery-meta">
                    <div class="gallery-date">${fmt}</div>
                    <h3>${escapeHtml(s.title)}</h3>
                    ${s.review ? `<p>${escapeHtml(s.review)}</p>` : ''}
                </div>
            </article>
        `;
    }).join('');
}

// ---------- ADMIN ----------
function initAdminRoute() {
    window.addEventListener('hashchange', route);
    route();
}

function route() {
    const hash = location.hash;
    const adminEl = document.getElementById('admin');
    const siteEl = document.getElementById('site');
    if (hash === '#/admin' && state.role) {
        adminEl.hidden = false;
        siteEl.hidden = true;
        renderAdmin();
    } else {
        adminEl.hidden = true;
        if (state.role) siteEl.hidden = false;
    }
}

function renderAdmin() {
    const isAdmin = state.role === 'admin';
    document.getElementById('admin-gate').hidden = isAdmin;
    document.getElementById('admin-panel').hidden = !isAdmin;
    if (isAdmin) renderAdminPanel();
}

function initAdminGate() {
    const form = document.getElementById('admin-gate-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('admin-gate-input');
        const err = document.getElementById('admin-gate-error');
        const code = input.value.trim();
        const ok = await loginAdmin(code);
        if (ok) {
            err.textContent = '';
            renderAdmin();
            await refreshAll();
        } else {
            err.textContent = 'Nope.';
            input.select();
        }
    });
}

function renderAdminPanel() {
    const panel = document.getElementById('admin-panel');
    const ev = state.event || {};
    const votingClosesLocal = ev.votingClosesAt
        ? new Date(ev.votingClosesAt).toISOString().slice(0, 16)
        : '';

    panel.innerHTML = `
        <div class="admin-header">
            <h1>Admin</h1>
            <a href="#/" class="admin-back">← Back to site</a>
        </div>

        <section class="admin-block">
            <h2>Event</h2>
            <form id="admin-event-form" class="admin-form">
                <label>Date <input type="date" name="date" value="${escapeAttr(ev.date || '')}"></label>
                <label>Time / notes <input type="text" name="time" value="${escapeAttr(ev.time || '')}"></label>
                <label>Voting closes at <input type="datetime-local" name="votingClosesAt" value="${votingClosesLocal}"></label>
                <label class="admin-check"><input type="checkbox" name="votingOpen" ${ev.votingOpen !== false ? 'checked' : ''}> Voting open</label>
                <button type="submit">Save event</button>
            </form>
        </section>

        <section class="admin-block">
            <h2>Nominees</h2>
            <ul class="admin-movie-list">
                ${state.movies.map(m => `
                    <li class="${m.status === 'selected' ? 'is-selected' : ''}">
                        <span class="movie-title">${escapeHtml(m.title)} <span class="movie-votes">(${m.voteCount || 0} votes)</span></span>
                        <span class="movie-actions">
                            ${m.status === 'selected' ? '<em>selected</em>' : `<button data-action="select" data-id="${m.id}">Select</button>`}
                            <button data-action="remove" data-id="${m.id}" class="danger">Remove</button>
                        </span>
                    </li>
                `).join('')}
            </ul>
        </section>

        <section class="admin-block">
            <h2>Reset for next month</h2>
            <p class="admin-hint">Clears vote counts. Optionally also removes all current nominees.</p>
            <div class="admin-reset-row">
                <button data-action="reset-votes">Reset votes only</button>
                <button data-action="reset-all" class="danger">Reset votes + remove nominees</button>
            </div>
        </section>

        <section class="admin-block">
            <h2>Add a past screening</h2>
            <form id="admin-screening-form" class="admin-form">
                <label>Title <input type="text" name="title" required></label>
                <label>Date <input type="date" name="date" required></label>
                <label>Photo URL (optional) <input type="url" name="photoUrl"></label>
                <label>One-liner review (optional) <input type="text" name="review"></label>
                <button type="submit">Add screening</button>
            </form>
        </section>

        <section class="admin-block">
            <button id="admin-signout" class="danger">Sign out</button>
        </section>
    `;

    document.getElementById('admin-event-form').addEventListener('submit', onEventSave);
    document.getElementById('admin-screening-form').addEventListener('submit', onScreeningAdd);
    document.getElementById('admin-signout').addEventListener('click', signout);
    panel.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', onAdminAction);
    });
}

async function onEventSave(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        date: fd.get('date') || '',
        time: fd.get('time') || '',
        votingOpen: fd.get('votingOpen') === 'on',
    };
    const vc = fd.get('votingClosesAt');
    if (vc) body.votingClosesAt = new Date(vc).toISOString();
    const { status, data } = await api('/admin/event', { method: 'POST', body: JSON.stringify(body) });
    if (status !== 200) { alert(data.error || 'Save failed.'); return; }
    state.event = data.event;
    renderAdminPanel();
}

async function onScreeningAdd(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        title: fd.get('title'),
        date: fd.get('date'),
        photoUrl: fd.get('photoUrl') || null,
        review: fd.get('review') || null,
    };
    const { status, data } = await api('/admin/screening', { method: 'POST', body: JSON.stringify(body) });
    if (status !== 200) { alert(data.error || 'Failed.'); return; }
    await loadScreenings();
    e.target.reset();
    alert('Added.');
}

async function onAdminAction(e) {
    const { action, id } = e.currentTarget.dataset;
    if (action === 'select') {
        if (!confirm('Mark this as the selected movie?')) return;
        const { status, data } = await api(`/admin/select/${id}`, { method: 'POST' });
        if (status !== 200) { alert(data.error || 'Failed.'); return; }
        state.event = data.event;
        await loadMovies();
        renderAdminPanel();
    } else if (action === 'remove') {
        if (!confirm('Remove this nominee?')) return;
        const { status, data } = await api(`/movies/${id}`, { method: 'DELETE' });
        if (status !== 200) { alert(data.error || 'Failed.'); return; }
        await loadMovies();
        renderAdminPanel();
    } else if (action === 'reset-votes' || action === 'reset-all') {
        const clear = action === 'reset-all';
        if (!confirm(clear ? 'Reset all votes AND remove all nominees?' : 'Reset all vote counts?')) return;
        const { status, data } = await api('/admin/reset', {
            method: 'POST', body: JSON.stringify({ clearNominees: clear }),
        });
        if (status !== 200) { alert(data.error || 'Failed.'); return; }
        await loadMovies();
        renderAdminPanel();
    }
}

// ---------- UTILS ----------
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---------- INIT ----------
async function refreshAll() {
    await Promise.all([loadEvent(), loadMovies(), loadScreenings()]);
    renderTicket();
    renderDeadline();
    renderBallot();
    renderGallery();
    updateFooterAdminLink();
}

function updateFooterAdminLink() {
    const link = document.getElementById('footer-admin');
    if (!link) return;
    link.textContent = state.role === 'admin' ? 'Admin' : 'Admin sign-in';
}

function initGate() {
    const form = document.getElementById('gate-form');
    const input = document.getElementById('gate-input');
    const err = document.getElementById('gate-error');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = (input.value || '').trim();
        if (!code) return;
        const ok = await loginGuest(code);
        if (ok) {
            err.textContent = '';
            await unlock();
        } else {
            err.textContent = "That code doesn't match. Check with Keith.";
            input.select();
        }
    });

    const signoutBtn = document.getElementById('ssc-signout');
    if (signoutBtn) signoutBtn.addEventListener('click', signout);
}

async function unlock() {
    document.getElementById('gate').hidden = true;
    document.getElementById('site').hidden = false;
    document.body.classList.add('unlocked');
    initReveal();
    initNominationForm();
    await refreshAll();
    route();
}

function initReveal() {
    const reveals = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting) {
                en.target.classList.add('visible');
                obs.unobserve(en.target);
            }
        });
    }, { threshold: 0.15 });
    reveals.forEach(el => obs.observe(el));
    initBulbs();
}

function initBulbs() {
    const strips = document.querySelectorAll('.marquee-bulbs');
    strips.forEach(strip => {
        if (strip.childElementCount) return;
        for (let i = 0; i < 24; i++) {
            const b = document.createElement('span');
            b.className = 'bulb';
            b.style.animationDelay = (Math.random() * -3.2).toFixed(2) + 's';
            b.style.animationDuration = (2.6 + Math.random() * 1.4).toFixed(2) + 's';
            strip.appendChild(b);
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initGate();
    initAdminGate();
    initAdminRoute();
    const role = await checkAuth();
    if (role) {
        await unlock();
    } else {
        document.getElementById('gate-input').focus();
    }
});
