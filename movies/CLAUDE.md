# Second Saturday Cinema — working notes

Spec: `../SSC_SPEC.md` (read this first — it's the source of truth for scope and phasing).

## Status

**Phase 1 (Save the Date): DONE, not yet committed.**
- `movies/index.html` + `movies/styles.css` — static landing page with invite gate.
- Gate code: `LCFmovies` (case-insensitive, client-side only — spec explicitly OKs this for Phase 1).
- Signal invite URL is wired in (the real one, not a placeholder).
- Inherits fonts and base tokens from repo root (`../fonts/fonts.css`, `../styles.css`).

**Phase 2 (Interactive): NOT STARTED.** This is the next session's work.

## Decisions already made (don't re-litigate)

- **Stack:** Keith chose plain HTML/CSS (Option 1) over React+Vite for Phase 1. Revisit React only if Phase 2's voting UI feels painful in vanilla JS.
- **Date:** Saturday May 9, 2026 (second Saturday in May). The spec has a stray "May 10" typo — ignore it.
- **Location line:** vague on purpose — "Keith's backyard, La Cañada Flintridge — full address in the Signal group." Do not add a street address to the site.
- **Repo layout:** colocated subdirectory (`/movies/`), not a standalone repo.
- **No SEO:** `<meta robots="noindex, nofollow">` is set. Don't add to sitemap or main nav.

## Cross-browser gotchas discovered in Phase 1 (don't repeat)

These were all real bugs we hit. Worth remembering if you add more typography or components:

1. **`[hidden]` vs. `display: flex`.** If you set `display: flex/grid` on an element that you later toggle with the `[hidden]` attribute, flex wins. Fixed with a global `[hidden] { display: none !important; }` in `styles.css`. Leave that rule alone.
2. **Safari faux-bold on `<h1>`.** Instrument Serif only ships at weight 400. Browser-default `<h1>` is weight 700, so Safari synthesizes bold — renders as visibly doubled/hairy strokes. Fixed with `font-synthesis: none` + explicit `font-weight: 400` on all display-font elements. If you add a new heading using `var(--font-display)`, add it to that selector list.
3. **Don't try `ascent-override` / `descent-override` on these fonts.** I tried this to fix italic vertical alignment and it clipped glyphs. The real issue was faux-bold (#2), not metrics.
4. **`localStorage` on `file://`.** Safari throws on `file://`. Gate script wraps storage in try/catch and falls back to sessionStorage. Tell Keith to test via `python3 -m http.server 8000` (from repo root) → `http://localhost:8000/movies/`, not by opening the HTML file directly.
5. **Grain overlay:** parent `styles.css` has a body::before noise overlay. It turned out NOT to be the cause of the stroke artifacts, but I disabled it on the SSC page anyway (kept the rule — it's fine to leave off since the cinema page has its own atmosphere).

## Phase 2 starting point

Per the spec:
- Cloudflare Worker + KV for backend; URL will be `second-saturday-cinema.<account>.workers.dev` (Keith to provide account name).
- New Worker secrets to set via `wrangler secret put`: `INVITE_CODE`, `ADMIN_CODE`, `TOKEN_SECRET`.
- Move invite validation server-side (HMAC-signed session token, 90-day cookie).
- Build: nominations list + voting toggle, admin GUI at `/movies/#/admin`, past screenings gallery.
- Photos: Phase 2 = committed to repo; Phase 3 = R2 upload.

**Before writing any Worker code, confirm with Keith:**
- Cloudflare account name (for the `*.workers.dev` URL).
- Admin code value (different from the guest `LCFmovies`).
- Whether he wants the seed nominees pre-loaded, and if so, which titles.
- Whether "Sinners" is the first feature or the first feature is itself put to a vote (open question #5 in spec).

## File map

```
movies/
├── CLAUDE.md          ← this file
├── index.html         ← gate + landing page (single file, no build step)
└── styles.css         ← cinema-specific styles on top of ../styles.css
```

When Phase 2 lands, split into `index.html` (public) + a small JS module for the API client. Don't preemptively split before there's code to put in the second file.
