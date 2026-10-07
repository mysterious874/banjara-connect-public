const memoryCache = new Map<string, { value: unknown; expiresAt: number }>()

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
  try { sessionStorage.setItem(key, JSON.stringify({ value, expiresAt })) } catch { /* cache is optional */ }
}

export function invalidateCache(key: string): void {
  memoryCache.delete(key)
  try { sessionStorage.removeItem(key) } catch { /* cache is optional */ }
}
