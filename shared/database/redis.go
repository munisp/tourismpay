package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

func RedisConfigFromEnv() RedisConfig {
	return RedisConfig{
		Host:     envOr("REDIS_HOST", "localhost"),
		Port:     envOr("REDIS_PORT", "6379"),
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	}
}

func NewRedisClient(cfg RedisConfig) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("[redis] connection failed (will retry): %v", err)
		return client, nil // return client anyway for graceful degradation
	}

	log.Printf("[redis] connected to %s:%s", cfg.Host, cfg.Port)
	return client, nil
}
