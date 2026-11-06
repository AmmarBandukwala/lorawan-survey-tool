package main

import "time"

type ttnEvent struct {
	EndDeviceIDs struct {
		DeviceID      string `json:"device_id"`
		ApplicationID struct {
			ApplicationID string `json:"application_id"`
		} `json:"application_ids"`
		DevEUI  string `json:"dev_eui"`
		DevAddr string `json:"dev_addr"`
	} `json:"end_device_ids"`
	ReceivedAt time.Time `json:"received_at"`
	Uplink     struct {
		SessionKeyID string `json:"session_key_id"`
		FPort        *int   `json:"f_port"`
		FCnt         *int64 `json:"f_cnt"`
		Decoded      struct {
			Latitude       *float64 `json:"latitude"`
			Longitude      *float64 `json:"longitude"`
			Altitude       *float64 `json:"altitude"`
			BatteryVoltage *float64 `json:"battery_voltage"`
			GPSFix         *bool    `json:"gps_fix"`
			TemperatureC   *float64 `json:"temperature_c"`
			TriggerType    string   `json:"trigger_type"`
		} `json:"decoded_payload"`
		Metadata []struct {
			GatewayIDs struct {
				GatewayID string `json:"gateway_id"`
				EUI       string `json:"eui"`
			} `json:"gateway_ids"`
			Time        time.Time `json:"time"`
			Timestamp   int64     `json:"timestamp"`
			RSSI        *float64  `json:"rssi"`
			ChannelRSSI *float64  `json:"channel_rssi"`
			SNR         *float64  `json:"snr"`
			GPSTime     time.Time `json:"gps_time"`
		} `json:"rx_metadata"`
		Settings struct {
			DataRate struct {
				LoRa struct {
					Bandwidth       int    `json:"bandwidth"`
					SpreadingFactor int    `json:"spreading_factor"`
					CodingRate      string `json:"coding_rate"`
				} `json:"lora"`
			} `json:"data_rate"`
			Frequency string `json:"frequency"`
		} `json:"settings"`
		ReceivedAt time.Time `json:"received_at"`
	} `json:"uplink_message"`
}

type reception struct {
	gatewayID   string
	gatewayEUI  string
	rssi        *float64
	channelRSSI *float64
	snr         *float64
	receivedAt  time.Time
	gpsTime     time.Time
	timestamp   int64
}

type mapFeature struct {
	Kind            string    `json:"kind"`
	Latitude        float64   `json:"latitude"`
	Longitude       float64   `json:"longitude"`
	Count           int       `json:"count"`
	AverageRSSI     *float64  `json:"average_rssi"`
	AverageSNR      *float64  `json:"average_snr"`
	ID              int64     `json:"id,omitempty"`
	DeviceID        string    `json:"device_id,omitempty"`
	DevEUI          string    `json:"dev_eui,omitempty"`
	RecordedAt      time.Time `json:"recorded_at,omitempty"`
	BatteryVoltage  *float64  `json:"battery_voltage,omitempty"`
	TemperatureC    *float64  `json:"temperature_c,omitempty"`
	Altitude        *float64  `json:"altitude,omitempty"`
	TriggerType     string    `json:"trigger_type,omitempty"`
	SpreadingFactor int       `json:"spreading_factor,omitempty"`
	GatewayIDs      []string  `json:"gateway_ids,omitempty"`
}

type gatewayPin struct {
	GatewayID string  `json:"gateway_id"`
	EUI       string  `json:"eui,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type mapResponse struct {
	Features   []mapFeature `json:"features"`
	Gateways   []gatewayPin `json:"gateways"`
	Total      int64        `json:"total"`
	HasMore    bool         `json:"has_more"`
	NextCursor int64        `json:"next_cursor,omitempty"`
	NextOffset int          `json:"next_offset,omitempty"`
	Aggregated bool         `json:"aggregated"`
	Zoom       int          `json:"zoom"`
}

type bounds struct {
	west, south, east, north float64
}
