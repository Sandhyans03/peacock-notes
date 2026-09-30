// Run: npx tsx --env-file=.env.local scripts/verify-api.ts   (registers a throwaway test user in your DB)
import { app } from "../src/server/app";
import { auth } from "../src/server/auth";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${x}`); };
const json = (body: unknown, cookie?: string) => ({ method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

check("health", (await app.request("/api/health")).status === 200);
check("create note without login -> 401", (await app.request("/api/notes", json({}))).status === 401);
check("invalid token -> 404", (await app.request("/api/share/nope")).status === 404);

// register + login through Better Auth's handler (same as the /api/auth route)
const email = `t${Date.now()}@example.com`;
const su = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ name: "T", email, password: "Test12345" }) }));
check("register", su.status === 200, `(${su.status})`);
const cookie = (su.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
check("session cookie issued", cookie.length > 0);
check("/api/notes/:id requires login", (await app.request("/api/notes/00000000-0000-0000-0000-000000000000")).status === 401);

const exp = new Date(Date.now() + 3600_000).toISOString();
const bad = await app.request("/api/notes", json({ title: "", content: "x", expiresAt: exp, shareType: "one_time", accessType: "public" }, cookie));
check("validation: empty title -> 400", bad.status === 400);
const past = await app.request("/api/notes", json({ title: "a", content: "x", expiresAt: new Date(Date.now() - 1000).toISOString(), shareType: "one_time", accessType: "public" }, cookie));
check("validation: past expiry -> 400", past.status === 400);

const c1 = await app.request("/api/notes", json({ title: "Hello", content: "Body", expiresAt: exp, shareType: "one_time", accessType: "password" }, cookie));
const n = await c1.json() as any;
check("create note -> 201 with url + accessKey", c1.status === 201 && n.url.includes("/share/") && n.accessKey?.length === 10);
const token = n.url.split("/share/")[1];

const st = await (await app.request(`/api/share/${token}`)).json() as any;
check("status: ok + password + one_time", st.state === "ok" && st.accessType === "password" && st.shareType === "one_time");
const wrong = await app.request(`/api/share/${token}/access`, json({ password: "wrongkey" }));
check("wrong key -> 401", wrong.status === 401);
const ok = await app.request(`/api/share/${token}/access`, json({ password: n.accessKey }));
const okBody = await ok.json() as any;
check("correct key -> 200 with note", ok.status === 200 && okBody.note.content === "Body");
const again = await app.request(`/api/share/${token}/access`, json({ password: n.accessKey }));
check("reuse one-time -> 410", again.status === 410);

// owner page + revoke over HTTP
const c2 = await app.request("/api/notes", json({ title: "Pub", content: "P", expiresAt: exp, shareType: "time_based", accessType: "public" }, cookie));
const n2 = await c2.json() as any; const t2 = n2.url.split("/share/")[1];
await app.request(`/api/share/${t2}/access`, json({})); await app.request(`/api/share/${t2}/access`, json({}));
const detail = await (await app.request(`/api/notes/${n2.noteId}`, { headers: { cookie } })).json() as any;
check("owner sees view count 2", detail.links[0].viewCount === 2);
check("other users' notes hidden (no cookie)", (await app.request(`/api/notes/${n2.noteId}`)).status === 401);
const rv = await app.request(`/api/shares/${detail.links[0].id}/revoke`, { method: "POST", headers: { cookie } });
check("revoke -> 200", rv.status === 200);
check("revoked link -> 410", (await app.request(`/api/share/${t2}/access`, json({}))).status === 410);
const detail2 = await (await app.request(`/api/notes/${n2.noteId}`, { headers: { cookie } })).json() as any;
check("revoked: count still 2", detail2.links[0].viewCount === 2);

// rate limit: default 20/min per IP per link
let last = 0; for (let i = 0; i < 25; i++) last = (await app.request(`/api/share/rl-test/access`, { ...json({}), headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" } })).status;
check("rate limit kicks in after 20 requests -> 429", last === 429);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
