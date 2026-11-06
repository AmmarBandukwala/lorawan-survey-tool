import { requestJson } from '../../shared/api/request'

export type GatewayPinDraft = {
  gateway_id: string
  eui: string
  latitude: number
  longitude: number
}

export function createGatewayPin(gateway: GatewayPinDraft) {
  return requestJson<{ gateway: GatewayPinDraft }>('/api/v1/gateways', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gateway),
  })
}
