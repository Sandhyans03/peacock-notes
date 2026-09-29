import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "./auth";

type Env = { Variables: { userId: string } };

// Runs before protected routes: reads the session cookie, rejects if not logged in.
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

export const app = new Hono<Env>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Temporary test route to prove the login check works
app.get("/me", requireAuth, (c) => c.json({ userId: c.get("userId") }));
