/**
 * OTA/Channel Manager API Connectors
 *
 * Unified interface for:
 * - Expedia Partner Central (EPC Rapid API)
 * - Booking.com (Connectivity API)
 * - Google Hotel Center (Hotel Prices API)
 *
 * Configuration (env vars):
 *   EXPEDIA_API_KEY         EPC API key
 *   EXPEDIA_API_SECRET      EPC API secret
 *   EXPEDIA_PROPERTY_ID     Default property ID
 *   BOOKING_USERNAME        Booking.com XML username
 *   BOOKING_PASSWORD        Booking.com XML password
 *   BOOKING_HOTEL_ID        Default hotel ID
 *   GOOGLE_HOTEL_API_KEY    Google Hotel Prices API key
 *   GOOGLE_HOTEL_PARTNER_ID Google partner account ID
 */

import crypto from "crypto";
import { logger } from "./logger";

export type OTAChannel = "expedia" | "booking_com" | "google_hotel";

export interface RateUpdate {
  roomTypeCode: string;
  ratePlanCode: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  amountPerNight: number;
  currency: string;
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface AvailabilityUpdate {
  roomTypeCode: string;
  date: string; // YYYY-MM-DD
  totalInventory: number;
  soldCount?: number;
}

export interface OTABooking {
  channel: OTAChannel;
  bookingId: string;
  guestName: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  roomTypeCode: string;
  ratePlanCode: string;
  totalAmount: number;
  currency: string;
  status: "confirmed" | "cancelled" | "modified" | "pending";
  createdAt: string;
  raw?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  channel: OTAChannel;
  operation: string;
  itemsProcessed: number;
  errors: string[];
}

// ── Channel Configuration Check ────────────────────────────────────────────

export function isChannelConfigured(channel: OTAChannel): boolean {
  switch (channel) {
    case "expedia":
      return !!(process.env.EXPEDIA_API_KEY && process.env.EXPEDIA_API_SECRET);
    case "booking_com":
      return !!(process.env.BOOKING_USERNAME && process.env.BOOKING_PASSWORD);
    case "google_hotel":
      return !!(process.env.GOOGLE_HOTEL_API_KEY);
    default:
      return false;
  }
}

export function getConfiguredChannels(): OTAChannel[] {
  return (["expedia", "booking_com", "google_hotel"] as OTAChannel[])
    .filter(isChannelConfigured);
}

// ── Expedia Partner Central (EPC) ──────────────────────────────────────────

const EXPEDIA_BASE = "https://services.expediapartnercentral.com";

function expediaAuthHeaders(): Record<string, string> {
  const apiKey = process.env.EXPEDIA_API_KEY ?? "";
  const apiSecret = process.env.EXPEDIA_API_SECRET ?? "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHash("sha512")
    .update(apiKey + apiSecret + timestamp)
    .digest("hex");

  return {
    Authorization: `EAN APIKey=${apiKey},Signature=${sig},timestamp=${timestamp}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function expediaPushRates(
  propertyId: string,
  rates: RateUpdate[],
): Promise<SyncResult> {
  const errors: string[] = [];
  let processed = 0;

  for (const rate of rates) {
    try {
      const body = {
        propertyId,
        roomType: {
          resourceId: rate.roomTypeCode,
          ratePlan: {
            resourceId: rate.ratePlanCode,
            dateRange: {
              startDate: rate.startDate,
              endDate: rate.endDate,
            },
            perDayRates: [{
              currency: rate.currency,
              amount: rate.amountPerNight,
            }],
            restrictions: {
              minLOS: rate.minStay ?? 1,
              maxLOS: rate.maxStay ?? 28,
              closedToArrival: rate.closedToArrival ?? false,
              closedToDeparture: rate.closedToDeparture ?? false,
            },
          },
        },
      };

      const res = await fetch(`${EXPEDIA_BASE}/properties/${propertyId}/roomTypes/${rate.roomTypeCode}/ratePlans/${rate.ratePlanCode}`, {
        method: "PUT",
        headers: expediaAuthHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        processed++;
      } else {
        const errBody = await res.text();
        errors.push(`Expedia rate push failed for ${rate.roomTypeCode}: ${res.status} ${errBody}`);
      }
    } catch (err) {
      errors.push(`Expedia rate push error for ${rate.roomTypeCode}: ${err}`);
    }
  }

  return { success: errors.length === 0, channel: "expedia", operation: "rate_update", itemsProcessed: processed, errors };
}

async function expediaPushAvailability(
  propertyId: string,
  updates: AvailabilityUpdate[],
): Promise<SyncResult> {
  const errors: string[] = [];
  let processed = 0;

  for (const update of updates) {
    try {
      const body = {
        propertyId,
        roomType: {
          resourceId: update.roomTypeCode,
          dateRange: { startDate: update.date, endDate: update.date },
          totalInventoryAvailable: update.totalInventory - (update.soldCount ?? 0),
        },
      };

      const res = await fetch(`${EXPEDIA_BASE}/properties/${propertyId}/availability`, {
        method: "PUT",
        headers: expediaAuthHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        processed++;
      } else {
        const errBody = await res.text();
        errors.push(`Expedia availability failed for ${update.roomTypeCode}: ${res.status} ${errBody}`);
      }
    } catch (err) {
      errors.push(`Expedia availability error: ${err}`);
    }
  }

  return { success: errors.length === 0, channel: "expedia", operation: "availability_update", itemsProcessed: processed, errors };
}

async function expediaFetchBookings(propertyId: string, _since?: string): Promise<OTABooking[]> {
  try {
    const res = await fetch(`${EXPEDIA_BASE}/properties/${propertyId}/bookings`, {
      headers: expediaAuthHeaders(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];

    const body = await res.json() as { bookings?: Array<Record<string, unknown>> };
    return (body.bookings ?? []).map((b) => ({
      channel: "expedia" as OTAChannel,
      bookingId: String(b.confirmationNumber ?? b.id ?? ""),
      guestName: String(b.guestName ?? ""),
      guestEmail: b.guestEmail as string | undefined,
      checkIn: String(b.checkInDate ?? ""),
      checkOut: String(b.checkOutDate ?? ""),
      roomTypeCode: String(b.roomTypeId ?? ""),
      ratePlanCode: String(b.ratePlanId ?? ""),
      totalAmount: Number(b.totalAmount ?? 0),
      currency: String(b.currency ?? "USD"),
      status: mapBookingStatus(String(b.status ?? "confirmed")),
      createdAt: String(b.createdAt ?? new Date().toISOString()),
      raw: b,
    }));
  } catch (err) {
    logger.error("[OTA:Expedia] Fetch bookings failed:", err);
    return [];
  }
}

// ── Booking.com Connectivity API ───────────────────────────────────────────

const BOOKING_BASE = "https://supply-xml.booking.com";

function bookingBasicAuth(): string {
  const username = process.env.BOOKING_USERNAME ?? "";
  const password = process.env.BOOKING_PASSWORD ?? "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function bookingPushRates(
  hotelId: string,
  rates: RateUpdate[],
): Promise<SyncResult> {
  const errors: string[] = [];
  let processed = 0;

  // Booking.com uses OTA_HotelRatePlanNotifRQ XML format
  for (const rate of rates) {
    try {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelRatePlanNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="3.0">
  <RatePlans HotelCode="${hotelId}">
    <RatePlan RatePlanCode="${rate.ratePlanCode}" RatePlanType="11">
      <Rates>
        <Rate InvTypeCode="${rate.roomTypeCode}" Start="${rate.startDate}" End="${rate.endDate}">
          <BaseByGuestAmts>
            <BaseByGuestAmt AmountAfterTax="${rate.amountPerNight}" CurrencyCode="${rate.currency}" NumberOfGuests="2"/>
          </BaseByGuestAmts>
        </Rate>
      </Rates>
    </RatePlan>
  </RatePlans>
</OTA_HotelRatePlanNotifRQ>`;

      const res = await fetch(`${BOOKING_BASE}/hotels/xml/rateplan`, {
        method: "POST",
        headers: {
          Authorization: bookingBasicAuth(),
          "Content-Type": "application/xml",
        },
        body: xml,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        processed++;
      } else {
        errors.push(`Booking.com rate push failed: ${res.status}`);
      }
    } catch (err) {
      errors.push(`Booking.com rate error: ${err}`);
    }
  }

  return { success: errors.length === 0, channel: "booking_com", operation: "rate_update", itemsProcessed: processed, errors };
}

async function bookingPushAvailability(
  hotelId: string,
  updates: AvailabilityUpdate[],
): Promise<SyncResult> {
  const errors: string[] = [];
  let processed = 0;

  for (const update of updates) {
    try {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="3.0">
  <AvailStatusMessages HotelCode="${hotelId}">
    <AvailStatusMessage>
      <StatusApplicationControl Start="${update.date}" End="${update.date}" InvTypeCode="${update.roomTypeCode}"/>
      <LengthsOfStay>
        <LengthOfStay MinMaxMessageType="MinLOS" Time="1"/>
      </LengthsOfStay>
      <BookingLimit>${update.totalInventory - (update.soldCount ?? 0)}</BookingLimit>
    </AvailStatusMessage>
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>`;

      const res = await fetch(`${BOOKING_BASE}/hotels/xml/availability`, {
        method: "POST",
        headers: {
          Authorization: bookingBasicAuth(),
          "Content-Type": "application/xml",
        },
        body: xml,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        processed++;
      } else {
        errors.push(`Booking.com availability failed: ${res.status}`);
      }
    } catch (err) {
      errors.push(`Booking.com availability error: ${err}`);
    }
  }

  return { success: errors.length === 0, channel: "booking_com", operation: "availability_update", itemsProcessed: processed, errors };
}

// ── Google Hotel Center ────────────────────────────────────────────────────

const GOOGLE_HOTEL_BASE = "https://travelpartner.googleapis.com/v3";

async function googlePushPrices(
  partnerId: string,
  rates: RateUpdate[],
): Promise<SyncResult> {
  const apiKey = process.env.GOOGLE_HOTEL_API_KEY ?? "";
  const errors: string[] = [];
  let processed = 0;

  // Google Hotel Prices uses Transaction messages format
  const priceItems = rates.map((r) => ({
    id: `${r.roomTypeCode}-${r.ratePlanCode}`,
    name: r.roomTypeCode,
    baserate: {
      value: r.amountPerNight.toFixed(2),
      currency: r.currency,
    },
    checkin: r.startDate,
    checkout: r.endDate,
    nights: Math.max(1, Math.ceil(
      (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / (86400000),
    )),
  }));

  try {
    const res = await fetch(
      `${GOOGLE_HOTEL_BASE}/accounts/${partnerId}/priceCoverage?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: priceItems }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (res.ok) {
      processed = rates.length;
    } else {
      const errBody = await res.text();
      errors.push(`Google Hotel price push failed: ${res.status} ${errBody}`);
    }
  } catch (err) {
    errors.push(`Google Hotel price error: ${err}`);
  }

  return { success: errors.length === 0, channel: "google_hotel", operation: "price_update", itemsProcessed: processed, errors };
}

// ── Unified Interface ──────────────────────────────────────────────────────

/**
 * Push rate updates to an OTA channel
 */
export async function pushRates(
  channel: OTAChannel,
  propertyId: string,
  rates: RateUpdate[],
): Promise<SyncResult> {
  if (!isChannelConfigured(channel)) {
    logger.warn(`[OTA:${channel}] Not configured — rate push skipped`);
    return { success: false, channel, operation: "rate_update", itemsProcessed: 0, errors: ["Channel not configured"] };
  }

  switch (channel) {
    case "expedia":
      return expediaPushRates(propertyId, rates);
    case "booking_com":
      return bookingPushRates(propertyId, rates);
    case "google_hotel": {
      const partnerId = process.env.GOOGLE_HOTEL_PARTNER_ID ?? propertyId;
      return googlePushPrices(partnerId, rates);
    }
  }
}

/**
 * Push availability updates to an OTA channel
 */
export async function pushAvailability(
  channel: OTAChannel,
  propertyId: string,
  updates: AvailabilityUpdate[],
): Promise<SyncResult> {
  if (!isChannelConfigured(channel)) {
    logger.warn(`[OTA:${channel}] Not configured — availability push skipped`);
    return { success: false, channel, operation: "availability_update", itemsProcessed: 0, errors: ["Channel not configured"] };
  }

  switch (channel) {
    case "expedia":
      return expediaPushAvailability(propertyId, updates);
    case "booking_com":
      return bookingPushAvailability(propertyId, updates);
    case "google_hotel":
      return { success: false, channel, operation: "availability_update", itemsProcessed: 0, errors: ["Google Hotel does not support direct availability push"] };
  }
}

/**
 * Fetch inbound bookings from an OTA channel
 */
export async function fetchBookings(
  channel: OTAChannel,
  propertyId: string,
  since?: string,
): Promise<OTABooking[]> {
  if (!isChannelConfigured(channel)) return [];

  switch (channel) {
    case "expedia":
      return expediaFetchBookings(propertyId, since);
    case "booking_com":
      // Booking.com uses push model — bookings come via webhook
      return [];
    case "google_hotel":
      return [];
  }
}

/**
 * Sync all configured channels (rates + availability + bookings)
 */
export async function syncAllChannels(
  propertyId: string,
  rates: RateUpdate[],
  availability: AvailabilityUpdate[],
): Promise<{ results: SyncResult[]; bookings: OTABooking[] }> {
  const configured = getConfiguredChannels();
  const results: SyncResult[] = [];
  const allBookings: OTABooking[] = [];

  for (const channel of configured) {
    if (rates.length > 0) {
      results.push(await pushRates(channel, propertyId, rates));
    }
    if (availability.length > 0) {
      results.push(await pushAvailability(channel, propertyId, availability));
    }
    const bookings = await fetchBookings(channel, propertyId);
    allBookings.push(...bookings);
  }

  return { results, bookings: allBookings };
}

function mapBookingStatus(status: string): "confirmed" | "cancelled" | "modified" | "pending" {
  const s = status.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("modif")) return "modified";
  if (s.includes("pend")) return "pending";
  return "confirmed";
}
