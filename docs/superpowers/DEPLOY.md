# BuildTrackerPro PWA — Deployment Runbook

> **Status (2026-05-30): LIVE.** Deployed at **https://buildtrackerpro.vercel.app**
> (Vercel project `rshah112s-projects/buildtrackerpro`, root dir `web/`). Backend is the
> shared `Smart_Home_Hub` Supabase project, `buildtracker` schema. Login `rajrulz@aol.com`
> is created and confirmed. Core app (auth + budget loop) needs no Vercel env vars — the
> public Supabase URL + anon key are baked into the build (`src/lib/supabase.ts`).
> **Only remaining optional step:** Cloudflare R2 for receipt/photo uploads (§2 + §3 env).

The sections below are the original one-time setup notes, kept for reference / re-deploys.

## 1. Supabase (database + auth)

To stay under the free-tier 2-project cap, BuildTracker **shares the existing
`Smart_Home_Hub` project** (ref `wzbtxwnvplpnwmavfdwx`) instead of getting its own.
All BuildTracker tables live in a dedicated **`buildtracker` schema**, fully isolated
from Smart Home Hub's `public` schema. The client targets it via
`createClient(..., { db: { schema: 'buildtracker' } })` in `src/lib/supabase.ts`.

The schema is **already applied** to the remote project (migrations
`0001_schema` / `0002_rls` / `0003_grants`) and exposed to the Data API via
`ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, buildtracker'`.
To re-apply or push future migrations from `web/`:
   ```bash
   cd web
   supabase link --project-ref wzbtxwnvplpnwmavfdwx
   supabase db push        # applies migrations/0001..0003
   ```
   If a future migration adds tables, run `notify pgrst, 'reload schema';` (SQL editor)
   so PostgREST picks them up.

1. From **Project Settings → API** of the `Smart_Home_Hub` project, copy:
   - Project URL (`https://wzbtxwnvplpnwmavfdwx.supabase.co`) → `VITE_SUPABASE_URL`
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE` (server-only, never in the client)
2. Create your single login: **Authentication → Users → Add user** (set email + password,
   mark email confirmed). Or run `node --env-file=.env.production scripts/seed-user.mjs`.
   (Auth users are shared across both apps in this project — that's fine; row access is
   still scoped per-user by RLS.)

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

## 3. Vercel (hosting) — done

Already deployed as `rshah112s-projects/buildtrackerpro`. To re-deploy from `web/`:
```bash
cd web
npx vercel deploy --prod --scope rshah112s-projects
```
`web/.vercelignore` keeps the local `.env` out of the upload so the build uses the
baked-in production Supabase config. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
**not** required as Vercel env vars (they're the build fallback).

**Only needed for receipt/photo uploads (R2):** add these Vercel env vars, then redeploy:
| Key | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE` | Smart_Home_Hub service_role key (§1) |
| `R2_ACCOUNT_ID` | from §2 |
| `R2_ACCESS_KEY_ID` | from §2 |
| `R2_SECRET_ACCESS_KEY` | from §2 |
| `R2_BUCKET` | from §2 |
Do **not** set `VITE_R2_LOCAL` in production (it forces the local stub).

## 4. Install on iPhone

Open the Vercel URL in Safari → Share → **Add to Home Screen**. Launches standalone (full screen).

## Notes
- Supabase free tier pauses a project after ~7 days of inactivity; just reopen the app to wake it.
- The `api/r2-sign` function verifies your Supabase JWT before signing any URL, and namespaces
  every object key under your user id, so blobs are as private as the rows.
