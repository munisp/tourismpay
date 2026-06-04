package internal

import (
	"sync"
	"time"
)

type USSDSession struct {
	ID        string
	MSISDN    string
	MenuPath  []string
	Data      map[string]string
	Language  string
	CreatedAt time.Time
	LastInput time.Time
}

type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*USSDSession
	timeout  time.Duration
}

func NewSessionStore(timeout time.Duration) *SessionStore {
	store := &SessionStore{
		sessions: make(map[string]*USSDSession),
		timeout:  timeout,
	}
	go store.cleanup()
	return store
}

func (s *SessionStore) Get(sessionID string) (*USSDSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[sessionID]
	if ok && time.Since(sess.LastInput) > s.timeout {
		return nil, false
	}
	return sess, ok
}

func (s *SessionStore) Create(sessionID, msisdn string) *USSDSession {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := &USSDSession{
		ID: sessionID, MSISDN: msisdn,
		MenuPath: []string{"root"}, Data: make(map[string]string),
		Language: "en", CreatedAt: time.Now(), LastInput: time.Now(),
	}
	s.sessions[sessionID] = sess
	return sess
}

func (s *SessionStore) Update(sessionID string, sess *USSDSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess.LastInput = time.Now()
	s.sessions[sessionID] = sess
}

func (s *SessionStore) Delete(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
}

func (s *SessionStore) cleanup() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		s.mu.Lock()
		for id, sess := range s.sessions {
			if time.Since(sess.LastInput) > s.timeout {
				delete(s.sessions, id)
			}
		}
		s.mu.Unlock()
	}
}
