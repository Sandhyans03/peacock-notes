// Fires many simultaneous requests at ONE one-time public link.
// Usage: node scripts/race-test.mjs <token> [count] [baseUrl]
// Start the server with RATE_LIMIT_MAX=1000 first, otherwise the per-IP rate limit (20/min) answers with 429.
// <token> is the part after /share/ in the link.
const [, , token, n = "50", base = "http://localhost:3000"] = process.argv;
if (!token) {
  console.log("Usage: node scripts/race-test.mjs <token> [count] [baseUrl]");
  process.exit(1);
}
const N = Number(n);
const statuses = await Promise.all(
  Array.from({ length: N }, () =>
    fetch(`${base}/api/share/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((r) => r.status),
  ),
);
const tally = {};
for (const s of statuses) tally[s] = (tally[s] || 0) + 1;
console.log("Status codes:", tally);
console.log(tally[200] === 1 ? "PASS: exactly one request got the note" : "FAIL: expected exactly one 200");
