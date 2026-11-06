# LoRaWAN Survey Tool

Authored by Ammar Bandukwala.

Fieldline is a React map for LoRaWAN field tester uplinks, backed by a Go API and PostGIS. The map shows signal readings, gateway pins, gateway-to-reading links, and a heatmap. PostGIS filters by map viewport and returns grid bins at zoom levels 12 and lower; closer views return individual readings in pages.

## Run with Docker Compose

Copy `.env.example` to `.env` and change `POSTGRES_PASSWORD`. Then start the full stack:

```sh
docker compose up --build
```

Open <http://localhost:8080>. The API is also exposed locally at `http://localhost:8081`; Postgres is available on port `5433` by default. Change these host ports in `.env` if they are already in use.

Data is stored in the `postgres_data` volume. The ordered SQL files in `backend/migrations/` run only when Postgres initializes an empty volume; this includes the demo dataset. To intentionally reset all survey data and re-run initialization, use `docker compose down -v`.

## Demo Dataset

Fresh databases are seeded automatically when the stack starts. To load or refresh the dataset in an existing database volume, run:

```sh
docker compose exec -T db psql -U fieldline -d fieldline -v ON_ERROR_STOP=1 < backend/migrations/002_demo_seed.sql
```

The script creates 100,000 recent field-tester uplinks across 20 US cities, 100 gateway pins, and one or two gateway receptions per uplink. Coordinates cluster around each city; RSSI and SNR vary with distance to the nearest gateways. Rerunning it refreshes the same demo frame IDs instead of duplicating them, and replaces their associated receptions. Demo rows use the `fieldline-demo` application ID.

## TTN Uplink Ingestion

Configure a The Things Stack HTTP webhook integration to send uplink events to:

```text
https://<reachable-host>/api/v1/ttn/webhook
```

The API expects the TTN v3 event structure with `end_device_ids`, `uplink_message.decoded_payload.latitude`, `uplink_message.decoded_payload.longitude`, `uplink_message.f_cnt`, and `uplink_message.rx_metadata`. Other event fields are retained in `raw_payload` JSONB. Device coordinates are required for map display. Each reception in `rx_metadata` is stored against its gateway with RSSI, channel RSSI, SNR, timestamps, and EUI. Duplicate frames are upserted by device EUI, session key ID, and frame counter.

The webhook does not require a token or authentication header and has no built-in authentication. Restrict it to a trusted network or protect it with an upstream proxy before exposing it publicly. Use a strong database password; values in `.env.example` are for local development only.

The API does not infer a gateway's physical location from reception metadata. To add a pin, select **Pin gateway**, click its location on the map, and enter the gateway ID. Pinned gateways are connected to readings that report their gateway ID in `rx_metadata`.

## Map API

- `GET /api/v1/map?west=...&south=...&east=...&north=...&zoom=...&limit=...` returns map features for a viewport.
- At zoom `<= 12`, the API groups readings into spatial bins and returns average RSSI/SNR and counts. Use `offset` to page bins.
- Above zoom `12`, it returns individual readings with gateway IDs. Use the `cursor` returned by the API to load the next page.
- `POST /api/v1/gateways` saves or updates a gateway pin. `GET /api/v1/gateways` lists configured pins.
- `GET /healthz` checks API/database connectivity.

The map uses OpenStreetMap tiles, so a network connection is required for map backgrounds. Respect the OpenStreetMap tile usage policy when deploying at scale.

## Frontend Development

The production and recommended path is Docker Compose. For local UI iteration, run the Go API on port `8081`, then:

```sh
npm ci
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8081`.
