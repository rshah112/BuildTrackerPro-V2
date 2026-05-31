// Keep-alive ping for the free-tier Supabase project. Supabase pauses a free project
// after ~7 days of NO activity; a paused project stays offline until manually restored.
// A Vercel Cron job (see vercel.json "crons") hits this endpoint daily, which issues one
// tiny database request — that counts as activity and resets the inactivity timer, so the
// project never auto-pauses even if no one opens the app for a while.
//
// Public + safe: it uses only the public anon key and reads nothing (RLS returns no rows
// to an anonymous caller); the point is purely that a request reaches the database.

export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://wzbtxwnvplpnwmavfdwx.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6YnR4d252cGxwbndtYXZmZHd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk2MzEsImV4cCI6MjA5NTE0NTYzMX0.P1BlgrtVK3CpRLjcZsZugB-78_HO4GFSUXplCtbbBAY'

export default async function handler(): Promise<Response> {
  let dbStatus = 0
  try {
    // A real PostgREST → Postgres read (buildtracker schema). Anonymous + RLS means it
    // returns []; we only care that the request hit the database.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id&limit=1`, {
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
        'accept-profile': 'buildtracker',
      },
    })
    dbStatus = res.status
  } catch {
    /* even a failed attempt is an inbound request; report and move on */
  }
  return new Response(JSON.stringify({ ok: true, dbStatus, at: new Date().toISOString() }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
