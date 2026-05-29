# BuildTrackerPro PWA — Deployment Runbook

The whole app is built and tested locally. This is the one part that needs you, because
it requires creating free accounts. ~10–15 minutes, one time.

## 1. Supabase (database + auth)

1. Create a project at https://supabase.com (free tier).
2. From **Project Settings → API**, copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE` (server-only, never in the client)
3. Push the schema from `web/`:
   ```bash
   cd web
   supabase link --project-ref <your-project-ref>
   supabase db push        # applies migrations/0001_schema.sql + 0002_rls.sql
   ```
4. Create your single login: **Authentication → Users → Add user** (set email + password,
   mark email confirmed). Or run `node --env-file=.env.production scripts/seed-user.mjs`.

## 2. Cloudflare R2 (photos / receipts / documents)

1. Create an R2 bucket at https://dash.cloudflare.com → R2 (free: 10 GB, no egress).
2. Create an R2 API token (Object Read & Write). Copy:
   - Account ID → `R2_ACCOUNT_ID`
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Bucket name → `R2_BUCKET`
3. Set the bucket's **CORS policy** so the browser can upload via presigned URLs:
   ```json
   [
     {
       "AllowedOrigins": ["https://<your-app>.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

## 3. Vercel (hosting)

1. Import the GitHub repo at https://vercel.com (connect `rshah112/BuildTrackerPro-V2`).
2. **Root Directory = `web/`**, Framework = Vite (auto-detected via `vercel.json`).
3. Add Environment Variables (Production):
   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | from step 1 |
   | `VITE_SUPABASE_ANON_KEY` | from step 1 |
   | `SUPABASE_SERVICE_ROLE` | from step 1 |
   | `R2_ACCOUNT_ID` | from step 2 |
   | `R2_ACCESS_KEY_ID` | from step 2 |
   | `R2_SECRET_ACCESS_KEY` | from step 2 |
   | `R2_BUCKET` | from step 2 |
   Do **not** set `VITE_R2_LOCAL` in production (it forces the local stub).
4. Deploy.

## 4. Install on iPhone

Open the Vercel URL in Safari → Share → **Add to Home Screen**. Launches standalone (full screen).

## Notes
- Supabase free tier pauses a project after ~7 days of inactivity; just reopen the app to wake it.
- The `api/r2-sign` function verifies your Supabase JWT before signing any URL, and namespaces
  every object key under your user id, so blobs are as private as the rows.
