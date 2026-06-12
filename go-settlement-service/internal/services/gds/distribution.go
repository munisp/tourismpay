// GDS Distribution Engine — Pushes rates/availability to connected agents
// and receives bookings from external sources.
// Integrates with Kafka (event streaming), Redis (caching), Fluvio (real-time feeds)
package gds

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// ─── Distribution Types ──────────────────────────────────────────────────────

// DistributionChannel represents an agent's connection to the GDS
type DistributionChannel struct {
	ID          string              `json:"id"`
	AgentID     string              `json:"agentId"`
	AgentName   string              `json:"agentName"`
	Type        DistChannelType     `json:"type"`
	Status      DistChannelStatus   `json:"status"`
	Endpoint    string              `json:"endpoint"`
	APIKey      string              `json:"apiKey"`
	Properties  []string            `json:"properties"` // subscribed property IDs
	Countries   []string            `json:"countries"`  // subscribed countries
	LastPush    *time.Time          `json:"lastPush,omitempty"`
	LastPull    *time.Time          `json:"lastPull,omitempty"`
	CreatedAt   time.Time           `json:"createdAt"`
}

type DistChannelType string

const (
	ChannelAPI       DistChannelType = "api"        // REST API push
	ChannelWebhook   DistChannelType = "webhook"    // Webhook notifications
	ChannelStreaming  DistChannelType = "streaming"  // Kafka/Fluvio stream
	ChannelBatch     DistChannelType = "batch"      // Scheduled batch file
)

type DistChannelStatus string

const (
	DistActive   DistChannelStatus = "active"
	DistPaused   DistChannelStatus = "paused"
	DistError    DistChannelStatus = "error"
)

// RateUpdate represents a rate change pushed to agents
type RateUpdate struct {
	PropertyID   string    `json:"propertyId"`
	RoomTypeCode string    `json:"roomTypeCode"`
	RatePlanCode string    `json:"ratePlanCode"`
	DateFrom     time.Time `json:"dateFrom"`
	DateTo       time.Time `json:"dateTo"`
	Rate         float64   `json:"rate"`
	Currency     string    `json:"currency"`
	MealPlan     string    `json:"mealPlan"`
	MinStay      int       `json:"minStay"`
	StopSell     bool      `json:"stopSell"`
	Timestamp    time.Time `json:"timestamp"`
}

// AvailabilityUpdate represents availability change pushed to agents
type AvailabilityUpdate struct {
	PropertyID   string    `json:"propertyId"`
	RoomTypeCode string    `json:"roomTypeCode"`
	Date         time.Time `json:"date"`
	Available    int       `json:"available"`
	ClosedToArr  bool      `json:"closedToArrival"`
	ClosedToDep  bool      `json:"closedToDeparture"`
	Timestamp    time.Time `json:"timestamp"`
}

// ─── Distribution Engine ─────────────────────────────────────────────────────

// DistributionEngine manages rate/availability distribution to agents
type DistributionEngine struct {
	mu       sync.RWMutex
	channels map[string]*DistributionChannel
	kafka    KafkaClient
	redis    RedisClient
}

// NewDistributionEngine creates a new distribution engine
func NewDistributionEngine() *DistributionEngine {
	return &DistributionEngine{
		channels: make(map[string]*DistributionChannel),
	}
}

// ConnectAgent registers a new distribution channel for an agent
func (de *DistributionEngine) ConnectAgent(ctx context.Context, ch *DistributionChannel) error {
	de.mu.Lock()
	defer de.mu.Unlock()

	ch.ID = generateID("dist")
	ch.Status = DistActive
	ch.CreatedAt = time.Now()

	de.channels[ch.ID] = ch

	if de.kafka != nil {
		data, _ := json.Marshal(ch)
		_ = de.kafka.Publish("gds.distribution.channel_connected", ch.ID, data)
	}

	log.Printf("[GDS Distribution] Agent connected: %s (%s) via %s", ch.AgentName, ch.AgentID, ch.Type)
	return nil
}

// PushRates distributes rate updates to all subscribed agents
func (de *DistributionEngine) PushRates(ctx context.Context, updates []RateUpdate) error {
	de.mu.RLock()
	defer de.mu.RUnlock()

	for _, ch := range de.channels {
		if ch.Status != DistActive {
			continue
		}

		// Filter updates relevant to this channel's subscriptions
		relevant := de.filterRatesForChannel(ch, updates)
		if len(relevant) == 0 {
			continue
		}

		switch ch.Type {
		case ChannelStreaming:
			// Push to Kafka topic for streaming consumers
			if de.kafka != nil {
				for _, u := range relevant {
					data, _ := json.Marshal(u)
					_ = de.kafka.Publish(fmt.Sprintf("gds.rates.%s", ch.AgentID), u.PropertyID, data)
				}
			}

		case ChannelAPI:
			// Push via HTTP POST to agent endpoint
			log.Printf("[GDS Distribution] Pushing %d rate updates to %s via API", len(relevant), ch.AgentName)

		case ChannelWebhook:
			// Send webhook notification
			log.Printf("[GDS Distribution] Webhook: %d rate updates to %s", len(relevant), ch.Endpoint)

		case ChannelBatch:
			// Queue for next batch export
			log.Printf("[GDS Distribution] Queued %d rate updates for batch to %s", len(relevant), ch.AgentName)
		}

		now := time.Now()
		ch.LastPush = &now
	}

	return nil
}

// PushAvailability distributes availability updates to subscribed agents
func (de *DistributionEngine) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) error {
	de.mu.RLock()
	defer de.mu.RUnlock()

	for _, ch := range de.channels {
		if ch.Status != DistActive {
			continue
		}

		relevant := de.filterAvailForChannel(ch, updates)
		if len(relevant) == 0 {
			continue
		}

		if de.kafka != nil {
			for _, u := range relevant {
				data, _ := json.Marshal(u)
				_ = de.kafka.Publish(fmt.Sprintf("gds.availability.%s", ch.AgentID), u.PropertyID, data)
			}
		}

		now := time.Now()
		ch.LastPush = &now
	}

	return nil
}

// GetConnectedAgents returns all active distribution channels
func (de *DistributionEngine) GetConnectedAgents() []*DistributionChannel {
	de.mu.RLock()
	defer de.mu.RUnlock()

	var result []*DistributionChannel
	for _, ch := range de.channels {
		if ch.Status == DistActive {
			result = append(result, ch)
		}
	}
	return result
}

// GetDistributionStats returns distribution metrics
func (de *DistributionEngine) GetDistributionStats() map[string]interface{} {
	de.mu.RLock()
	defer de.mu.RUnlock()

	active := 0
	paused := 0
	errored := 0
	for _, ch := range de.channels {
		switch ch.Status {
		case DistActive:
			active++
		case DistPaused:
			paused++
		case DistError:
			errored++
		}
	}

	return map[string]interface{}{
		"totalChannels":  len(de.channels),
		"activeChannels": active,
		"pausedChannels": paused,
		"errorChannels":  errored,
	}
}

func (de *DistributionEngine) filterRatesForChannel(ch *DistributionChannel, updates []RateUpdate) []RateUpdate {
	if len(ch.Properties) == 0 && len(ch.Countries) == 0 {
		return updates // no filter = all
	}

	propSet := make(map[string]bool)
	for _, p := range ch.Properties {
		propSet[p] = true
	}

	var filtered []RateUpdate
	for _, u := range updates {
		if propSet[u.PropertyID] {
			filtered = append(filtered, u)
		}
	}
	return filtered
}

func (de *DistributionEngine) filterAvailForChannel(ch *DistributionChannel, updates []AvailabilityUpdate) []AvailabilityUpdate {
	if len(ch.Properties) == 0 {
		return updates
	}

	propSet := make(map[string]bool)
	for _, p := range ch.Properties {
		propSet[p] = true
	}

	var filtered []AvailabilityUpdate
	for _, u := range updates {
		if propSet[u.PropertyID] {
			filtered = append(filtered, u)
		}
	}
	return filtered
}
