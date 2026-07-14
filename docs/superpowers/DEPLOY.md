# BuildTrackerPro PWA — Deployment Runbook

> **Status (2026-07-14): LIVE.** Deployed at **https://buildtrackerpro.vercel.app**
> (Vercel project `rshah112s-projects/buildtrackerpro`; deploy from `web/`). Backend is the
> shared `Smart_Home_Hub` Supabase project, using the dedicated `buildtracker` schema.
> Production builds require explicit Vercel environment variables; no production
> credentials or project URLs are baked into the client bundle.

The sections below are the original one-time setup notes, kept for reference / re-deploys.

## 1. Supabase (database + auth)

To stay under the free-tier 2-project cap, BuildTracker **shares the existing
`Smart_Home_Hub` project** (ref `wzbtxwnvplpnwmavfdwx`) instead of getting its own.
All BuildTracker tables live in a dedicated **`buildtracker` schema**, fully isolated
from Smart Home Hub's `public` schema. The client targets it via
`createClient(..., { db: { schema: 'buildtracker' } })` in `src/lib/supabase.ts`.

The Data API exposes `buildtracker` alongside the other apps' schemas. Supabase migration
history is project-wide, not schema-scoped, and production already uses timestamped version
IDs shared with the other app. **Never run `supabase db push` from this repo's numeric
`0001`–style history and never run `supabase config push` against this shared project.**

For a release:

1. Export roles, schema, data, migration history, Auth/Storage metadata, and object bytes.
2. Pull the exact remote timestamped migration history into an isolated temporary workspace.
3. Append only the reviewed new BuildTracker migrations with new unique timestamps.
4. Run `supabase migration list --linked` and `supabase db push --dry-run` there.
5. Apply from that isolated workspace during a quiet window, then compare BuildTracker
   financial totals before and after. Do not push global project config.

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
`web/.vercelignore` keeps the local `.env` out of the upload. Configure these in the
BuildTracker Vercel project before deploying:
| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Smart_Home_Hub project URL (§1) |
| `VITE_SUPABASE_ANON_KEY` | Smart_Home_Hub anon/publishable key (§1) |
| `SUPABASE_URL` | Same project URL, for server functions |
| `SUPABASE_ANON_KEY` | Same anon/publishable key, for server functions |
| `SUPABASE_SERVICE_ROLE` | Smart_Home_Hub service_role key (§1) |
| `R2_ACCOUNT_ID` | from §2 |
| `R2_ACCESS_KEY_ID` | from §2 |
| `R2_SECRET_ACCESS_KEY` | from §2 |
| `R2_BUCKET` | from §2 |
| `CF_AI_TOKEN` | Cloudflare Workers AI token for OCR |
| `VITE_VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PUBLIC_KEY` | Same Web Push public key, for the cron |
| `VAPID_PRIVATE_KEY` | Matching Web Push private key |
| `CRON_SECRET` | Strong secret used by Vercel Cron |
Do **not** set `VITE_R2_LOCAL` in production (it forces the local stub).

Vercel is currently deployed directly rather than from a connected Git repository. Preserve
the source in Git first, then deploy from the linked `web/.vercel` project. A Vercel rollback
restores the previous app build but does not undo Supabase migrations, database writes, or R2
changes.

## 4. Install on iPhone

Open the Vercel URL in Safari → Share → **Add to Home Screen**. Launches standalone (full screen).

## Notes
- Supabase free tier pauses a project after ~7 days of inactivity; just reopen the app to wake it.
- The `api/r2-sign` function verifies your Supabase JWT before signing any URL, and namespaces
  every object key under your user id, so blobs are as private as the rows.
