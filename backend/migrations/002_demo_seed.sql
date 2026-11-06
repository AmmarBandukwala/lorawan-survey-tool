BEGIN;

CREATE TEMP TABLE demo_cities (
    city_index INTEGER PRIMARY KEY,
    city_slug TEXT NOT NULL,
    city_name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_cities (city_index, city_slug, city_name, latitude, longitude, altitude) VALUES
    (1, 'seattle', 'Seattle', 47.6062, -122.3321, 56),
    (2, 'portland', 'Portland', 45.5152, -122.6784, 15),
    (3, 'san-francisco', 'San Francisco', 37.7749, -122.4194, 16),
    (4, 'los-angeles', 'Los Angeles', 34.0522, -118.2437, 71),
    (5, 'san-diego', 'San Diego', 32.7157, -117.1611, 20),
    (6, 'phoenix', 'Phoenix', 33.4484, -112.0740, 331),
    (7, 'denver', 'Denver', 39.7392, -104.9903, 1609),
    (8, 'dallas', 'Dallas', 32.7767, -96.7970, 131),
    (9, 'austin', 'Austin', 30.2672, -97.7431, 149),
    (10, 'houston', 'Houston', 29.7604, -95.3698, 13),
    (11, 'chicago', 'Chicago', 41.8781, -87.6298, 181),
    (12, 'minneapolis', 'Minneapolis', 44.9778, -93.2650, 264),
    (13, 'st-louis', 'St. Louis', 38.6270, -90.1994, 142),
    (14, 'nashville', 'Nashville', 36.1627, -86.7816, 182),
    (15, 'atlanta', 'Atlanta', 33.7490, -84.3880, 320),
    (16, 'miami', 'Miami', 25.7617, -80.1918, 2),
    (17, 'washington-dc', 'Washington DC', 38.9072, -77.0369, 7),
    (18, 'new-york', 'New York', 40.7128, -74.0060, 10),
    (19, 'boston', 'Boston', 42.3601, -71.0589, 43),
    (20, 'philadelphia', 'Philadelphia', 39.9526, -75.1652, 12);

CREATE TEMP TABLE demo_gateways ON COMMIT DROP AS
SELECT
    city.city_index,
    'demo-' || city.city_slug || '-gw-' || lpad(offsets.gateway_number::text, 2, '0') AS gateway_id,
    lpad(to_hex(1050000000 + city.city_index * 10 + offsets.gateway_number), 16, '0') AS eui,
    ST_SetSRID(ST_MakePoint(city.longitude + offsets.longitude_offset, city.latitude + offsets.latitude_offset), 4326) AS pin_location
FROM demo_cities AS city
CROSS JOIN (VALUES
    (1, -0.035::double precision, -0.035::double precision),
    (2, -0.035::double precision,  0.035::double precision),
    (3,  0.035::double precision, -0.035::double precision),
    (4,  0.035::double precision,  0.035::double precision),
    (5,  0.000::double precision,  0.000::double precision)
) AS offsets(gateway_number, latitude_offset, longitude_offset);

CREATE INDEX demo_gateways_location_idx ON demo_gateways USING GIST (pin_location);
ANALYZE demo_gateways;

INSERT INTO gateways (gateway_id, eui, pin_location, first_seen_at, last_seen_at)
SELECT gateway_id, eui, pin_location, now() - interval '30 days', now()
FROM demo_gateways
ON CONFLICT (gateway_id) DO UPDATE SET
    eui = EXCLUDED.eui,
    pin_location = EXCLUDED.pin_location,
    last_seen_at = EXCLUDED.last_seen_at;

CREATE TEMP TABLE demo_samples ON COMMIT DROP AS
WITH random_points AS MATERIALIZED (
    SELECT
        series.seq,
        city.city_index,
        city.city_name,
        city.latitude AS city_latitude,
        city.longitude AS city_longitude,
        city.altitude AS city_altitude,
        ((series.seq - 1) % 100 + 1)::integer AS device_number,
        ((series.seq - 1) / 100 + 1)::integer AS frame_count,
        random() AS latitude_random_a,
        random() AS latitude_random_b,
        random() AS longitude_random_a,
        random() AS longitude_random_b
    FROM generate_series(1, 100000) AS series(seq)
    JOIN demo_cities AS city ON city.city_index = ((series.seq - 1) / 5000 + 1)::integer
), coordinates AS (
    SELECT
        random_points.*,
        city_latitude + sqrt(-2 * ln(greatest(latitude_random_a, 0.000001)))
            * cos(2 * pi() * latitude_random_b) * 0.025 AS latitude,
        city_longitude + sqrt(-2 * ln(greatest(longitude_random_a, 0.000001)))
            * cos(2 * pi() * longitude_random_b) * 0.025
            / greatest(cos(radians(city_latitude)), 0.2) AS longitude
    FROM random_points
)
SELECT
    seq,
    city_index,
    city_name,
    'glamos-field-tester-demo-' || lpad(device_number::text, 3, '0') AS device_id,
    'fieldline-demo' AS application_id,
    '70B3D57ED000' || lpad(to_hex(device_number), 4, '0') AS dev_eui,
    lpad(to_hex(16777216 + device_number), 8, '0') AS dev_addr,
    'demo-session-v1-' || lpad(device_number::text, 3, '0') AS session_key_id,
    frame_count AS f_cnt,
    1 AS f_port,
    now() - random() * interval '30 days' AS received_at,
    latitude,
    longitude,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS location,
    city_altitude + random() * 25 AS altitude,
    round((3.45 + random() * 0.7)::numeric, 2)::double precision AS battery_voltage,
    TRUE AS gps_fix,
    round((8 + random() * 26)::numeric, 1)::double precision AS temperature_c,
    CASE floor(random() * 10)::integer
        WHEN 0 THEN 'button_press'
        WHEN 1 THEN 'motion'
        WHEN 2 THEN 'alarm'
        ELSE 'periodic'
    END AS trigger_type,
    (ARRAY[7, 7, 7, 8, 8, 9, 10, 11, 12])[(floor(random() * 9)::integer + 1)] AS spreading_factor,
    125000 AS bandwidth,
    '4/5'::text AS coding_rate,
    (902300000 + floor(random() * 64)::bigint * 200000)::text AS frequency
FROM coordinates;

CREATE TEMP TABLE demo_receptions ON COMMIT DROP AS
WITH nearest_gateways AS (
    SELECT
        sample.seq,
        sample.received_at AS uplink_received_at,
        gateway.gateway_id,
        gateway.eui,
        ST_Distance(sample.location::geography, gateway.pin_location::geography) AS distance_meters,
        row_number() OVER (PARTITION BY sample.seq ORDER BY sample.location <-> gateway.pin_location) AS reception_rank
    FROM demo_samples AS sample
    CROSS JOIN LATERAL (
        SELECT candidate.gateway_id, candidate.eui, candidate.pin_location
        FROM demo_gateways AS candidate
        WHERE candidate.city_index = sample.city_index
        ORDER BY sample.location <-> candidate.pin_location
        LIMIT 2
    ) AS gateway
), reception_metrics AS (
    SELECT
        nearest_gateways.*,
        GREATEST(-125.0, LEAST(-57.0,
            -57.0 - 20.0 * ln(greatest(distance_meters, 10.0) / 10.0) / ln(10.0) - random() * 12.0
        )) AS rssi,
        GREATEST(-20.0, LEAST(13.0,
            14.0 - 18.0 * ln(greatest(distance_meters, 20.0) / 100.0) / ln(10.0) - random() * 10.0
        )) AS snr
    FROM nearest_gateways
)
SELECT
    seq,
    gateway_id,
    eui,
    rssi,
    snr,
    reception_rank,
    reception_rank = 1 OR random() < 0.45 AS include_reception,
    uplink_received_at - random() * interval '200 milliseconds' AS received_at,
    uplink_received_at - random() * interval '200 milliseconds' AS gps_time,
    floor(random() * 2147483647)::bigint AS gateway_timestamp
FROM reception_metrics;

CREATE TEMP TABLE demo_signal_summary ON COMMIT DROP AS
SELECT
    seq AS sample_seq,
    avg(rssi) AS average_rssi,
    avg(snr) AS average_snr,
    jsonb_agg(jsonb_build_object(
        'gateway_ids', jsonb_build_object('gateway_id', gateway_id, 'eui', eui),
        'time', received_at,
        'timestamp', gateway_timestamp,
        'rssi', round(rssi::numeric, 1),
        'channel_rssi', round(rssi::numeric, 1),
        'snr', round(snr::numeric, 1),
        'gps_time', gps_time
    ) ORDER BY reception_rank) AS rx_metadata
FROM demo_receptions
WHERE include_reception
GROUP BY seq;

INSERT INTO uplinks (
    device_id, application_id, dev_eui, dev_addr, session_key_id,
    f_port, f_cnt, received_at, latitude, longitude, location,
    altitude, battery_voltage, gps_fix, temperature_c, trigger_type,
    spreading_factor, bandwidth, coding_rate, frequency, rssi, snr, raw_payload
)
SELECT
    sample.device_id,
    sample.application_id,
    sample.dev_eui,
    sample.dev_addr,
    sample.session_key_id,
    sample.f_port,
    sample.f_cnt,
    sample.received_at,
    sample.latitude,
    sample.longitude,
    sample.location,
    sample.altitude,
    sample.battery_voltage,
    sample.gps_fix,
    sample.temperature_c,
    sample.trigger_type,
    sample.spreading_factor,
    sample.bandwidth,
    sample.coding_rate,
    sample.frequency,
    summary.average_rssi,
    summary.average_snr,
    jsonb_build_object(
        'end_device_ids', jsonb_build_object(
            'device_id', sample.device_id,
            'application_ids', jsonb_build_object('application_id', sample.application_id),
            'dev_eui', sample.dev_eui,
            'dev_addr', sample.dev_addr
        ),
        'received_at', sample.received_at,
        'uplink_message', jsonb_build_object(
            'session_key_id', sample.session_key_id,
            'f_port', sample.f_port,
            'f_cnt', sample.f_cnt,
            'decoded_payload', jsonb_build_object(
                'latitude', sample.latitude,
                'longitude', sample.longitude,
                'altitude', sample.altitude,
                'battery_voltage', sample.battery_voltage,
                'gps_fix', sample.gps_fix,
                'temperature_c', sample.temperature_c,
                'trigger_type', sample.trigger_type
            ),
            'rx_metadata', summary.rx_metadata,
            'settings', jsonb_build_object(
                'data_rate', jsonb_build_object('lora', jsonb_build_object(
                    'bandwidth', sample.bandwidth,
                    'spreading_factor', sample.spreading_factor,
                    'coding_rate', sample.coding_rate
                )),
                'frequency', sample.frequency
            ),
            'received_at', sample.received_at
        )
    )
FROM demo_samples AS sample
JOIN demo_signal_summary AS summary ON summary.sample_seq = sample.seq
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
    raw_payload = EXCLUDED.raw_payload;

DELETE FROM gateway_receptions AS reception
USING uplinks AS uplink
WHERE reception.uplink_id = uplink.id
  AND uplink.application_id = 'fieldline-demo';

INSERT INTO gateway_receptions (
    uplink_id, gateway_id, rssi, channel_rssi, snr, received_at, gps_time, gateway_timestamp
)
SELECT
    uplink.id,
    reception.gateway_id,
    reception.rssi,
    reception.rssi,
    reception.snr,
    reception.received_at,
    reception.gps_time,
    reception.gateway_timestamp
FROM demo_receptions AS reception
JOIN demo_samples AS sample ON sample.seq = reception.seq
JOIN uplinks AS uplink
    ON uplink.dev_eui = sample.dev_eui
    AND uplink.session_key_id = sample.session_key_id
    AND uplink.f_cnt = sample.f_cnt
WHERE reception.include_reception
ON CONFLICT (uplink_id, gateway_id) DO UPDATE SET
    rssi = EXCLUDED.rssi,
    channel_rssi = EXCLUDED.channel_rssi,
    snr = EXCLUDED.snr,
    received_at = EXCLUDED.received_at,
    gps_time = EXCLUDED.gps_time,
    gateway_timestamp = EXCLUDED.gateway_timestamp;

ANALYZE uplinks;
ANALYZE gateway_receptions;

SELECT 'demo uplinks' AS dataset, count(*) AS records
FROM uplinks
WHERE application_id = 'fieldline-demo'
UNION ALL
SELECT 'demo gateways', count(*)
FROM gateways
WHERE gateway_id LIKE 'demo-%';

COMMIT;
