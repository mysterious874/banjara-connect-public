import { supabase } from './supabase'

const MAX_UPLOAD_ATTEMPTS = 3

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

/**
 * Retry transient mobile-network upload failures without creating duplicate
 * objects. If a response is lost after Storage accepted the file, confirm the
 * object exists before retrying the same unique path.
 */
export async function uploadStorageFile(bucket: string, path: string, file: File) {
  const storage = supabase.storage.from(bucket)
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
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

    if (attempt < MAX_UPLOAD_ATTEMPTS - 1) {
      try {
        const { data, error } = await storage.createSignedUrl(path, 60)
        if (!error && data?.signedUrl) return
      } catch {
        // The upload may not have completed; retry the same unique object path.
      }
      await wait(500 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Upload failed. Check your connection and try again.')
}
