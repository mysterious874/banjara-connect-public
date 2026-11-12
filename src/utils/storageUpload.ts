import { supabase } from './supabase'

const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024
const TUS_CHUNK_SIZE = 2 * 1024 * 1024
const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000]

function isTransientUploadError(error: unknown) {
  const value = error && typeof error === 'object' ? error as { message?: unknown; statusCode?: unknown; status?: unknown } : {}
  const message = typeof value.message === 'string' ? value.message : String(error ?? '')
  const status = Number(value.statusCode ?? value.status)
  return error instanceof TypeError ||
    [408, 429, 500, 502, 503, 504].includes(status) ||
    /failed to fetch|network|timeout|connection reset|load failed|temporarily unavailable/i.test(message)
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function getResumableEndpoint() {
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL
  if (!configuredUrl) throw new Error('Missing Supabase URL for media upload.')
  const url = new URL(configuredUrl)
  // Supabase recommends the direct Storage hostname for large transfers.
  if (url.hostname.endsWith('.supabase.co')) {
    const projectRef = url.hostname.slice(0, -'.supabase.co'.length)
    return `${url.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
  }
  return new URL('/storage/v1/upload/resumable', url.origin).toString()
}

async function uploadResumable(bucket: string, path: string, file: File) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session?.access_token) throw new Error('Your session expired. Sign in again and retry the upload.')

  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!apiKey) throw new Error('Missing public Supabase client key.')
  const endpoint = getResumableEndpoint()
  const headers = {
    apikey: apiKey,
    authorization: `Bearer ${session.access_token}`,
  }
  const metadata = [
    ['bucketName', bucket],
    ['objectName', path],
    ['contentType', file.type || 'application/octet-stream'],
    ['cacheControl', '3600'],
  ].map(([key, value]) => `${key} ${toBase64(value)}`).join(',')

  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': metadata,
      'x-upsert': 'false',
    },
  })
  if (!createResponse.ok) {
    const detail = await createResponse.text().catch(() => '')
    throw new Error(detail || `Could not start resumable upload (${createResponse.status}).`)
  }

  const location = createResponse.headers.get('Location')
  if (!location) throw new Error('Storage did not return a resumable upload location.')
  const uploadUrl = new URL(location, endpoint).toString()
  let offset = Number(createResponse.headers.get('Upload-Offset') ?? 0)

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + TUS_CHUNK_SIZE, file.size))
    const startingOffset = offset
    let uploaded = false
    let lastError: unknown

    for (const delay of TUS_RETRY_DELAYS) {
      if (delay) await wait(delay)
      try {
        const response = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            ...headers,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
          },
          body: chunk,
        })
        if (response.ok) {
          const nextOffset = Number(response.headers.get('Upload-Offset'))
          offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + chunk.size
          uploaded = true
          break
        }
        const error = new Error(`Resumable upload failed (${response.status}).`)
        if (!isTransientUploadError({ message: error.message, status: response.status })) throw error
        lastError = error
      } catch (error) {
        lastError = error
        if (!isTransientUploadError(error)) throw error
      }

      // A PATCH may have reached Storage even when its response was lost.
      // Ask the TUS server for the authoritative offset before sending again.
      try {
        const head = await fetch(uploadUrl, {
          method: 'HEAD',
          headers: { ...headers, 'Tus-Resumable': '1.0.0' },
        })
        if (head.ok) {
          const serverOffset = Number(head.headers.get('Upload-Offset'))
          if (Number.isFinite(serverOffset) && serverOffset >= 0) offset = serverOffset
          if (offset >= file.size) return
          if (offset > startingOffset) {
            uploaded = true
            break
          }
        } else if (head.status === 404 || head.status === 410) {
          throw new Error('The resumable upload expired. Please select the media and try again.')
        } else if (!isTransientUploadError({ status: head.status })) {
          throw new Error(`Could not resume upload (${head.status}).`)
        }
      } catch (headError) {
        if (!isTransientUploadError(headError)) throw headError
        lastError = headError
      }
    }

    if (!uploaded && offset < file.size) {
      throw lastError instanceof Error ? lastError : new Error('Upload interrupted. Check your connection and try again.')
    }
  }
}

/**
 * Use resumable TUS chunks for media above 6 MB. Keep short mobile videos on
 * the standard Storage upload path: live device logs showed 2–4 MB videos
 * creating TUS sessions but never completing a PATCH transfer on mobile data.
 */
export async function uploadStorageFile(bucket: string, path: string, file: File) {
  if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
    await uploadResumable(bucket, path, file)
    return
  }

  const storage = supabase.storage.from(bucket)
  let lastError: unknown

  const retryDelays = [1000, 2500, 5000, 8000, 12000]
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const { error } = await storage.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
      if (!error) return
      lastError = error
      if (!isTransientUploadError(error)) throw error
    } catch (error) {
      lastError = error
      if (!isTransientUploadError(error)) throw error
    }

    if (attempt < retryDelays.length) {
      // A timed-out mobile request may still have reached Storage. Verify the
      // unique object before retrying, then use a longer backoff for weak data.
      try {
        const { data, error } = await storage.createSignedUrl(path, 60)
        if (!error && data?.signedUrl) return
      } catch {
        // The object is not available yet; retry the same unique object path.
      }
      await wait(retryDelays[attempt])
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Upload failed. Check your connection and try again.')
}
