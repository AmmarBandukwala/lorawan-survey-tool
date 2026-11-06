CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS uplinks (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    application_id TEXT NOT NULL DEFAULT '',
    dev_eui TEXT NOT NULL,
    dev_addr TEXT NOT NULL DEFAULT '',
    session_key_id TEXT NOT NULL DEFAULT '',
    f_port INTEGER,
    f_cnt BIGINT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    location geometry(Point, 4326) NOT NULL,
    altitude DOUBLE PRECISION,
    battery_voltage DOUBLE PRECISION,
    gps_fix BOOLEAN,
    temperature_c DOUBLE PRECISION,
    trigger_type TEXT NOT NULL DEFAULT '',
    spreading_factor INTEGER NOT NULL DEFAULT 7,
    bandwidth INTEGER NOT NULL DEFAULT 0,
    coding_rate TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT '',
    rssi DOUBLE PRECISION,
    snr DOUBLE PRECISION,
    raw_payload JSONB NOT NULL,
    CONSTRAINT uplinks_device_session_counter_unique UNIQUE (dev_eui, session_key_id, f_cnt)
);

CREATE INDEX IF NOT EXISTS uplinks_location_gist_idx ON uplinks USING GIST (location);
CREATE INDEX IF NOT EXISTS uplinks_received_at_idx ON uplinks (received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS uplinks_device_idx ON uplinks (dev_eui, id DESC);

CREATE TABLE IF NOT EXISTS gateways (
    gateway_id TEXT PRIMARY KEY,
    eui TEXT,
    pin_location geometry(Point, 4326),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gateways_pin_location_gist_idx
    ON gateways USING GIST (pin_location) WHERE pin_location IS NOT NULL;

CREATE TABLE IF NOT EXISTS gateway_receptions (
    id BIGSERIAL PRIMARY KEY,
    uplink_id BIGINT NOT NULL REFERENCES uplinks(id) ON DELETE CASCADE,
    gateway_id TEXT NOT NULL REFERENCES gateways(gateway_id) ON DELETE CASCADE,
    rssi DOUBLE PRECISION,
    channel_rssi DOUBLE PRECISION,
    snr DOUBLE PRECISION,
    received_at TIMESTAMPTZ NOT NULL,
    gps_time TIMESTAMPTZ,
    gateway_timestamp BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT gateway_receptions_uplink_gateway_unique UNIQUE (uplink_id, gateway_id)
);

CREATE INDEX IF NOT EXISTS gateway_receptions_gateway_idx ON gateway_receptions (gateway_id, uplink_id);
