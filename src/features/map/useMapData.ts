import { useEffect, useRef, useState } from 'react'
import { fetchMap } from './mapApi'
import type { MapPage } from './mapApi'
import type { Bounds, GatewayPin, MapFeature } from '../../shared/types/map'

export function useMapData() {
  const [features, setFeatures] = useState<MapFeature[]>([])
  const [gateways, setGateways] = useState<GatewayPin[]>([])
  const [viewport, setViewport] = useState<Bounds | null>(null)
  const [total, setTotal] = useState(0)
  const [aggregated, setAggregated] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextPage, setNextPage] = useState<MapPage>({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [apiError, setApiError] = useState('')
  const [status, setStatus] = useState('Waiting for map')
  const viewportTimer = useRef<number | null>(null)
  const requestId = useRef(0)

  useEffect(() => () => {
    if (viewportTimer.current !== null) window.clearTimeout(viewportTimer.current)
  }, [])

  async function loadMap(bounds: Bounds, page: MapPage = {}, append = false) {
    const currentRequest = ++requestId.current
    setLoading(true)
    setLoadingMore(append)
    if (!append) {
      setApiError('')
      setStatus('Loading map data')
    }

    try {
      const data = await fetchMap(bounds, page)
      if (currentRequest !== requestId.current) return
      setFeatures((current) => append ? [...current, ...data.features] : data.features)
      setGateways(data.gateways)
      setTotal(data.total)
      setAggregated(data.aggregated)
      setHasMore(data.has_more)
      setNextPage(data.aggregated ? { offset: data.next_offset } : { cursor: data.next_cursor })
      setApiError('')
      setStatus(data.aggregated ? 'Zoom in for individual readings' : 'Detailed readings loaded')
    } catch (error) {
      if (currentRequest !== requestId.current) return
      setApiError(error instanceof Error ? error.message : 'Could not load map data')
      setStatus('API unavailable')
      if (!append) {
        setFeatures([])
        setGateways([])
        setTotal(0)
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  function handleViewportChange(bounds: Bounds) {
    setViewport(bounds)
    if (viewportTimer.current !== null) window.clearTimeout(viewportTimer.current)
    viewportTimer.current = window.setTimeout(() => { void loadMap(bounds) }, 180)
  }

  function refreshMap() {
    if (viewport) void loadMap(viewport)
  }

  function loadNextPage() {
    if (viewport && hasMore && !loading) void loadMap(viewport, nextPage, true)
  }

  return {
    features,
    gateways,
    total,
    aggregated,
    hasMore,
    loading,
    loadingMore,
    apiError,
    status,
    refreshMap,
    loadNextPage,
    handleViewportChange,
    setStatusMessage: setStatus,
  }
}
