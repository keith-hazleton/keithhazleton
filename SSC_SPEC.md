# Second Saturday Cinema — SPEC.md

## Overview

A personal movie night website for Keith's monthly backyard screening events. The site lives at `keithhazleton.com/movies`, is gated behind a shared invite code, and provides event details, movie nominations/voting, and a past screenings gallery. Coordination logistics (RSVPs, potluck, day-of comms) happen in a Signal group — the site is the polished hub, not the chat.

**Target audience:** 10-15 friends and their kids. Wide tech comfort range.
**Target launch:** Mid-May 2026 (Phase 1 ASAP for invites, Phase 2 before first screening on Saturday May 9, 2026).

---

## Architecture

### Frontend
- **Framework:** React + Vite (consistent with Keith's other sites)
- **Hosting:** GitHub Pages at `keithhazleton.com/movies`
- **Repo:** New repo or subdirectory of existing `keithhazleton.com` repo (Keith's preference — colocated subdirectory like the blog, or standalone repo)
- **Routing:** Hash router (GitHub Pages compatible) or catch-all redirect

### Backend
- **Runtime:** Cloudflare Worker (free tier: 100k requests/day)
- **Data store:** Cloudflare KV (free tier: 1GB storage, 100k reads/day, 1k writes/day)
- **URL:** `second-saturday-cinema.<account>.workers.dev` (migrate to `api.keithhazleton.com` later if desired)
- **CORS:** Worker returns appropriate headers for `keithhazleton.com` origin

### Why this stack
- No Pi exposure — backend runs on Cloudflare's edge
- No uptime concerns — Worker is always available, no SD card failures
- Free tier is wildly oversized for this use case
- GitHub Pages + Worker = zero hosting cost
- Keith already has a Cloudflare account

---

## Phased Delivery

### Phase 1 — Save the Date (ASAP, ~1-2 days of Claude Code work)

Pure static site on GitHub Pages. No Worker needed yet.

**What it includes:**
- Invite code gate (client-side check is fine for Phase 1 — the code just prevents casual stumble-ins, not determined attackers; no sensitive data exposed)
- "Second Saturday Cinema" branded landing page
- Next event block: date (Saturday May 10, 2026), time, "Location details in the Signal group"
- Practical info: what to expect, kid-friendliness, bring a chair/blanket
- Link/QR to join the Signal group
- Responsive design (guests will hit this from phones)

**What it does NOT include:**
- Nominations, voting, admin GUI, gallery (all Phase 2)

**Design direction:**
- Warm, inviting, slightly retro cinema aesthetic — think indie movie house, not AMC
- Dark background (it's a movie night), warm accent colors
- Distinctive typography — a characterful display font for the title, clean readable body
- Should feel personal and fun, not corporate
- Mobile-first — most guests will open this from a text message link

### Phase 2 — Interactive Features (before first screening, ~May 9)

Adds Cloudflare Worker + KV backend and all interactive features.

**Nominations & Voting:**
- Guest can nominate a movie (title input, optionally a short pitch)
- Full nominee list displayed with vote counts
- One vote per guest per movie (tap to vote/unvote — toggle, not one-and-done)
- Voting is anonymous-ish (no sign-in, tracked by a session token in the cookie to prevent trivial ballot stuffing, but not bulletproof — this is movie night, not an election)
- Keith seeds initial nominees (including carried-over losers from previous months)
- Poll results visible to everyone in real time

**Admin GUI:**
- Separate admin code (different from the guest invite code)
- Accessible at `/movies/#/admin` or similar
- Capabilities:
  - Add/remove movie nominees
  - Reset voting for new month (clears votes, keeps or removes nominees at Keith's discretion)
  - Mark a movie as "selected" for the upcoming screening
  - Update next event details (date, time, notes)
  - Add a past screening entry (movie title, date, optional photo URL, optional one-liner review)
  - Bulk carry-over: after selecting a winner, one-click to carry unselected nominees to next month

**Past Screenings Gallery:**
- Grid of past movie nights
- Each card: movie title, date, optional photo, optional one-liner
- Reverse chronological (most recent first)
- Starts empty, grows over time
- Photos uploaded where? Options:
  - Committed to the repo (simplest, Keith pushes images via git)
  - Uploaded to Cloudflare R2 (free tier, 10GB) via admin GUI (nicer UX, more Worker complexity)
  - **Recommendation:** Start with repo-committed images in Phase 2. Move to R2 upload in Phase 3 if the git workflow feels annoying.

**Invite Code — Upgraded:**
- Validation moves server-side (Worker checks the code)
- Worker returns a signed token (HMAC with a secret in Worker env vars)
- Token stored in cookie, expires after 90 days
- All API requests include the token; Worker validates before responding
- Guest invite code and admin code are separate env vars on the Worker

### Phase 3 — Polish & Fun (post-launch, no rush)

- Photo upload via admin GUI (Cloudflare R2)
- Fun stats page (most nominated movie, total movies screened, voting participation)
- Theme night suggestions
- Richer gallery (multiple photos per screening, guest-submitted photos)
- Custom subdomain for Worker API (`api.keithhazleton.com`) — requires moving nameservers to Cloudflare
- Optional: TMDB API integration to auto-populate movie posters/descriptions from title

---

## Data Model (Cloudflare KV)

KV is a flat key-value store, so we use key prefixes as pseudo-tables.

### Keys

```
config:event          → { date, time, notes, selectedMovie, votingOpen }
config:inviteHash     → bcrypt or SHA-256 hash of the invite code (not plaintext)
config:adminHash      → hash of the admin code

movie:{id}            → { id, title, pitch, nominatedBy, status, createdAt }
                        status: "active" | "selected" | "removed" | "screened"

votes:{movieId}       → { count, tokens: [sessionToken1, sessionToken2, ...] }

screening:{id}        → { id, movieId, title, date, photoUrl, review, createdAt }

meta:movieCounter     → auto-incrementing ID for movies
meta:screeningCounter → auto-incrementing ID for screenings
```

### Notes on KV usage
- KV is eventually consistent (reads may lag writes by a few seconds). For 10-15 people voting casually, this is irrelevant.
- Vote toggling: Worker checks if the session token is in the votes array, adds or removes it, updates count. Race condition window is tiny and consequence is a double-vote on movie night — not worth solving.
- All values are JSON-serialized strings.

---

## Worker API Endpoints

All endpoints require a valid session token cookie except `POST /auth`.

```
POST   /auth              → Validate invite code, return session token
POST   /auth/admin        → Validate admin code, return admin token

GET    /event             → Current event details + selected movie
GET    /movies            → All active nominees with vote counts
POST   /movies            → Nominate a movie { title, pitch? }
POST   /movies/{id}/vote  → Toggle vote on a movie
DELETE /movies/{id}       → Remove a nominee (admin only)

POST   /admin/event       → Update event details
POST   /admin/reset       → Reset voting for new month (options: keep or clear nominees)
POST   /admin/select/{id} → Mark a movie as selected
POST   /admin/screening   → Add a past screening entry
GET    /screenings        → All past screenings (public, for gallery)
```

---

## Repo Structure

```
keithhazleton.com/
├── movies/                    ← New subdirectory (or standalone repo, TBD)
│   ├── src/
│   │   ├── components/
│   │   │   ├── InviteGate.jsx
│   │   │   ├── EventDetails.jsx
│   │   │   ├── MovieList.jsx
│   │   │   ├── NominationForm.jsx
│   │   │   ├── VotingCard.jsx
│   │   │   ├── PastScreenings.jsx
│   │   │   ├── AdminPanel.jsx
│   │   │   └── Layout.jsx
│   │   ├── api/
│   │   │   └── client.js       ← Fetch wrapper for Worker API
│   │   ├── App.jsx
│   │   ├── config.js           ← Worker URL, site metadata
│   │   └── main.jsx
│   ├── public/
│   │   └── images/
│   │       └── screenings/     ← Past screening photos (Phase 2)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── worker/                     ← Cloudflare Worker (could also be a separate repo)
│   ├── src/
│   │   ├── index.js            ← Router + middleware
│   │   ├── auth.js             ← Invite code + admin code validation, token signing
│   │   ├── movies.js           ← Nomination + voting handlers
│   │   ├── admin.js            ← Admin-only handlers
│   │   └── screenings.js       ← Past screenings handlers
│   ├── wrangler.toml           ← Worker config, KV binding, env var references
│   └── package.json
```

---

## Configuration & Secrets

### Cloudflare Worker Environment Variables (set via `wrangler secret put`)
- `INVITE_CODE` — the shared guest invite code (plaintext, compared server-side)
- `ADMIN_CODE` — the admin code
- `TOKEN_SECRET` — HMAC signing key for session tokens

### Cloudflare KV Namespace
- Create one namespace (e.g., `CINEMA_KV`) and bind it in `wrangler.toml`

### Frontend Config (`config.js`)
- `WORKER_URL` — the `*.workers.dev` URL (no secrets in frontend code)
- `SITE_TITLE` — "Second Saturday Cinema"

---

## Design Notes

- **Aesthetic:** Warm, retro indie cinema. Dark palette with warm accents (amber, cream, deep red). Think Alamo Drafthouse vibes, not Fandango.
- **Typography:** Characterful display font for headings (something with personality — condensed serif or vintage sans), clean sans for body. Self-hosted fonts (no Google Fonts CDN).
- **Mobile-first:** Most guests open this from a phone. Touch-friendly vote buttons, large tap targets.
- **Tone:** Fun, personal, slightly cheeky. This is Keith's backyard, not a theater chain.
- **No address on site.** Location block says something like "Keith's backyard in La Cañada Flintridge — full address in the Signal group."
- **Signal link:** Prominent but not pushy. Maybe in a "Join the Group" section with the Signal group link/QR.

---

## Open Questions for Keith

1. **Repo structure:** Colocated subdirectory of `keithhazleton.com` (like the blog plan) or standalone repo? Colocated is simpler for deployment; standalone keeps the project boundary clean.

2. **First screening date:** Saturday May 9 is the second Saturday in May. Does that work as the target?

3. **Cloudflare account name:** Needed for the `*.workers.dev` URL. (Keith can check this in his Cloudflare dashboard.)

4. **Invite code value:** Keith picks the code. Can be set later via `wrangler secret put`.

5. **Movie for the first screening:** Sinners, or put it to a vote?

6. **Signal group:** Already created, or needs to be set up?

7. **Vite base path:** If colocated, the Vite `base` config needs to be `/movies/`. Confirm this matches the desired URL structure.

---

## Out of Scope

- User accounts or authentication (invite code only)
- Email notifications (Signal handles this)
- RSVP tracking (Signal handles this)
- Potluck coordination (Signal handles this)
- Streaming/playback of any kind
- Payment or ticket functionality
- SEO (intentionally unlisted)
