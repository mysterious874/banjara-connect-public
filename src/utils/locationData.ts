export type LocationSuggestion = {
  displayName: string
  city: string
  country: string
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'

function parseAddress(address: Record<string, string | undefined>, fallback: string) {
  const city = address.city || address.town || address.village || address.municipality || address.county || ''
  const country = address.country || ''
  const displayName = [city, address.state, country].filter(Boolean).join(', ') || fallback
  return { displayName, city, country }
}

export async function searchLocationSuggestions(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const value = query.trim()
  if (value.length < 2) return []
  const url = new URL(`${NOMINATIM_BASE_URL}/search`)
  url.searchParams.set('q', value)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('dedupe', '1')
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Location suggestions are temporarily unavailable.')
  const results = await response.json() as Array<{ display_name?: string; address?: Record<string, string | undefined> }>
  return results.map((item) => parseAddress(item.address ?? {}, item.display_name ?? value))
}

export async function fetchCurrentLocation(): Promise<LocationSuggestion> {
  if (!navigator.geolocation) throw new Error('Location access is not supported by this browser.')
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    })
  })
  const url = new URL(`${NOMINATIM_BASE_URL}/reverse`)
  url.searchParams.set('lat', String(position.coords.latitude))
  url.searchParams.set('lon', String(position.coords.longitude))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Could not identify your current location.')
  const result = await response.json() as { display_name?: string; address?: Record<string, string | undefined> }
  return parseAddress(result.address ?? {}, result.display_name ?? 'Current location')
}
