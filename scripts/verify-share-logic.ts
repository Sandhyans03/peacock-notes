// Run: npx tsx --env-file=.env.local scripts/verify-share-logic.ts   (writes test rows to your DB)
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { shareLinks } from "../src/server/db/schema";
import { hashToken } from "../src/server/lib/crypto";
import { accessShare, createNoteWithShare, revokeShare, getShareStatus } from "../src/server/services/share";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); };
const inFuture = (ms: number) => new Date(Date.now() + ms);
const make = (shareType: "one_time" | "time_based", accessType: "public" | "password", ms = 3600_000, user = "u1") =>
  createNoteWithShare({ userId: user, title: "t", content: "secret body", expiresAt: inFuture(ms), shareType, accessType });
const views = async (token: string) => (await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(token))))[0].viewCount;

// 1. public time-based, sequential
{ const n = await make("time_based", "public");
  for (let i = 0; i < 3; i++) await accessShare(n.token);
  check("public time-based: 3 opens -> count 3", (await views(n.token)) === 3); }

// 2. one-time public, 50 parallel
{ const n = await make("one_time", "public");
  const r = await Promise.all(Array.from({ length: 50 }, () => accessShare(n.token)));
  const ok = r.filter((x) => x.ok).length;
  check("one-time public: 50 parallel -> exactly 1 success", ok === 1, `(got ${ok})`);
  check("one-time public: view count exactly 1", (await views(n.token)) === 1);
  check("one-time public: losers told 'used'", r.filter((x) => !x.ok).every((x: any) => x.reason === "used")); }

// 3. password time-based: wrong vs right, lockout
{ const n = await make("time_based", "password");
  check("access key generated (10 chars)", n.accessKey?.length === 10);
  const w = await accessShare(n.token, "wrong");
  check("wrong password rejected", !w.ok && (w as any).reason === "wrong_password");
  check("wrong password: count stays 0", (await views(n.token)) === 0);
  const noPw = await accessShare(n.token);
  check("missing password rejected", !noPw.ok);
  const good = await accessShare(n.token, n.accessKey!);
  check("correct key unlocks", good.ok);
  check("correct key: count 1", (await views(n.token)) === 1);
  for (let i = 0; i < 5; i++) await accessShare(n.token, "bad" + i);
  const locked = await accessShare(n.token, n.accessKey!);
  check("5 wrong attempts -> locked even for correct key", !locked.ok && (locked as any).reason === "locked");
  check("locked: count unchanged (1)", (await views(n.token)) === 1); }

// 4. one-time + password: wrong doesn't burn it
{ const n = await make("one_time", "password");
  await accessShare(n.token, "nope");
  const s = await getShareStatus(n.token);
  check("wrong password does NOT consume one-time link", s.state === "ok");
  const good = await accessShare(n.token, n.accessKey!);
  check("correct key opens one-time link", good.ok);
  const again = await accessShare(n.token, n.accessKey!);
  check("second use rejected as 'used'", !again.ok && (again as any).reason === "used");
  check("count exactly 1", (await views(n.token)) === 1); }

// 5. one-time + password, 20 parallel correct
{ const n = await make("one_time", "password");
  const r = await Promise.all(Array.from({ length: 20 }, () => accessShare(n.token, n.accessKey!)));
  check("one-time password: 20 parallel correct -> exactly 1", r.filter((x) => x.ok).length === 1);
  check("count exactly 1", (await views(n.token)) === 1); }

// 6. time-based 100 parallel -> count exactly 100
{ const n = await make("time_based", "public");
  await Promise.all(Array.from({ length: 100 }, () => accessShare(n.token)));
  check("time-based: 100 parallel views -> count exactly 100", (await views(n.token)) === 100); }

// 7. expiry
{ const n = await make("time_based", "public", 1200);
  const a = await accessShare(n.token); await new Promise((r) => setTimeout(r, 1800));
  const b = await accessShare(n.token);
  check("before expiry works", a.ok);
  check("after expiry rejected", !b.ok && (b as any).reason === "expired");
  check("expired: count stays 1", (await views(n.token)) === 1); }

// 8. revoke
{ const n = await make("time_based", "public");
  await accessShare(n.token);
  check("non-owner cannot revoke", (await revokeShare("attacker", n.linkId)) === false);
  check("owner revokes", (await revokeShare("u1", n.linkId)) === true);
  const r = await accessShare(n.token);
  check("revoked link rejected", !r.ok && (r as any).reason === "revoked");
  check("revoked: count stays 1", (await views(n.token)) === 1);
  check("revoke twice -> false", (await revokeShare("u1", n.linkId)) === false); }

// 9. invalid token
{ const r = await accessShare("totally-invalid-token");
  check("invalid token -> not_found", !r.ok && (r as any).reason === "not_found"); }

// 10. stored values are hashes, not secrets
{ const n = await make("time_based", "password");
  const row = (await db.select().from(shareLinks).where(eq(shareLinks.id, n.linkId)))[0];
  check("token not stored raw", row.tokenHash !== n.token && row.tokenHash.length === 64);
  check("access key stored as bcrypt hash", row.passwordHash !== n.accessKey && row.passwordHash!.startsWith("$2")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
