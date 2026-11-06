package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	db *pgxpool.Pool
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("database is not ready: %v", err)
	}

	app := &server{db: pool}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", app.health)
	mux.HandleFunc("POST /api/v1/ttn/webhook", app.ingestTTN)
	mux.HandleFunc("GET /api/v1/map", app.mapData)
	mux.HandleFunc("GET /api/v1/gateways", app.listGateways)
	mux.HandleFunc("POST /api/v1/gateways", app.saveGateway)

	address := ":" + envOr("PORT", "8080")
	log.Printf("LoRaWAN survey API listening on %s", address)
	log.Fatal(http.ListenAndServe(address, withCommonHeaders(mux)))
}
