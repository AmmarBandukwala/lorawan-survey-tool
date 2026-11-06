import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import { HeatLayer as LeafletHeatLayer } from 'leaflet.heat'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { Bounds, GatewayPin, MapFeature } from '../../shared/types/map'

const gatewayIcon = L.divIcon({
  className: 'gateway-marker',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

function signalColor(rssi?: number | null) {
  if (rssi == null) return '#78877d'
  if (rssi >= -100) return '#62a16c'
  if (rssi >= -115) return '#d9a64a'
  return '#d46d55'
}

function ViewportEvents({
  onChange,
  onMapClick,
}: {
  onChange: (bounds: Bounds) => void
  onMapClick?: (latitude: number, longitude: number) => void
}) {
  const map = useMap()
  const onChangeRef = useRef(onChange)
  const onMapClickRef = useRef(onMapClick)
  onChangeRef.current = onChange
  onMapClickRef.current = onMapClick

  useMapEvents({
    moveend() {
      const bounds = map.getBounds()
      const south = Math.max(-85, bounds.getSouth())
      const north = Math.min(85, bounds.getNorth())
      const west = Math.max(-180, bounds.getWest())
      const east = Math.min(180, bounds.getEast())
      onChangeRef.current({
        west: west < east ? west : -180,
        east: west < east ? east : 180,
        south: south < north ? south : -85,
        north: south < north ? north : 85,
        zoom: map.getZoom(),
      })
    },
    click(event) {
      onMapClickRef.current?.(event.latlng.lat, event.latlng.lng)
    },
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const bounds = map.getBounds()
      onChangeRef.current({
        west: Math.max(-180, bounds.getWest()),
        south: Math.max(-85, bounds.getSouth()),
        east: Math.min(180, bounds.getEast()),
        north: Math.min(85, bounds.getNorth()),
        zoom: map.getZoom(),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [map])

  return null
}

function HeatLayer({ features, enabled }: { features: MapFeature[]; enabled: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!enabled || features.length === 0) return
    const points: [number, number, number][] = features.map((feature) => [
      feature.latitude,
      feature.longitude,
      Math.min(1, 0.3 + Math.log2(Math.max(1, feature.count)) / 8),
    ])
    const layer = new LeafletHeatLayer(points, {
      radius: 30,
      blur: 17,
      minOpacity: 0.38,
      maxZoom: 16,
      gradient: { 0.12: '#d9362b', 0.38: '#f07422', 0.68: '#f5d435', 1: '#208545' },
    }) as unknown as L.Layer
    map.addLayer(layer)
    return () => { map.removeLayer(layer) }
  }, [enabled, features, map])

  return null
}

export function MapView({
  features,
  gateways,
  heatmap,
  pinMode,
  onViewportChange,
  onMapClick,
}: {
  features: MapFeature[]
  gateways: GatewayPin[]
  heatmap: boolean
  pinMode: boolean
  onViewportChange: (bounds: Bounds) => void
  onMapClick: (latitude: number, longitude: number) => void
}) {
  const gatewayById = new Map(gateways.map((gateway) => [gateway.gateway_id, gateway]))
  const connections = features
    .filter((feature) => feature.kind === 'reading' && feature.gateway_ids?.length)
    .slice(0, 120)
    .flatMap((feature) => (feature.gateway_ids ?? []).flatMap((gatewayId) => {
      const gateway = gatewayById.get(gatewayId)
      return gateway ? [{ feature, gateway, gatewayId }] : []
    }))

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={19}
      scrollWheelZoom
      worldCopyJump
      className={pinMode ? 'survey-map is-pinning' : 'survey-map'}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ViewportEvents onChange={onViewportChange} onMapClick={pinMode ? onMapClick : undefined} />
      <HeatLayer features={features} enabled={heatmap} />
      {!heatmap && features.map((feature, index) => {
        const color = signalColor(feature.average_rssi)
        const radius = feature.kind === 'bin' ? Math.min(23, 7 + Math.log2(feature.count) * 2.2) : 6
        return (
          <CircleMarker
            key={feature.kind === 'reading' ? `reading-${feature.id}` : `bin-${feature.latitude}-${feature.longitude}-${index}`}
            center={[feature.latitude, feature.longitude]}
            radius={radius}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.86 }}
          >
            <Popup>
              <div className="map-popup">
                {feature.kind === 'bin' ? (
                  <><strong>{feature.count.toLocaleString()} readings</strong><span>Mean RSSI {feature.average_rssi == null ? 'not reported' : `${numberFormat.format(feature.average_rssi)} dBm`}</span><span>Mean SNR {feature.average_snr == null ? 'not reported' : `${numberFormat.format(feature.average_snr)} dB`}</span></>
                ) : (
                  <><strong>{feature.device_id || feature.dev_eui}</strong><span>{feature.average_rssi == null ? 'RSSI not reported' : `${numberFormat.format(feature.average_rssi)} dBm`} · {feature.average_snr == null ? 'SNR not reported' : `${numberFormat.format(feature.average_snr)} dB`}</span><span>{feature.recorded_at ? new Date(feature.recorded_at).toLocaleString() : ''}</span>{feature.trigger_type && <span>Trigger: {feature.trigger_type}</span>}{feature.battery_voltage != null && <span>Battery: {numberFormat.format(feature.battery_voltage)} V</span>}</>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
      {connections.map(({ feature, gateway, gatewayId }) => (
        <Polyline
          key={`link-${feature.id}-${gatewayId}`}
          positions={[[feature.latitude, feature.longitude], [gateway.latitude, gateway.longitude]]}
          pathOptions={{ color: '#54765f', weight: 1, opacity: 0.32, dashArray: '4 5' }}
        />
      ))}
      {gateways.map((gateway) => (
        <Marker key={gateway.gateway_id} position={[gateway.latitude, gateway.longitude]} icon={gatewayIcon}>
          <Popup><div className="map-popup"><strong>Gateway</strong><span>{gateway.gateway_id}</span>{gateway.eui && <span>EUI {gateway.eui}</span>}</div></Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
