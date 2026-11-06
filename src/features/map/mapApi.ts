import { requestJson } from '../../shared/api/request'
import type { Bounds, MapResponse } from '../../shared/types/map'

export type MapPage = { cursor?: number; offset?: number }

export function fetchMap(bounds: Bounds, page: MapPage = {}) {
  const query = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    zoom: String(Math.round(bounds.zoom)),
    limit: '500',
  })
  if (page.cursor) query.set('cursor', String(page.cursor))
  if (page.offset) query.set('offset', String(page.offset))
  return requestJson<MapResponse>(`/api/v1/map?${query}`)
}
