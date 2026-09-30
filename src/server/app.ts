import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { auth } from "./auth";
import { rateLimit } from "./lib/rate-limit";
import { accessShare, createNoteWithShare, getOwnedNote, getShareStatus, revokeShare } from "./services/share";

type Env = { Variables: { userId: string } };

// Runs before protected routes: reads the session cookie, rejects if not logged in.
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// Maps a failure reason to an HTTP status code
const STATUS = { not_found: 404, revoked: 410, expired: 410, used: 410, locked: 429, wrong_password: 401 } as const;

export const app = new Hono<Env>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(50000),
  expiresAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), "Expiry must be in the future"),
  shareType: z.enum(["one_time", "time_based"]),
  accessType: z.enum(["public", "password"]),
});

// Create a note + its share link. Token and access key are shown once, never again.
app.post("/notes", requireAuth, zValidator("json", createSchema), async (c) => {
  const { noteId, token, accessKey } = await createNoteWithShare({
    userId: c.get("userId"),
    ...c.req.valid("json"),
  });
  const url = `${process.env.APP_URL}/share/${token}`;
  return c.json({ noteId, url, accessKey }, 201);
});

// Owner view of a note: details, links, view counts
app.get("/notes/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
  const data = await getOwnedNote(c.get("userId"), id);
  return data ? c.json(data) : c.json({ error: "not_found" }, 404);
});

// Force-revoke a link (owner only)
app.post("/shares/:linkId/revoke", requireAuth, async (c) => {
  const linkId = c.req.param("linkId");
  if (!z.string().uuid().safeParse(linkId).success) return c.json({ error: "not_found" }, 404);
  const ok = await revokeShare(c.get("userId"), linkId);
  return ok ? c.json({ revoked: true }) : c.json({ error: "not_found_or_already_revoked" }, 404);
});

// Public: link status only. Never consumes the link or changes the count.
app.get("/share/:token", async (c) => {
  const s = await getShareStatus(c.req.param("token"));
  if (s.state === "ok" || s.state === "locked") return c.json(s);
  return c.json(s, STATUS[s.state]);
});

// Public: actually open the link. POST so crawlers and prefetchers can't consume one-time links.
app.post(
  "/share/:token/access",
  rateLimit({ limit: Number(process.env.RATE_LIMIT_MAX ?? 20), windowMs: 60_000 }), // default: 20 attempts per minute per IP per link
  zValidator("json", z.object({ password: z.string().max(100).optional() })),
  async (c) => {
    const r = await accessShare(c.req.param("token"), c.req.valid("json").password);
    if (r.ok) return c.json({ note: r.note });
    return c.json({ error: r.reason }, STATUS[r.reason]);
  },
);
