"""
WhatsApp Bot — Africa GDS Low-Tech Onboarding
Enables establishments to register, manage listings, and handle bookings
via WhatsApp conversational interface with photo upload support.

Integrates with: WhatsApp Business API (Cloud API), Twilio, Africa's Talking
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gds-whatsapp-bot")

app = FastAPI(title="Africa GDS WhatsApp Bot", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Models ───────────────────────────────────────────────────────
class ConversationState(str, Enum):
    IDLE = "idle"
    ONBOARDING_START = "onboarding_start"
    ONBOARDING_TYPE = "onboarding_type"
    ONBOARDING_NAME = "onboarding_name"
    ONBOARDING_LOCATION = "onboarding_location"
    ONBOARDING_ROOMS = "onboarding_rooms"
    ONBOARDING_RATE = "onboarding_rate"
    ONBOARDING_PHOTOS = "onboarding_photos"
    ONBOARDING_CONFIRM = "onboarding_confirm"
    MANAGING_BOOKINGS = "managing_bookings"
    UPDATING_RATES = "updating_rates"
    UPDATING_AVAILABILITY = "updating_availability"


class Conversation:
    def __init__(self, phone: str):
        self.phone = phone
        self.state = ConversationState.IDLE
        self.data: dict = {}
        self.photos: list = []
        self.language = "en"
        self.establishment_id: Optional[str] = None
        self.last_activity = datetime.utcnow()


class Establishment(BaseModel):
    id: str
    name: str
    phone: str
    type: str
    location: str
    country: str
    rooms: int
    base_rate: float
    currency: str
    photos: list = []
    amenities: list = []
    tier: str = "whatsapp"
    language: str = "en"
    status: str = "active"
    created_at: str = ""
    onboarded_by: str = "whatsapp"
    completeness_score: float = 0.0


class WebhookMessage(BaseModel):
    from_number: str = ""
    message_type: str = "text"  # text, image, location, interactive
    text: Optional[str] = None
    media_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    button_id: Optional[str] = None


# ─── In-memory Store ──────────────────────────────────────────────
conversations: dict[str, Conversation] = {}
establishments: dict[str, Establishment] = {}

# ─── Message Templates (multilingual) ────────────────────────────
MESSAGES = {
    "welcome": {
        "en": "🌍 *Welcome to Africa GDS*\n\nI can help you list your property on Africa's largest tourism distribution network.\n\n*What would you like to do?*\n\n1️⃣ Register a new property\n2️⃣ Manage bookings\n3️⃣ Update rates & availability\n4️⃣ View earnings\n5️⃣ Get help\n\nReply with a number or type 'menu' anytime.",
        "fr": "🌍 *Bienvenue sur Africa GDS*\n\nJe peux vous aider à inscrire votre propriété.\n\n1️⃣ Enregistrer une propriété\n2️⃣ Gérer les réservations\n3️⃣ Mettre à jour tarifs\n4️⃣ Voir les gains\n5️⃣ Aide",
        "sw": "🌍 *Karibu Africa GDS*\n\nNinaweza kukusaidia kuorodhesha mali yako.\n\n1️⃣ Sajili mali mpya\n2️⃣ Simamia nafasi\n3️⃣ Sasisha bei\n4️⃣ Angalia mapato\n5️⃣ Msaada",
    },
    "onboarding_type": {
        "en": "🏨 *What type of property do you have?*\n\n1️⃣ Hotel\n2️⃣ Lodge / Safari Camp\n3️⃣ Guesthouse / B&B\n4️⃣ Hostel / Backpackers\n5️⃣ Apartment / Villa\n6️⃣ Eco-Lodge / Tented Camp\n\nReply with a number.",
        "fr": "🏨 *Quel type de propriété ?*\n\n1️⃣ Hôtel\n2️⃣ Lodge / Camp Safari\n3️⃣ Maison d'hôtes\n4️⃣ Auberge\n5️⃣ Appartement\n6️⃣ Éco-lodge",
    },
    "onboarding_name": {
        "en": "✏️ *What is the name of your property?*\n\nJust type the name (e.g., 'Serengeti Sunset Lodge')",
    },
    "onboarding_location": {
        "en": "📍 *Where is your property located?*\n\nYou can:\n• Type the city/town name\n• Send your location pin 📌\n• Type address (e.g., 'Nairobi, Kenya')",
    },
    "onboarding_rooms": {
        "en": "🛏️ *How many rooms do you have available?*\n\nJust type the number (e.g., '12')",
    },
    "onboarding_rate": {
        "en": "💰 *What is your standard rate per night?*\n\nType the amount in your local currency (e.g., '5000' for KES 5000)\n\nI'll auto-detect your currency from your phone number.",
    },
    "onboarding_photos": {
        "en": "📸 *Send photos of your property*\n\nPlease share 3-5 photos:\n• Exterior / entrance\n• Best room\n• Dining area / common space\n• Any unique features\n\nSend photos now, then type 'done' when finished.\n(You can skip with 'skip' and add photos later)",
    },
    "onboarding_confirm": {
        "en": "✅ *Please confirm your listing:*\n\n🏨 *{name}*\nType: {type}\n📍 {location}\n🛏️ {rooms} rooms\n💰 {rate} {currency}/night\n📸 {photos} photos\n\n*Is this correct?*\n1️⃣ Yes, register my property\n2️⃣ No, start over",
    },
    "onboarding_success": {
        "en": "🎉 *Congratulations!*\n\nYour property has been registered on Africa GDS!\n\n*Property ID:* {id}\n*Tier:* WhatsApp (Tier 2)\n\n*What happens next:*\n• You'll receive booking requests here on WhatsApp\n• Reply YES/NO to accept or decline\n• Guests get SMS confirmation\n• Payouts via Mobile Money weekly\n\n💡 *Tip:* Send more photos to improve your listing score ({score}%)\n\nType 'menu' for options.",
    },
    "booking_received": {
        "en": "🔔 *New Booking Request!*\n\n👤 {guest_name}\n📅 Check-in: {check_in}\n📅 Check-out: {check_out}\n🛏️ {rooms} room(s)\n💰 Total: {total}\n\nReply:\n✅ *YES* to confirm\n❌ *NO* to decline",
    },
    "no_property": {
        "en": "You don't have a registered property yet.\n\nType '1' to register one now!",
    },
    "earnings_summary": {
        "en": "💰 *Earnings Summary*\n\n📅 This month: {monthly}\n📅 Last month: {last_month}\n💳 Pending payout: {pending}\n📊 Bookings this month: {bookings}\n📈 Occupancy rate: {occupancy}%\n\n*Next payout:* {payout_date}\n*Via:* Mobile Money ({phone})",
    },
}

PROPERTY_TYPES = {
    "1": "hotel", "2": "lodge", "3": "guesthouse",
    "4": "hostel", "5": "apartment", "6": "eco_lodge",
}

# ─── Conversation Logic ───────────────────────────────────────────
def get_or_create_conversation(phone: str) -> Conversation:
    if phone not in conversations:
        conversations[phone] = Conversation(phone)
        # Check if they have an existing establishment
        for est in establishments.values():
            if est.phone == phone:
                conversations[phone].establishment_id = est.id
                break
    conversations[phone].last_activity = datetime.utcnow()
    return conversations[phone]


def get_message(key: str, lang: str = "en", **kwargs) -> str:
    msgs = MESSAGES.get(key, {})
    template = msgs.get(lang, msgs.get("en", ""))
    if kwargs:
        try:
            return template.format(**kwargs)
        except (KeyError, IndexError):
            return template
    return template


def detect_currency(phone: str) -> str:
    if phone.startswith("+254"): return "KES"
    if phone.startswith("+255"): return "TZS"
    if phone.startswith("+234"): return "NGN"
    if phone.startswith("+233"): return "GHS"
    if phone.startswith("+27"): return "ZAR"
    if phone.startswith("+250"): return "RWF"
    if phone.startswith("+256"): return "UGX"
    if phone.startswith("+251"): return "ETB"
    return "USD"


def detect_country(phone: str) -> str:
    if phone.startswith("+254"): return "KE"
    if phone.startswith("+255"): return "TZ"
    if phone.startswith("+234"): return "NG"
    if phone.startswith("+233"): return "GH"
    if phone.startswith("+27"): return "ZA"
    if phone.startswith("+250"): return "RW"
    if phone.startswith("+256"): return "UG"
    if phone.startswith("+251"): return "ET"
    return "XX"


def calculate_completeness(est: Establishment) -> float:
    score = 0.0
    if est.name: score += 15
    if est.type: score += 10
    if est.location: score += 15
    if est.rooms > 0: score += 10
    if est.base_rate > 0: score += 15
    if len(est.photos) >= 3: score += 20
    elif len(est.photos) >= 1: score += 10
    if len(est.amenities) >= 5: score += 15
    elif len(est.amenities) >= 1: score += 7
    return min(score, 100.0)


def process_message(conv: Conversation, msg: WebhookMessage) -> str:
    text = (msg.text or "").strip().lower()

    # Global commands
    if text in ("menu", "home", "start", "hi", "hello"):
        conv.state = ConversationState.IDLE
        return get_message("welcome", conv.language)

    # State machine
    if conv.state == ConversationState.IDLE:
        return handle_idle(conv, text)
    elif conv.state == ConversationState.ONBOARDING_TYPE:
        return handle_onboarding_type(conv, text)
    elif conv.state == ConversationState.ONBOARDING_NAME:
        return handle_onboarding_name(conv, msg.text or "")
    elif conv.state == ConversationState.ONBOARDING_LOCATION:
        return handle_onboarding_location(conv, msg)
    elif conv.state == ConversationState.ONBOARDING_ROOMS:
        return handle_onboarding_rooms(conv, text)
    elif conv.state == ConversationState.ONBOARDING_RATE:
        return handle_onboarding_rate(conv, text)
    elif conv.state == ConversationState.ONBOARDING_PHOTOS:
        return handle_onboarding_photos(conv, msg)
    elif conv.state == ConversationState.ONBOARDING_CONFIRM:
        return handle_onboarding_confirm(conv, text)
    elif conv.state == ConversationState.MANAGING_BOOKINGS:
        return handle_manage_bookings(conv, text)

    return get_message("welcome", conv.language)


def handle_idle(conv: Conversation, text: str) -> str:
    if text == "1":
        conv.state = ConversationState.ONBOARDING_TYPE
        return get_message("onboarding_type", conv.language)
    elif text == "2":
        if not conv.establishment_id:
            return get_message("no_property", conv.language)
        conv.state = ConversationState.MANAGING_BOOKINGS
        return "📋 *Your Bookings*\n\nNo pending bookings right now.\nYou'll be notified here when guests book."
    elif text == "3":
        if not conv.establishment_id:
            return get_message("no_property", conv.language)
        return "💰 *Current Rate:* {} {}/night\n\nType new rate to update (e.g., '7500')".format(
            establishments[conv.establishment_id].base_rate,
            establishments[conv.establishment_id].currency,
        )
    elif text == "4":
        return get_message("earnings_summary", conv.language,
                          monthly="KES 67,500", last_month="KES 52,300",
                          pending="KES 18,200", bookings="14",
                          occupancy="72", payout_date="Friday",
                          phone=conv.phone)
    elif text == "5":
        return ("📞 *Need Help?*\n\n"
                "• Type 'agent' to request a field visit\n"
                "• Call: +254-800-GDS-HELP\n"
                "• Email: support@africagds.com\n\n"
                "💡 *Quick Tips:*\n"
                "• Send photos to improve your listing\n"
                "• Update rates before peak season\n"
                "• Reply quickly to booking requests for better ranking")
    return get_message("welcome", conv.language)


def handle_onboarding_type(conv: Conversation, text: str) -> str:
    if text in PROPERTY_TYPES:
        conv.data["type"] = PROPERTY_TYPES[text]
        conv.state = ConversationState.ONBOARDING_NAME
        return get_message("onboarding_name", conv.language)
    return get_message("onboarding_type", conv.language)


def handle_onboarding_name(conv: Conversation, text: str) -> str:
    if not text.strip():
        return get_message("onboarding_name", conv.language)
    conv.data["name"] = text.strip()
    conv.state = ConversationState.ONBOARDING_LOCATION
    return get_message("onboarding_location", conv.language)


def handle_onboarding_location(conv: Conversation, msg: WebhookMessage) -> str:
    if msg.latitude and msg.longitude:
        conv.data["location"] = f"{msg.latitude},{msg.longitude}"
    elif msg.text:
        conv.data["location"] = msg.text.strip()
    else:
        return get_message("onboarding_location", conv.language)
    conv.state = ConversationState.ONBOARDING_ROOMS
    return get_message("onboarding_rooms", conv.language)


def handle_onboarding_rooms(conv: Conversation, text: str) -> str:
    try:
        rooms = int(text)
        if rooms < 1 or rooms > 9999:
            raise ValueError
        conv.data["rooms"] = rooms
        conv.state = ConversationState.ONBOARDING_RATE
        return get_message("onboarding_rate", conv.language)
    except (ValueError, TypeError):
        return "Please enter a valid number of rooms (e.g., '12')"


def handle_onboarding_rate(conv: Conversation, text: str) -> str:
    try:
        rate = float(text.replace(",", ""))
        if rate <= 0:
            raise ValueError
        conv.data["rate"] = rate
        conv.data["currency"] = detect_currency(conv.phone)
        conv.state = ConversationState.ONBOARDING_PHOTOS
        return get_message("onboarding_photos", conv.language)
    except (ValueError, TypeError):
        return "Please enter a valid rate (e.g., '5000')"


def handle_onboarding_photos(conv: Conversation, msg: WebhookMessage) -> str:
    if msg.message_type == "image" and msg.media_url:
        conv.photos.append(msg.media_url)
        count = len(conv.photos)
        if count < 5:
            return f"📸 Photo {count} received! Send more or type 'done'"
        else:
            conv.state = ConversationState.ONBOARDING_CONFIRM
            return build_confirmation(conv)

    text = (msg.text or "").strip().lower()
    if text in ("done", "skip", "next"):
        conv.state = ConversationState.ONBOARDING_CONFIRM
        return build_confirmation(conv)

    return get_message("onboarding_photos", conv.language)


def build_confirmation(conv: Conversation) -> str:
    return get_message("onboarding_confirm", conv.language,
                      name=conv.data.get("name", ""),
                      type=conv.data.get("type", ""),
                      location=conv.data.get("location", ""),
                      rooms=conv.data.get("rooms", 0),
                      rate=conv.data.get("rate", 0),
                      currency=conv.data.get("currency", "USD"),
                      photos=len(conv.photos))


def handle_onboarding_confirm(conv: Conversation, text: str) -> str:
    if text in ("1", "yes", "y", "confirm"):
        # Create establishment
        est_id = f"EST-{uuid.uuid4().hex[:8].upper()}"
        est = Establishment(
            id=est_id,
            name=conv.data.get("name", ""),
            phone=conv.phone,
            type=conv.data.get("type", ""),
            location=conv.data.get("location", ""),
            country=detect_country(conv.phone),
            rooms=conv.data.get("rooms", 0),
            base_rate=conv.data.get("rate", 0),
            currency=conv.data.get("currency", "USD"),
            photos=conv.photos,
            tier="whatsapp",
            language=conv.language,
            status="active",
            created_at=datetime.utcnow().isoformat(),
            onboarded_by="whatsapp",
        )
        est.completeness_score = calculate_completeness(est)
        establishments[est_id] = est
        conv.establishment_id = est_id
        conv.state = ConversationState.IDLE
        conv.data = {}
        conv.photos = []

        return get_message("onboarding_success", conv.language,
                          id=est_id, score=f"{est.completeness_score:.0f}")
    elif text in ("2", "no", "n"):
        conv.state = ConversationState.ONBOARDING_TYPE
        conv.data = {}
        conv.photos = []
        return "Let's start over.\n\n" + get_message("onboarding_type", conv.language)
    return "Reply 1 for Yes or 2 for No"


def handle_manage_bookings(conv: Conversation, text: str) -> str:
    if text in ("yes", "y", "confirm", "accept"):
        return "✅ Booking confirmed! Guest has been notified."
    elif text in ("no", "n", "decline", "reject"):
        return "❌ Booking declined. Guest will look for alternatives."
    conv.state = ConversationState.IDLE
    return get_message("welcome", conv.language)


# ─── Webhook Endpoint ─────────────────────────────────────────────
@app.post("/webhook")
@app.post("/api/v1/whatsapp/webhook")
async def webhook(request: Request):
    """WhatsApp Business API webhook callback"""
    body = await request.json()

    # Parse incoming message (supports Meta Cloud API format)
    msg = WebhookMessage()
    if "entry" in body:
        # Meta Cloud API format
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for message in value.get("messages", []):
                    msg.from_number = message.get("from", "")
                    msg.message_type = message.get("type", "text")
                    if msg.message_type == "text":
                        msg.text = message.get("text", {}).get("body", "")
                    elif msg.message_type == "image":
                        msg.media_url = message.get("image", {}).get("url", "")
                    elif msg.message_type == "location":
                        loc = message.get("location", {})
                        msg.latitude = loc.get("latitude")
                        msg.longitude = loc.get("longitude")
    else:
        # Simple format (for testing)
        msg = WebhookMessage(**body)

    if not msg.from_number:
        return {"status": "ok", "message": "no message to process"}

    conv = get_or_create_conversation(msg.from_number)
    response_text = process_message(conv, msg)

    return {
        "status": "ok",
        "to": msg.from_number,
        "response": response_text,
        "conversation_state": conv.state.value,
    }


# ─── REST API ─────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "gds-whatsapp-bot",
        "version": "1.0.0",
        "stats": {
            "active_conversations": len(conversations),
            "establishments_onboarded": len(establishments),
        },
    }


@app.get("/api/v1/establishments")
async def list_establishments():
    return {
        "establishments": list(establishments.values()),
        "total": len(establishments),
    }


@app.post("/api/v1/simulate")
async def simulate_message(msg: WebhookMessage):
    """Simulate a WhatsApp message (for testing without actual WhatsApp)"""
    if not msg.from_number:
        raise HTTPException(400, "from_number required")
    conv = get_or_create_conversation(msg.from_number)
    response_text = process_message(conv, msg)
    return {
        "response": response_text,
        "state": conv.state.value,
        "establishment_id": conv.establishment_id,
    }


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Africa GDS WhatsApp Bot on port 8101")
    uvicorn.run(app, host="0.0.0.0", port=8101)
