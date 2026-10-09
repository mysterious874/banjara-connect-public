const memoryCache = new Map<string, { value: unknown; expiresAt: number }>()
const pendingStorageWrites = new Map<string, object>()

function readStorage<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number }
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

export function getCached<T>(key: string): T | null {
  const memory = memoryCache.get(key)
  if (memory) {
    if (memory.expiresAt > Date.now()) return memory.value as T
    memoryCache.delete(key)
  }
  const stored = readStorage<T>(key)
  if (stored !== null) memoryCache.set(key, { value: stored, expiresAt: Date.now() + 1000 })
  return stored
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  const expiresAt = Date.now() + ttlMs
  memoryCache.set(key, { value, expiresAt })

  // Keep the hot in-memory cache synchronous, but defer JSON serialization and
  // sessionStorage writes so large feeds/conversations do not block interaction.
  const writeToken = {}
  pendingStorageWrites.set(key, writeToken)
  window.setTimeout(() => {
    if (pendingStorageWrites.get(key) !== writeToken) return
    pendingStorageWrites.delete(key)
    const current = memoryCache.get(key)
    if (!current || current.value !== value || current.expiresAt !== expiresAt) return
    try {
      sessionStorage.setItem(key, JSON.stringify({ value, expiresAt }))
    } catch {
      // Persistent caching is optional; the in-memory cache still works.
    }
  }, 0)
}

export function invalidateCache(key: string): void {
  memoryCache.delete(key)
  pendingStorageWrites.delete(key)
  try { sessionStorage.removeItem(key) } catch { /* cache is optional */ }
}
