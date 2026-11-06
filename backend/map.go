package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
)

func (s *server) mapData(w http.ResponseWriter, r *http.Request) {
	bounds, err := parseBounds(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	zoom, err := queryInt(r, "zoom", 2, 0, 22)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	limit, err := queryInt(r, "limit", 500, 1, 1000)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var features []mapFeature
	var hasMore bool
	var nextCursor int64
	var nextOffset int
	aggregated := zoom <= 12

	var total int64
	err = s.db.QueryRow(r.Context(), `
		SELECT count(*) FROM uplinks
		WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
		bounds.west, bounds.south, bounds.east, bounds.north).Scan(&total)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not count map readings")
		return
	}

	if aggregated {
		offset, err := queryInt(r, "offset", 0, 0, 1000000)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		features, hasMore, err = s.queryBins(r.Context(), bounds, zoom, limit, offset)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not query map bins")
			return
		}
		if hasMore {
			nextOffset = offset + len(features)
		}
	} else {
		var cursor *int64
		if raw := r.URL.Query().Get("cursor"); raw != "" {
			value, parseErr := strconv.ParseInt(raw, 10, 64)
			if parseErr != nil || value < 1 {
				writeError(w, http.StatusBadRequest, "cursor must be a positive uplink id")
				return
			}
			cursor = &value
		}
		features, hasMore, err = s.queryReadings(r.Context(), bounds, limit, cursor)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not query map readings")
			return
		}
		if hasMore && len(features) > 0 {
			nextCursor = features[len(features)-1].ID
		}
	}

	gateways, err := s.queryGateways(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not query gateway pins")
		return
	}
	writeJSON(w, http.StatusOK, mapResponse{
		Features: features, Gateways: gateways, Total: total, HasMore: hasMore,
		NextCursor: nextCursor, NextOffset: nextOffset, Aggregated: aggregated, Zoom: zoom,
	})
}

func (s *server) queryBins(ctx context.Context, bounds bounds, zoom, limit, offset int) ([]mapFeature, bool, error) {
	gridSize := 11.25 / math.Pow(2, float64(zoom))
	rows, err := s.db.Query(ctx, `
		WITH visible AS (
			SELECT ST_SnapToGrid(location, $1) AS cell, rssi, snr
			FROM uplinks
			WHERE location && ST_MakeEnvelope($2, $3, $4, $5, 4326)
		), bins AS (
			SELECT cell, count(*)::int AS point_count, avg(rssi) AS average_rssi, avg(snr) AS average_snr
			FROM visible
			GROUP BY cell
		)
		SELECT ST_Y(cell), ST_X(cell), point_count, average_rssi, average_snr
		FROM bins
		ORDER BY point_count DESC, ST_Y(cell), ST_X(cell)
		LIMIT $6 OFFSET $7`,
		gridSize, bounds.west, bounds.south, bounds.east, bounds.north, limit+1, offset)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	features := make([]mapFeature, 0, limit)
	for rows.Next() {
		var feature mapFeature
		feature.Kind = "bin"
		if err := rows.Scan(&feature.Latitude, &feature.Longitude, &feature.Count, &feature.AverageRSSI, &feature.AverageSNR); err != nil {
			return nil, false, err
		}
		features = append(features, feature)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(features) > limit
	if hasMore {
		features = features[:limit]
	}
	return features, hasMore, nil
}

func (s *server) queryReadings(ctx context.Context, bounds bounds, limit int, cursor *int64) ([]mapFeature, bool, error) {
	rows, err := s.db.Query(ctx, `
		SELECT u.id, u.device_id, u.dev_eui, u.received_at, u.latitude, u.longitude, u.rssi, u.snr,
			COALESCE(u.battery_voltage, 0), COALESCE(u.temperature_c, 0), COALESCE(u.altitude, 0),
			u.trigger_type, u.spreading_factor,
			COALESCE((SELECT array_agg(gr.gateway_id ORDER BY gr.gateway_id)
				FROM gateway_receptions gr WHERE gr.uplink_id = u.id), ARRAY[]::text[])
		FROM uplinks u
		WHERE u.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
			AND ($5::bigint IS NULL OR u.id < $5)
		ORDER BY u.id DESC
		LIMIT $6`,
		bounds.west, bounds.south, bounds.east, bounds.north, cursor, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	features := make([]mapFeature, 0, limit)
	for rows.Next() {
		feature := mapFeature{Kind: "reading", Count: 1}
		if err := rows.Scan(&feature.ID, &feature.DeviceID, &feature.DevEUI, &feature.RecordedAt,
			&feature.Latitude, &feature.Longitude, &feature.AverageRSSI, &feature.AverageSNR,
			&feature.BatteryVoltage, &feature.TemperatureC,
			&feature.Altitude, &feature.TriggerType, &feature.SpreadingFactor, &feature.GatewayIDs); err != nil {
			return nil, false, err
		}
		features = append(features, feature)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(features) > limit
	if hasMore {
		features = features[:limit]
	}
	return features, hasMore, nil
}

func parseBounds(r *http.Request) (bounds, error) {
	query := r.URL.Query()
	keys := []string{"west", "south", "east", "north"}
	present := 0
	for _, key := range keys {
		if query.Has(key) {
			present++
		}
	}
	if present == 0 {
		return bounds{west: -180, south: -85, east: 180, north: 85}, nil
	}
	if present != len(keys) {
		return bounds{}, errors.New("west, south, east, and north are all required")
	}
	values := make([]float64, 4)
	for index, key := range keys {
		value, err := strconv.ParseFloat(query.Get(key), 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			return bounds{}, fmt.Errorf("%s must be a finite number", key)
		}
		values[index] = value
	}
	result := bounds{west: values[0], south: values[1], east: values[2], north: values[3]}
	if result.west < -180 || result.east > 180 || result.west >= result.east || result.south < -90 || result.north > 90 || result.south >= result.north {
		return bounds{}, errors.New("map bounds are out of range or inverted")
	}
	return result, nil
}

func queryInt(r *http.Request, key string, fallback, minimum, maximum int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", key, minimum, maximum)
	}
	return value, nil
}

func validCoordinates(latitude, longitude float64) bool {
	return !math.IsNaN(latitude) && !math.IsInf(latitude, 0) &&
		!math.IsNaN(longitude) && !math.IsInf(longitude, 0) &&
		latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}
