import { useEffect, useState } from 'react'
import { GatewayPinDialog } from '../features/gateways/GatewayPinDialog'
import { MapView } from '../features/map/MapView'
import { useMapData } from '../features/map/useMapData'

const displayNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const displayInteger = new Intl.NumberFormat()

export default function App() {
  const mapData = useMapData()
  const { setStatusMessage } = mapData
  const [heatmap, setHeatmap] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [gatewayDialogOpen, setGatewayDialogOpen] = useState(false)
  const [gatewayCoordinates, setGatewayCoordinates] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!pinMode) return
    const cancelPin = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinMode(false)
        setStatusMessage('Gateway pin placement cancelled')
      }
    }
    window.addEventListener('keydown', cancelPin)
    return () => window.removeEventListener('keydown', cancelPin)
  }, [pinMode, setStatusMessage])

  function beginGatewayPin() {
    setPinMode(true)
    setStatusMessage('Click the map where the gateway is installed')
  }

  function handleMapClick(latitude: number, longitude: number) {
    if (!pinMode) return
    setGatewayCoordinates([latitude, longitude])
    setGatewayDialogOpen(true)
    setPinMode(false)
  }

  function handleGatewaySaved(gatewayId: string) {
    setGatewayDialogOpen(false)
    setStatusMessage(`Gateway ${gatewayId} pinned`)
    mapData.refreshMap()
  }

  const uniqueDevices = new Set(mapData.features.filter((feature) => feature.kind === 'reading').map((feature) => feature.dev_eui)).size
  const signalFeatures = mapData.features.filter((feature) => feature.average_rssi != null)
  const signalCount = signalFeatures.reduce((sum, feature) => sum + feature.count, 0)
  const meanRSSI = signalCount
    ? signalFeatures.reduce((sum, feature) => sum + (feature.average_rssi ?? 0) * feature.count, 0) / signalCount
    : null
  const visibleGatewayIDs = [...new Set(mapData.features.flatMap((feature) => feature.gateway_ids ?? []))]
  const gatewayCount = new Set([...mapData.gateways.map((gateway) => gateway.gateway_id), ...visibleGatewayIDs]).size

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Fieldline home">
          <span className="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span className="brand-name">FIELDLINE<span className="brand-divider">/</span><span className="brand-product">LORAWAN</span></span>
        </a>
        <div className="top-actions">
          <span className="storage-label"><span className={`storage-dot ${mapData.apiError ? 'is-offline' : ''}`}></span>{mapData.apiError ? 'API disconnected' : 'PostGIS connected'}</span>
          <button className="button button-quiet refresh-button" onClick={mapData.refreshMap} type="button" title="Refresh map data">
            <span className="button-symbol" aria-hidden="true">↻</span><span>Refresh</span>
          </button>
          <button className="button button-dark" onClick={beginGatewayPin} type="button">
            <span className="button-symbol" aria-hidden="true">+</span><span>Pin gateway</span>
          </button>
        </div>
      </header>

      <main className="page-shell">
        <section className="page-intro" aria-labelledby="pageTitle">
          <div>
            <p className="eyebrow">FIELD SURVEY <span>/</span> LIVE UPLINKS</p>
            <h1 id="pageTitle">Signal, <em>in context.</em></h1>
            <p className="intro-copy">Explore field tester uplinks, gateway receptions, and signal quality.</p>
          </div>
          <div className="session-control">
            <div className="session-state"><span className={`session-light ${mapData.apiError ? '' : 'is-active'}`}></span><span>{mapData.status}</span></div>
            <button className={`text-button ${pinMode ? 'is-active' : ''}`} onClick={beginGatewayPin} type="button">
              {pinMode ? 'Click map to place pin' : 'Add gateway pin'} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

        <section className="metrics" aria-label="Current map summary">
          <div className="metric"><span className="metric-label">READINGS IN VIEW</span><strong>{displayInteger.format(mapData.total)}</strong></div>
          <div className="metric"><span className="metric-label">DEVICES LOADED</span><strong>{displayInteger.format(uniqueDevices)}</strong></div>
          <div className="metric"><span className="metric-label">MEAN RSSI</span><strong>{meanRSSI == null ? '--' : displayNumber.format(meanRSSI)}<small>{meanRSSI == null ? '' : ' dBm'}</small></strong></div>
          <div className="metric metric-session"><span className="metric-label">PINNED GATEWAYS</span><strong>{displayInteger.format(gatewayCount)}</strong></div>
        </section>

        <div className="workbench">
          <section className="map-column" aria-labelledby="mapTitle">
            <div className="section-heading map-section-heading">
              <div><p className="eyebrow">SPATIAL VIEW</p><h2 id="mapTitle">Uplink coverage</h2></div>
              <div className="map-actions">
                <button className={`mode-button ${heatmap ? 'is-selected' : ''}`} type="button" aria-pressed={heatmap} onClick={() => setHeatmap((value) => !value)}>
                  <span className="heat-icon" aria-hidden="true">◉</span>Heatmap
                </button>
                <button className={`icon-button pin-map-button ${pinMode ? 'is-selected' : ''}`} type="button" title="Click map to pin a gateway" aria-label="Click map to pin a gateway" onClick={beginGatewayPin}>⌖</button>
              </div>
            </div>
            <div className="map-frame"><MapView features={mapData.features} gateways={mapData.gateways} heatmap={heatmap} pinMode={pinMode} onViewportChange={mapData.handleViewportChange} onMapClick={handleMapClick} /></div>
            <div className="map-footer">
              <div className="legend" aria-label="Signal strength legend">
                <span><i className="legend-dot strong"></i>Strong <b>≥ -100 dBm</b></span>
                <span><i className="legend-dot fair"></i>Fair <b>-101 to -115</b></span>
                <span><i className="legend-dot weak"></i>Weak <b>&lt; -115 dBm</b></span>
              </div>
              <span className="map-mode-label">{mapData.loading ? 'Updating…' : mapData.aggregated ? 'Binned view' : 'Individual points'}</span>
            </div>
            {pinMode && <p className="map-hint" role="status">Click the map at the gateway location. Press Escape to cancel.</p>}
          </section>

          <aside className="log-column" aria-labelledby="logTitle">
            <div className="section-heading log-heading">
              <div><p className="eyebrow">FIELD LOG</p><h2 id="logTitle">{mapData.aggregated ? 'Signal bins' : 'Readings'} <span>{displayInteger.format(mapData.features.length)}</span></h2></div>
              <span className="log-sort">{mapData.aggregated ? 'GROUPED BY AREA' : 'LATEST FIRST'}</span>
            </div>
            {mapData.apiError ? (
              <div className="api-error"><span className="error-mark" aria-hidden="true">!</span><p className="empty-title">Map API unavailable</p><p>{mapData.apiError}</p><button className="text-button" type="button" onClick={mapData.refreshMap}>Try again <span aria-hidden="true">↻</span></button></div>
            ) : mapData.features.length === 0 && !mapData.loading ? (
              <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌖</span><p className="empty-title">No uplinks in this view</p><p>Send a decoded field tester uplink to the TTN webhook endpoint, then refresh the map.</p></div>
            ) : (
              <div className="reading-list" aria-live="polite">
                {mapData.features.map((feature, index) => (
                  <div className="reading-item reading-row" key={feature.kind === 'reading' ? `reading-${feature.id}` : `bin-${feature.latitude}-${feature.longitude}-${index}`}>
                    <span className="reading-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="reading-info">
                      {feature.kind === 'bin' ? (
                        <><span className="reading-primary">{displayInteger.format(feature.count)} <small>points</small></span><span className="reading-secondary">Mean RSSI {feature.average_rssi == null ? '—' : `${displayNumber.format(feature.average_rssi)} dBm`} · SNR {feature.average_snr == null ? '—' : `${displayNumber.format(feature.average_snr)} dB`}</span></>
                      ) : (
                        <><span className="reading-primary">{feature.average_rssi == null ? '—' : `${displayNumber.format(feature.average_rssi)} dBm`}<span className="reading-separator">/</span>{feature.average_snr == null ? '—' : `${displayNumber.format(feature.average_snr)} dB`}</span><span className="reading-secondary">{feature.device_id || feature.dev_eui || 'Unknown device'} · SF{feature.spreading_factor || '—'}</span><span className="reading-meta reading-time">{feature.recorded_at ? new Date(feature.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></>
                      )}
                    </span>
                    {feature.kind === 'bin' && <span className={`reading-tone ${feature.average_rssi == null ? 'unknown' : feature.average_rssi >= -100 ? 'strong' : feature.average_rssi >= -115 ? 'fair' : 'weak'}`} aria-hidden="true"></span>}
                  </div>
                ))}
                {mapData.loadingMore && <p className="load-state">Loading the next page…</p>}
                {mapData.hasMore && <button className="load-more" type="button" disabled={mapData.loading} onClick={mapData.loadNextPage}>Load more {mapData.aggregated ? 'bins' : 'readings'} <span aria-hidden="true">↓</span></button>}
                {!mapData.hasMore && mapData.total > 0 && <p className="load-state">Showing {displayInteger.format(mapData.features.length)} of {displayInteger.format(mapData.total)} readings in view</p>}
              </div>
            )}
          </aside>
        </div>
        <p className="attribution-note">Map data © OpenStreetMap contributors · Uplink locations and gateway pins stored in Postgres</p>
      </main>

      <GatewayPinDialog
        open={gatewayDialogOpen}
        coordinates={gatewayCoordinates}
        onClose={() => setGatewayDialogOpen(false)}
        onSaved={handleGatewaySaved}
      />
    </>
  )
}
