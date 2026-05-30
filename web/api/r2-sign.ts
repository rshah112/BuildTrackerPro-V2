// Vercel serverless function: mints short-lived presigned URLs for Cloudflare R2.
// The browser never holds R2 credentials. Every call must carry a valid Supabase
// JWT; keys are namespaced by user id so one user can't sign for another's objects.
// Built/served by Vercel (not Vite); the pure key helpers it uses are unit-tested
// in src/lib/objectKey.ts.

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { objectKeyFor, keyBelongsToUser } from '../src/lib/objectKey'

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  })
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  // getUser(jwt) validates the caller's login token; the public anon key suffices —
  // no secret service-role key needed. Falls back to the baked prod Supabase config
  // (mirrors src/lib/supabase.ts), so uploads work with only the 4 R2_* vars set.
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    'https://wzbtxwnvplpnwmavfdwx.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6YnR4d252cGxwbndtYXZmZHd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk2MzEsImV4cCI6MjA5NTE0NTYzMX0.P1BlgrtVK3CpRLjcZsZugB-78_HO4GFSUXplCtbbBAY'
  const supa = createClient(url, key)
  const { data, error } = await supa.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await userIdFromRequest(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => null)) as {
    op?: 'put' | 'get'
    entity?: string
    key?: string
    contentType?: string
  } | null
  if (!body?.op) return json({ error: 'bad request' }, 400)

  const bucket = process.env.R2_BUCKET ?? ''
  const s3 = r2Client()

  if (body.op === 'put') {
    const key = objectKeyFor(userId, body.entity ?? 'misc', crypto.randomUUID())
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: body.contentType }),
      { expiresIn: 300 },
    )
    return json({ url, key })
  }

  if (body.op === 'get') {
    if (!body.key || !keyBelongsToUser(body.key, userId)) return json({ error: 'forbidden' }, 403)
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: body.key }), {
      expiresIn: 300,
    })
    return json({ url })
  }

  return json({ error: 'unknown op' }, 400)
}
