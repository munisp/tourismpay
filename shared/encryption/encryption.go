package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"os"
)

// EncryptionService provides encryption and decryption capabilities
type EncryptionService struct {
	aesKey     []byte
	rsaPrivKey *rsa.PrivateKey
	rsaPubKey  *rsa.PublicKey
}

// NewEncryptionService creates a new encryption service
func NewEncryptionService() (*EncryptionService, error) {
	aesKey := os.Getenv("ENCRYPTION_AES_KEY")
	if aesKey == "" {
		return nil, errors.New("ENCRYPTION_AES_KEY environment variable not set")
	}

	decodedKey, err := base64.StdEncoding.DecodeString(aesKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decode AES key: %w", err)
	}

	if len(decodedKey) != 32 {
		return nil, errors.New("AES key must be 32 bytes (256 bits)")
	}

	service := &EncryptionService{
		aesKey: decodedKey,
	}

	// Load RSA keys if available
	rsaPrivKeyPEM := os.Getenv("ENCRYPTION_RSA_PRIVATE_KEY")
	if rsaPrivKeyPEM != "" {
		privKey, err := parseRSAPrivateKey(rsaPrivKeyPEM)
		if err != nil {
			return nil, fmt.Errorf("failed to parse RSA private key: %w", err)
		}
		service.rsaPrivKey = privKey
		service.rsaPubKey = &privKey.PublicKey
	}

	return service, nil
}

// EncryptAES encrypts data using AES-256-GCM
func (s *EncryptionService) EncryptAES(plaintext []byte) (string, error) {
	block, err := aes.NewCipher(s.aesKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptAES decrypts AES-256-GCM encrypted data
func (s *EncryptionService) DecryptAES(encryptedData string) ([]byte, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	block, err := aes.NewCipher(s.aesKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// EncryptRSA encrypts data using RSA-OAEP
func (s *EncryptionService) EncryptRSA(plaintext []byte) (string, error) {
	if s.rsaPubKey == nil {
		return "", errors.New("RSA public key not configured")
	}

	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, s.rsaPubKey, plaintext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to encrypt: %w", err)
	}

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptRSA decrypts RSA-OAEP encrypted data
func (s *EncryptionService) DecryptRSA(encryptedData string) ([]byte, error) {
	if s.rsaPrivKey == nil {
		return nil, errors.New("RSA private key not configured")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	plaintext, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, s.rsaPrivKey, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// HashSHA256 creates a SHA-256 hash of the data
func HashSHA256(data []byte) string {
	hash := sha256.Sum256(data)
	return base64.StdEncoding.EncodeToString(hash[:])
}

// GenerateAESKey generates a new 256-bit AES key
func GenerateAESKey() (string, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return "", fmt.Errorf("failed to generate key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key), nil
}

// GenerateRSAKeyPair generates a new RSA key pair
func GenerateRSAKeyPair(bits int) (privateKeyPEM, publicKeyPEM string, err error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate RSA key: %w", err)
	}

	privateKeyBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	privateKeyBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privateKeyBytes,
	}
	privateKeyPEM = string(pem.EncodeToMemory(privateKeyBlock))

	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to marshal public key: %w", err)
	}
	publicKeyBlock := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	}
	publicKeyPEM = string(pem.EncodeToMemory(publicKeyBlock))

	return privateKeyPEM, publicKeyPEM, nil
}

func parseRSAPrivateKey(pemData string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, errors.New("failed to parse PEM block")
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// Try PKCS8 format
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
		var ok bool
		privateKey, ok = key.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("not an RSA private key")
		}
	}

	return privateKey, nil
}

// EncryptPII encrypts personally identifiable information
func (s *EncryptionService) EncryptPII(data map[string]string) (map[string]string, error) {
	encrypted := make(map[string]string)
	for key, value := range data {
		encValue, err := s.EncryptAES([]byte(value))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt field %s: %w", key, err)
		}
		encrypted[key] = encValue
	}
	return encrypted, nil
}

// DecryptPII decrypts personally identifiable information
func (s *EncryptionService) DecryptPII(data map[string]string) (map[string]string, error) {
	decrypted := make(map[string]string)
	for key, value := range data {
		decValue, err := s.DecryptAES(value)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt field %s: %w", key, err)
		}
		decrypted[key] = string(decValue)
	}
	return decrypted, nil
}

// MaskPII masks sensitive data for logging/display
func MaskPII(value string, visibleChars int) string {
	if len(value) <= visibleChars*2 {
		return "****"
	}
	return value[:visibleChars] + "****" + value[len(value)-visibleChars:]
}
