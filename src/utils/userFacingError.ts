export function userFacingError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const backendError = 'code' in error || 'details' in error || 'hint' in error || 'status' in error
    if (backendError) {
      if (import.meta.env.DEV) {
        console.error('Backend request failed.', {
          name: 'name' in error ? error.name : undefined,
          code: 'code' in error ? error.code : undefined,
        })
      }
      return fallback
    }
  }
  return error instanceof Error ? error.message : fallback
}
