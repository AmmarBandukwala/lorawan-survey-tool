package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

func (s *server) queryGateways(ctx context.Context) ([]gatewayPin, error) {
	rows, err := s.db.Query(ctx, `
		SELECT gateway_id, COALESCE(eui, ''), ST_Y(pin_location), ST_X(pin_location)
		FROM gateways WHERE pin_location IS NOT NULL ORDER BY gateway_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	gateways := make([]gatewayPin, 0)
	for rows.Next() {
		var gateway gatewayPin
		if err := rows.Scan(&gateway.GatewayID, &gateway.EUI, &gateway.Latitude, &gateway.Longitude); err != nil {
			return nil, err
		}
		gateways = append(gateways, gateway)
	}
	return gateways, rows.Err()
}

func (s *server) listGateways(w http.ResponseWriter, r *http.Request) {
	gateways, err := s.queryGateways(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not query gateways")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"gateways": gateways})
}

func (s *server) saveGateway(w http.ResponseWriter, r *http.Request) {
	var input struct {
		GatewayID string  `json:"gateway_id"`
		EUI       string  `json:"eui"`
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid gateway JSON")
		return
	}
	input.GatewayID = strings.TrimSpace(input.GatewayID)
	if input.GatewayID == "" || len(input.GatewayID) > 128 || !validCoordinates(input.Latitude, input.Longitude) {
		writeError(w, http.StatusUnprocessableEntity, "gateway_id and valid coordinates are required")
		return
	}
	_, err := s.db.Exec(r.Context(), `
		INSERT INTO gateways (gateway_id, eui, pin_location)
		VALUES ($1, NULLIF($2, ''), ST_SetSRID(ST_MakePoint($3, $4), 4326))
		ON CONFLICT (gateway_id) DO UPDATE SET
			eui = COALESCE(NULLIF(EXCLUDED.eui, ''), gateways.eui),
			pin_location = EXCLUDED.pin_location`,
		input.GatewayID, strings.TrimSpace(input.EUI), input.Longitude, input.Latitude)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save gateway pin")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"gateway": input})
}
