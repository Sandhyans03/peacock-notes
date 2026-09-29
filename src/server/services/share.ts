import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { notes, shareLinks } from "../db/schema";
import { generateAccessKey, generateToken, hashPassword, hashToken, verifyPassword } from "../lib/crypto";

const MAX_FAILED = sql.raw("5");        // wrong passwords allowed
const LOCK_MINUTES = sql.raw("15");     // lock length after too many wrong passwords

export type CreateInput = {
  userId: string;
  title: string;
  content: string;
  expiresAt: Date;
  shareType: "one_time" | "time_based";
  accessType: "public" | "password";
};

export async function createNoteWithShare(input: CreateInput) {
  const token = generateToken();
  const accessKey = input.accessType === "password" ? generateAccessKey() : null;
  const passwordHash = accessKey ? await hashPassword(accessKey) : null;

  const created = await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notes)
      .values({ userId: input.userId, title: input.title, content: input.content })
      .returning();
    const [link] = await tx
      .insert(shareLinks)
      .values({
        noteId: note.id,
        tokenHash: hashToken(token),
        shareType: input.shareType,
        accessType: input.accessType,
        passwordHash,
        expiresAt: input.expiresAt,
      })
      .returning({ id: shareLinks.id });
    return { noteId: note.id, linkId: link.id };
  });

  // The raw token and access key are returned ONCE. Only hashes are stored.
  return { ...created, token, accessKey };
}

export type LinkState = "ok" | "not_found" | "revoked" | "expired" | "used" | "locked";

// Works out why a link is usable or not. Uses the DATABASE clock (now()), not the app server's.
async function getLink(token: string) {
  const [row] = await db
    .select({
      id: shareLinks.id,
      shareType: shareLinks.shareType,
      accessType: shareLinks.accessType,
      passwordHash: shareLinks.passwordHash,
      revoked: sql<boolean>`${shareLinks.revokedAt} IS NOT NULL`,
      expired: sql<boolean>`${shareLinks.expiresAt} <= now()`,
      used: sql<boolean>`${shareLinks.usedAt} IS NOT NULL`,
      locked: sql<boolean>`${shareLinks.lockedUntil} IS NOT NULL AND ${shareLinks.lockedUntil} > now()`,
    })
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const state: LinkState = row.revoked
    ? "revoked"
    : row.expired
      ? "expired"
      : row.shareType === "one_time" && row.used
        ? "used"
        : row.locked
          ? "locked"
          : "ok";
  return { ...row, state };
}

// Metadata only. Never consumes the link and never changes the view count,
// so link-preview bots can't burn a one-time link.
export async function getShareStatus(token: string) {
  const link = await getLink(token);
  if (!link) return { state: "not_found" as const };
  return { state: link.state, accessType: link.accessType, shareType: link.shareType };
}

export type AccessResult =
  | { ok: true; note: { title: string; content: string } }
  | { ok: false; reason: Exclude<LinkState, "ok"> | "wrong_password" };

export async function accessShare(token: string, password?: string): Promise<AccessResult> {
  const link = await getLink(token);
  if (!link) return { ok: false, reason: "not_found" };
  if (link.state !== "ok") return { ok: false, reason: link.state };

  // Step 1: check the password BEFORE consuming. A wrong password must never burn a one-time link.
  if (link.accessType === "password") {
    const valid = !!password && !!link.passwordHash && (await verifyPassword(password, link.passwordHash));
    if (!valid) {
      // Atomic counter: after 5 wrong tries the link locks for 15 minutes.
      await db
        .update(shareLinks)
        .set({
          failedAttempts: sql`${shareLinks.failedAttempts} + 1`,
          lockedUntil: sql`CASE WHEN ${shareLinks.failedAttempts} + 1 >= ${MAX_FAILED}
                           THEN now() + (${LOCK_MINUTES} * interval '1 minute')
                           ELSE ${shareLinks.lockedUntil} END`,
        })
        .where(eq(shareLinks.id, link.id));
      return { ok: false, reason: "wrong_password" };
    }
  }

  // Step 2: ONE atomic UPDATE checks the rules, marks it used AND increments the view count together.
  // Postgres locks the row, so two simultaneous requests queue up. The second one re-checks the
  // WHERE conditions after the first commits, sees used_at is set, and matches 0 rows.
  const claimed = await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      usedAt: sql`CASE WHEN ${shareLinks.shareType} = 'one_time' THEN now() ELSE ${shareLinks.usedAt} END`,
      failedAttempts: 0,
    })
    .where(
      and(
        eq(shareLinks.id, link.id),
        isNull(shareLinks.revokedAt),
        gt(shareLinks.expiresAt, sql`now()`),
        or(eq(shareLinks.shareType, "time_based"), isNull(shareLinks.usedAt)),
        or(isNull(shareLinks.lockedUntil), sql`${shareLinks.lockedUntil} <= now()`),
      ),
    )
    .returning({ noteId: shareLinks.noteId });

  if (claimed.length === 0) {
    // Lost the race, or the link changed in between. Report the real reason.
    const again = await getLink(token);
    return { ok: false, reason: again && again.state !== "ok" ? again.state : "used" };
  }

  const [note] = await db
    .select({ title: notes.title, content: notes.content })
    .from(notes)
    .where(eq(notes.id, claimed[0].noteId));
  return { ok: true, note };
}

// Owner only: the subquery makes sure users can only revoke links on their own notes.
export async function revokeShare(userId: string, linkId: string) {
  const res = await db
    .update(shareLinks)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(shareLinks.id, linkId),
        isNull(shareLinks.revokedAt),
        inArray(shareLinks.noteId, db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId))),
      ),
    )
    .returning({ id: shareLinks.id });
  return res.length > 0;
}

// For the /notes/[id] page: the note plus its links, owner only.
export async function getOwnedNote(userId: string, noteId: string) {
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  if (!note) return null;
  const links = await db
    .select({
      id: shareLinks.id,
      shareType: shareLinks.shareType,
      accessType: shareLinks.accessType,
      expiresAt: shareLinks.expiresAt,
      usedAt: shareLinks.usedAt,
      revokedAt: shareLinks.revokedAt,
      viewCount: shareLinks.viewCount,
      lockedUntil: shareLinks.lockedUntil,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.noteId, noteId));
  return { note, links };
}

