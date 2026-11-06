export type Bounds = {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

export type MapFeature = {
  kind: 'bin' | 'reading'
  latitude: number
  longitude: number
  count: number
  average_rssi?: number | null
  average_snr?: number | null
  id?: number
  device_id?: string
  dev_eui?: string
  recorded_at?: string
  battery_voltage?: number
  temperature_c?: number
  altitude?: number
  trigger_type?: string
  spreading_factor?: number
  gateway_ids?: string[]
}

export type GatewayPin = {
  gateway_id: string
  eui?: string
  latitude: number
  longitude: number
}

export type MapResponse = {
  features: MapFeature[]
  gateways: GatewayPin[]
  total: number
  has_more: boolean
  next_cursor?: number
  next_offset?: number
  aggregated: boolean
  zoom: number
}
