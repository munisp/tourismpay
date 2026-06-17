package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type USSDHandlers struct {
	svc *services.USSDService
}

func NewUSSDHandlers(svc *services.USSDService) *USSDHandlers {
	return &USSDHandlers{svc: svc}
}

// ProcessUSSD handles incoming USSD requests from the telco gateway (Africa's Talking / Twilio)
func (h *USSDHandlers) ProcessUSSD(c *gin.Context) {
	var req services.USSDRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp := h.svc.ProcessRequest(&req)
	c.JSON(http.StatusOK, resp)
}

// ProcessUSSDForm handles Africa's Talking USSD callback format (form-encoded)
func (h *USSDHandlers) ProcessUSSDForm(c *gin.Context) {
	sessionID := c.PostForm("sessionId")
	phoneNumber := c.PostForm("phoneNumber")
	input := c.PostForm("text")
	serviceCode := c.PostForm("serviceCode")

	req := &services.USSDRequest{
		SessionID:   sessionID,
		PhoneNumber: phoneNumber,
		Input:       input,
		ServiceCode: serviceCode,
	}

	resp := h.svc.ProcessRequest(req)

	// Africa's Talking expects plain text with CON or END prefix
	prefix := "CON "
	if resp.EndSession {
		prefix = "END "
	}
	c.String(http.StatusOK, prefix+resp.Message)
}
