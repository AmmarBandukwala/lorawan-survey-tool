package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) ingestTTN(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var event ttnEvent
	if err := json.Unmarshal(body, &event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid TTN event JSON")
		return
	}
	if event.EndDeviceIDs.DevEUI == "" || event.EndDeviceIDs.DeviceID == "" || event.Uplink.FCnt == nil {
		writeError(w, http.StatusUnprocessableEntity, "device_id, dev_eui, and uplink_message.f_cnt are required")
		return
	}
	if event.Uplink.Decoded.Latitude == nil || event.Uplink.Decoded.Longitude == nil {
		writeError(w, http.StatusUnprocessableEntity, "decoded_payload latitude and longitude are required")
		return
	}
	latitude, longitude := *event.Uplink.Decoded.Latitude, *event.Uplink.Decoded.Longitude
	if !validCoordinates(latitude, longitude) {
		writeError(w, http.StatusUnprocessableEntity, "decoded coordinates are out of range")
		return
	}

	receivedAt := event.Uplink.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = event.ReceivedAt
	}
	if receivedAt.IsZero() {
		receivedAt = time.Now().UTC()
	}
	payload := event.Uplink.Decoded
	spreadFactor := event.Uplink.Settings.DataRate.LoRa.SpreadingFactor
	if spreadFactor == 0 {
		spreadFactor = 7
	}
	var rssiValues, snrValues []*float64
	for _, metadata := range event.Uplink.Metadata {
		rssiValues = append(rssiValues, metadata.RSSI)
		snrValues = append(snrValues, metadata.SNR)
	}
	averageRSSI, averageSNR := average(rssiValues), average(snrValues)

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start database transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var uplinkID int64
	err = tx.QueryRow(r.Context(), `
		INSERT INTO uplinks (
			device_id, application_id, dev_eui, dev_addr, session_key_id,
			f_port, f_cnt, received_at, latitude, longitude, location,
			altitude, battery_voltage, gps_fix, temperature_c, trigger_type,
			spreading_factor, bandwidth, coding_rate, frequency, rssi, snr, raw_payload
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			ST_SetSRID(ST_MakePoint($10, $9), 4326), $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22::jsonb
		)
		ON CONFLICT (dev_eui, session_key_id, f_cnt) DO UPDATE SET
			device_id = EXCLUDED.device_id,
			application_id = EXCLUDED.application_id,
			dev_addr = EXCLUDED.dev_addr,
			f_port = EXCLUDED.f_port,
			received_at = EXCLUDED.received_at,
			latitude = EXCLUDED.latitude,
			longitude = EXCLUDED.longitude,
			location = EXCLUDED.location,
			altitude = EXCLUDED.altitude,
			battery_voltage = EXCLUDED.battery_voltage,
			gps_fix = EXCLUDED.gps_fix,
			temperature_c = EXCLUDED.temperature_c,
			trigger_type = EXCLUDED.trigger_type,
			spreading_factor = EXCLUDED.spreading_factor,
			bandwidth = EXCLUDED.bandwidth,
			coding_rate = EXCLUDED.coding_rate,
			frequency = EXCLUDED.frequency,
			rssi = EXCLUDED.rssi,
			snr = EXCLUDED.snr,
			raw_payload = EXCLUDED.raw_payload
		RETURNING id`,
		event.EndDeviceIDs.DeviceID,
		event.EndDeviceIDs.ApplicationID.ApplicationID,
		event.EndDeviceIDs.DevEUI,
		event.EndDeviceIDs.DevAddr,
		event.Uplink.SessionKeyID,
		event.Uplink.FPort,
		*event.Uplink.FCnt,
		receivedAt,
		latitude,
		longitude,
		payload.Altitude,
		payload.BatteryVoltage,
		payload.GPSFix,
		payload.TemperatureC,
		payload.TriggerType,
		spreadFactor,
		event.Uplink.Settings.DataRate.LoRa.Bandwidth,
		event.Uplink.Settings.DataRate.LoRa.CodingRate,
		event.Uplink.Settings.Frequency,
		averageRSSI,
		averageSNR,
		string(body),
	).Scan(&uplinkID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save uplink")
		return
	}

	for _, metadata := range event.Uplink.Metadata {
		gatewayID := strings.TrimSpace(metadata.GatewayIDs.GatewayID)
		if gatewayID == "" {
			continue
		}
		var gpsTime any
		if !metadata.GPSTime.IsZero() {
			gpsTime = metadata.GPSTime
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO gateways (gateway_id, eui, last_seen_at)
			VALUES ($1, NULLIF($2, ''), $3)
			ON CONFLICT (gateway_id) DO UPDATE SET
				eui = COALESCE(NULLIF(EXCLUDED.eui, ''), gateways.eui),
				last_seen_at = GREATEST(gateways.last_seen_at, EXCLUDED.last_seen_at)`,
			gatewayID, metadata.GatewayIDs.EUI, receivedAt)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not save gateway metadata")
			return
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO gateway_receptions (
				uplink_id, gateway_id, rssi, channel_rssi, snr, received_at, gps_time, gateway_timestamp
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (uplink_id, gateway_id) DO UPDATE SET
				rssi = EXCLUDED.rssi,
				channel_rssi = EXCLUDED.channel_rssi,
				snr = EXCLUDED.snr,
				received_at = EXCLUDED.received_at,
				gps_time = EXCLUDED.gps_time,
				gateway_timestamp = EXCLUDED.gateway_timestamp`,
			uplinkID, gatewayID, metadata.RSSI, metadata.ChannelRSSI, metadata.SNR,
			receivedAt, gpsTime, metadata.Timestamp)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not save gateway reception")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit uplink")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "uplink_id": uplinkID})
}

func average(values []*float64) *float64 {
	var total float64
	var count int
	for _, value := range values {
		if value == nil {
			continue
		}
		total += *value
		count++
	}
	if count == 0 {
		return nil
	}
	result := total / float64(count)
	return &result
}
