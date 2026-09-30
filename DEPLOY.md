# Deploy (Vercel + Neon), about 10 minutes

1. Push the project to GitHub (see the git commands at the bottom).
2. Go to vercel.com -> **Add New -> Project** -> import the repo. Framework: Next.js (auto-detected).
3. Before pressing Deploy, add **Environment Variables**:
   - `DATABASE_URL`  = your Neon connection string (the same one as in `.env.local` is fine)
   - `BETTER_AUTH_SECRET` = a NEW random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `APP_URL` = `https://placeholder.vercel.app` (fix in step 5)
   - `BETTER_AUTH_URL` = same as APP_URL
4. Press **Deploy**. Note the URL Vercel gives you (like `https://peacock-notes-xyz.vercel.app`).
5. In Vercel -> Settings -> Environment Variables set `APP_URL` and `BETTER_AUTH_URL` to that real URL, then **Deployments -> Redeploy**.
6. Open the live URL, register a test user (this is your "test credentials"), and run through the demo.

Tables already exist in Neon (you ran `npx drizzle-kit migrate` locally), so nothing else is needed.

## Git commands
```
git add .
git commit -m "feat: complete secure note sharing app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
(Create the empty repo on github.com first. `.env.local` is git-ignored, so secrets are not uploaded.)
