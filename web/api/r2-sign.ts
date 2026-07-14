// Vercel serverless function: mints short-lived presigned URLs for Cloudflare R2.
// The browser never holds R2 credentials. Every call must carry a valid Supabase
// JWT; keys are namespaced by user id so one user can't sign for another's objects.
// Built/served by Vercel (not Vite).
//
// NOTE: the key helpers are INLINED here (not imported from ../src/lib/objectKey)
// because Vercel's function bundler doesn't resolve imports that reach outside the
// api/ dir at runtime → ERR_MODULE_NOT_FOUND. The src copy stays the unit-tested
// source of truth for the client; keep these two in sync (they're trivial + stable).

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'

function objectKeyFor(userId: string, entity: string, id: string): string {
  return `${userId}/${entity}/${id}`
}
function keyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(`${userId}/`)
}

// Run on the Edge runtime: this handler is written against the Web Fetch API
// (Request/Response, req.headers.get, req.json) — the Node serverless runtime passes
// (req, res) Node objects instead, which is why req.headers.get crashed with a 500.
export const config = { runtime: 'edge' }

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
  // getUser(jwt) validates the caller's login token; the public anon key suffices.
  // Configuration is deliberately fail-closed so a preview can never silently use
  // the production tenant. A service-role credential is neither needed nor accepted.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
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
    op?: 'put' | 'get' | 'delete'
    entity?: string
    key?: string
    contentType?: string
    contentLength?: number
  } | null
  if (!body?.op) return json({ error: 'bad request' }, 400)

  const bucket = process.env.R2_BUCKET ?? ''
  if (
    !bucket ||
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    return json({ error: 'object storage is not configured' }, 503)
  }
  const s3 = r2Client()

  if (body.op === 'put') {
    const entity = body.entity ?? 'misc'
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(entity)) return json({ error: 'invalid entity' }, 400)
    if (!Number.isSafeInteger(body.contentLength) || (body.contentLength ?? 0) < 1 || (body.contentLength ?? 0) > 50 * 1024 * 1024) {
      return json({ error: 'invalid content length' }, 400)
    }
    const key = objectKeyFor(userId, entity, crypto.randomUUID())
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: body.contentType,
        ContentLength: body.contentLength,
      }),
      { expiresIn: 300 },
    )
    return json({ url, key })
  }

  if (body.op === 'get') {
    if (!body.key || !keyBelongsToUser(body.key, userId)) return json({ error: 'forbidden' }, 403)
    // 1 hour: must exceed the client's signed-URL cache window (usePhotoUrl staleTime ~50m),
    // otherwise a cached URL outlives the signature and the <img> 403s → broken image.
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: body.key }), {
      expiresIn: 3600,
    })
    return json({ url })
  }

  if (body.op === 'delete') {
    if (!body.key || !keyBelongsToUser(body.key, userId)) return json({ error: 'forbidden' }, 403)
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: body.key }))
    return json({ ok: true })
  }

  return json({ error: 'unknown op' }, 400)
}
