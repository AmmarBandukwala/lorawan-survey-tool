import { useEffect, useRef, useState } from 'react'
import { createGatewayPin } from './gatewayApi'

type GatewayPinDialogProps = {
  open: boolean
  coordinates: [number, number] | null
  onClose: () => void
  onSaved: (gatewayId: string) => void
}

export function GatewayPinDialog({ open, coordinates, onClose, onSaved }: GatewayPinDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [gatewayId, setGatewayId] = useState('')
  const [eui, setEui] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      setGatewayId('')
      setEui('')
      setLatitude(coordinates?.[0].toFixed(6) ?? '')
      setLongitude(coordinates?.[1].toFixed(6) ?? '')
      setError('')
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open, coordinates])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      gateway_id: gatewayId.trim(),
      eui: eui.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
    }

    try {
      await createGatewayPin(payload)
      onSaved(payload.gateway_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save gateway pin')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      className="reading-dialog gateway-dialog"
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <form onSubmit={handleSubmit}>
        <div className="dialog-head">
          <div><p className="eyebrow">NETWORK INFRASTRUCTURE</p><h2>Pin a LoRaWAN gateway</h2></div>
          <button className="icon-button dialog-close" type="button" aria-label="Close dialog" title="Close" onClick={onClose}>×</button>
        </div>
        <p className="dialog-description">Pins connect gateway receptions to their field readings on the map.</p>
        <label className="full-field">Gateway ID<input name="gateway_id" type="text" maxLength={128} placeholder="my-wisgate-outdoor-gw" value={gatewayId} onChange={(event) => setGatewayId(event.target.value)} required autoFocus /></label>
        <label className="full-field">Gateway EUI <span>(optional)</span><input name="eui" type="text" maxLength={32} placeholder="AC1F09FFFE010203" value={eui} onChange={(event) => setEui(event.target.value)} /></label>
        <div className="coordinate-row">
          <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} required /></label>
          <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} required /></label>
          <span className="location-button" title="Coordinates selected from map" aria-hidden="true">⌖</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save gateway'} <span aria-hidden="true">↗</span></button>
        </div>
      </form>
    </dialog>
  )
}
