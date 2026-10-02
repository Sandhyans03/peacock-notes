# Secure Note Sharing (Next.js + Hono + PostgreSQL)

Create notes and share them through secure, expiring, revocable links.

## Tech stack
Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, Hono.js (mounted as a Next.js route handler),
PostgreSQL (Neon) + Drizzle ORM, Better Auth (email + password sessions), bcryptjs, zod.

## Setup
1. `npm install`
2. Create `.env.local`:
   ```
   DATABASE_URL=postgresql://...
   APP_URL=http://localhost:3000
   BETTER_AUTH_SECRET=<32+ random chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   BETTER_AUTH_URL=http://localhost:3000
   ```
3. `npx drizzle-kit migrate` (creates all tables)
4. `npm run dev` -> http://localhost:3000

Test credentials: email test@example.com / password Test12345

## Database schema
- `user`, `session`, `account`, `verification`: Better Auth tables.
- `notes`: id, user_id, title, content, created_at.
- `share_links`: id, note_id (FK, cascade), token_hash (unique), share_type (`one_time`|`time_based`),
  access_type (`public`|`password`), password_hash, expires_at, used_at, revoked_at, view_count,
  failed_attempts, locked_until, created_at.

## Share link flow
1. Logged-in user creates a note with expiry, share type and access type.
2. Server generates a random token, stores only its SHA-256 hash, returns `/share/<token>` once.
3. Visitor opens `/share/<token>`. The page calls `GET /api/share/:token` (status only, no side effects).
4. Visitor clicks Open/Unlock, which calls `POST /api/share/:token/access`. That call validates and counts the view.

## Password / key generation
For password links the server generates a 10-character key with `crypto.randomInt` from an alphabet without
look-alike characters. It is shown once and stored only as a bcrypt hash. Verification uses `bcrypt.compare`.

## Expiry logic
Every access compares `expires_at` with the database clock (`now()`), not the app server or the browser.
One-time links additionally expire once `used_at` is set.

## Invalidate / revoke logic
`POST /api/shares/:id/revoke` (owner only) sets `revoked_at = now()`. The access query requires
`revoked_at IS NULL`, so the link stops working immediately. History and view count are kept.

## View count logic
`view_count = view_count + 1` runs inside the same atomic UPDATE that authorises the view. Only a successful
public view or successful unlock reaches it. Wrong password, expired, revoked, used and locked links never do.

## Race-condition handling
Access is one atomic statement:
`UPDATE share_links SET view_count = view_count + 1, used_at = CASE WHEN one_time THEN now() ... WHERE id = ? AND revoked_at IS NULL AND expires_at > now() AND (time_based OR used_at IS NULL) AND (locked_until IS NULL OR locked_until <= now()) RETURNING ...`
Postgres row-locks the row, so concurrent requests queue; the second re-evaluates the WHERE after the first commits
and matches 0 rows. Run `node scripts/race-test.mjs <token> 50` on a one-time public link: exactly one 200.

## Short answers
- **Two users on a one-time link at once?** The single atomic UPDATE above. Only one request gets a row back.
- **Updating view count safely?** Increment in SQL inside the same statement, never read-modify-write in app code.
- **1 million people opening a link?** Time-based public links: one indexed lookup by `token_hash`; add a CDN/cache for
  the status endpoint, a connection pool, and buffer view counts (Redis counter or queue, flushed in batches).
  One-time links serialise on one row by design, which is correct because only one viewer may win.
- **Brute force on password links?** Random 10-char keys, bcrypt (slow), and a per-link lockout: 5 wrong attempts lock
  the link for 15 minutes. Plus a per-IP rate limit on the access endpoint (20 requests/min/IP/link, `RATE_LIMIT_MAX` to change). For many server instances use a shared store (Redis/Upstash).

## Automated verification
Run against your own database (they create throwaway rows):
```
npm i -D tsx
npx tsx --env-file=.env.local scripts/verify-share-logic.ts   # 30 checks: expiry, revoke, wrong key, lockout, view counts, 50 parallel one-time requests
npx tsx --env-file=.env.local scripts/verify-api.ts           # 19 checks over HTTP: auth, validation, one-time, revoke, rate limit
RATE_LIMIT_MAX=1000 npm run dev  # then: node scripts/race-test.mjs <token-of-a-one-time-public-link> 50
```

## Deployment
See `DEPLOY.md` (Vercel + Neon).
