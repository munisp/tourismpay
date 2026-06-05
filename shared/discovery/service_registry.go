package discovery

import (
	"fmt"
	"os"
	"sync"
)

// ServiceInfo holds connection details for a platform service
type ServiceInfo struct {
	Name     string
	Host     string
	Port     int
	BasePath string
}

// URL returns the full base URL for the service
func (s *ServiceInfo) URL() string {
	return fmt.Sprintf("http://%s:%d%s", s.Host, s.Port, s.BasePath)
}

// HealthURL returns the health check URL
func (s *ServiceInfo) HealthURL() string {
	return fmt.Sprintf("http://%s:%d/health", s.Host, s.Port)
}

// Registry holds all known service endpoints
type Registry struct {
	mu       sync.RWMutex
	services map[string]*ServiceInfo
}

// NewRegistry creates a pre-populated service registry from environment
func NewRegistry() *Registry {
	r := &Registry{
		services: make(map[string]*ServiceInfo),
	}
	r.loadDefaults()
	return r
}

// Get returns info for a named service
func (r *Registry) Get(name string) (*ServiceInfo, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Check environment override first: SERVICE_{NAME}_URL
	envKey := fmt.Sprintf("SERVICE_%s_URL", name)
	if url := os.Getenv(envKey); url != "" {
		return &ServiceInfo{Name: name, Host: url, Port: 0, BasePath: ""}, true
	}

	svc, ok := r.services[name]
	return svc, ok
}

// Register adds or updates a service in the registry
func (r *Registry) Register(svc *ServiceInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.services[svc.Name] = svc
}

// All returns all registered services
func (r *Registry) All() []*ServiceInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*ServiceInfo, 0, len(r.services))
	for _, svc := range r.services {
		result = append(result, svc)
	}
	return result
}

func (r *Registry) loadDefaults() {
	defaults := []ServiceInfo{
		{Name: "liveness-service", Host: "liveness-service", Port: 8002, BasePath: "/api/v1/liveness"},
		{Name: "aml-screening-service", Host: "aml-screening-service", Port: 8003, BasePath: "/api/v1/aml"},
		{Name: "kyc-orchestrator", Host: "kyc-orchestrator-service", Port: 8004, BasePath: "/api/v1/kyc"},
		{Name: "risk-scoring-service", Host: "risk-scoring-service", Port: 8005, BasePath: "/api/v1/risk-scoring"},
		{Name: "policy-service", Host: "policy-service", Port: 8010, BasePath: "/api/v1/policies"},
		{Name: "claims-engine", Host: "claims-adjudication-engine", Port: 8011, BasePath: "/api/v1/claims"},
		{Name: "payment-service", Host: "payment-service", Port: 8012, BasePath: "/api/v1/payments"},
		{Name: "actuarial-module", Host: "actuarial-module", Port: 8020, BasePath: "/api/v1/actuarial"},
		{Name: "reinsurance-management", Host: "reinsurance-management", Port: 8021, BasePath: "/api/v1/reinsurance"},
		{Name: "group-life-admin", Host: "group-life-admin", Port: 8022, BasePath: "/api/v1/group-life"},
		{Name: "nmid-integration", Host: "nmid-integration", Port: 8023, BasePath: "/api/v1/nmid"},
		{Name: "pfa-integration", Host: "pfa-integration", Port: 8024, BasePath: "/api/v1/pfa"},
		{Name: "bancassurance", Host: "bancassurance-integration", Port: 8025, BasePath: "/api/v1/bancassurance"},
		{Name: "customer-360", Host: "customer-360-view", Port: 8030, BasePath: "/api/v1/customer-360"},
		{Name: "performance-dashboard", Host: "performance-monitoring-dashboard", Port: 8031, BasePath: "/api/v1/performance"},
		{Name: "ab-testing", Host: "ab-testing-framework", Port: 8032, BasePath: "/api/v1/ab-testing"},
		{Name: "audit-trail", Host: "audit-trail-system", Port: 8040, BasePath: "/api/v1/audit"},
		{Name: "batch-processing", Host: "batch-processing-engine", Port: 8041, BasePath: "/api/v1/batch"},
		{Name: "feedback", Host: "feedback-management", Port: 8042, BasePath: "/api/v1/feedback"},
		{Name: "commission", Host: "agent-commission-management", Port: 8043, BasePath: "/api/v1/commission"},
		{Name: "renewals", Host: "policy-renewal-automation", Port: 8044, BasePath: "/api/v1/renewals"},
		{Name: "gdpr-compliance", Host: "gdpr-compliance", Port: 8050, BasePath: "/api/v1/gdpr"},
		{Name: "ndpr-compliance", Host: "ndpr-compliance", Port: 8051, BasePath: "/api/v1/ndpr"},
		{Name: "agent-mobile", Host: "agent-mobile-app", Port: 8060, BasePath: "/api/v1/agent-app"},
		{Name: "mobile-ios", Host: "native-mobile-ios", Port: 8061, BasePath: "/api/v1/mobile"},
		{Name: "strategic", Host: "strategic-implementations", Port: 8070, BasePath: "/api/v1/strategy"},
		{Name: "enhanced-kyc", Host: "enhanced-kyc-kyb", Port: 8071, BasePath: "/api/v1/enhanced-kyc"},
		{Name: "communication", Host: "communication-service", Port: 8080, BasePath: "/api/v1/communication"},
		{Name: "reconciliation", Host: "reconciliation-engine", Port: 8081, BasePath: "/api/v1/reconciliation"},
		{Name: "fraud-detection", Host: "fraud-detection-go", Port: 8082, BasePath: "/api/v1/fraud"},
	}

	for i := range defaults {
		svc := defaults[i]
		r.services[svc.Name] = &svc
	}
}
