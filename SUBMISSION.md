# Submission helper (not part of the app)

## 1. Demo video checklist (screen recording, 3-5 min, order matters)
1. Register/login. Create a note (title, content, expiry, Time-based + Public). Show the generated share link.
2. Open link in a private window: Open note -> note shows. Reload/open again. Show **Views** rising on `/notes/<id>` (Refresh).
3. Create a Password-protected note. Show the generated **access key** (point out: shown only once).
4. Private window: wrong key -> error, **Views unchanged**. Correct key -> note shows, **Views +1**.
5. Create a One-time public link: open once (works), reload (already used). Views = 1.
6. Create a link with expiry 1-2 minutes ahead, open it after the time passes -> expired.
7. Create a link, click **Revoke** on `/notes/<id>`, open it -> revoked. Views unchanged.
8. (Bonus) Enter 5 wrong keys -> locked message.

## 2. Technical explanation video (max 8 min, webcam ON, Google Meet recording is fine)
Talk in your own words, roughly:
- 0:00 What the app does; stack (Next.js + Hono + Postgres/Drizzle + Better Auth).
- 1:00 Create flow: random token -> only SHA-256 hash stored; access key -> bcrypt hash; both shown once.
- 2:30 Open `src/server/services/share.ts`, function `accessShare`: (1) look up + state check, (2) verify password BEFORE consuming, (3) ONE atomic UPDATE ... WHERE ... RETURNING that checks rules + marks used + increments count.
- 4:30 Why atomic: two simultaneous requests -> Postgres row lock -> second sees used_at set -> 0 rows. Show `scripts/verify-share-logic.ts` result (50 parallel -> 1 success).
- 5:30 Expiry uses DB `now()`; revoke sets `revoked_at`; view count only in the atomic update.
- 6:30 Security: GET status never consumes (bots), POST access; lockout after 5 wrong; per-IP rate limit; owner-only revoke; React escapes note content.
- 7:30 1M viewers: cache status, pooled connections, batch counters; brute force answer.

## 3. Email
To: jackson@peacockindia.in
CC: admin@peacockindia.in, harish@peacockindia.in, shreeram@peacockindia.in
Subject: MERN/PERN Stack Developer POC Submission – [Your Name]

Hello,
Please find my POC submission:
- Live demo URL: <url>
- GitHub repository: <url>
- Demo video: <url>
- Technical explanation video: <url>
- Test credentials: email <email> / password <password>

Thank you,
[Your Name]
