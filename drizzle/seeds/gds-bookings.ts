import { sql } from "drizzle-orm";
import crypto from "crypto";

function uuid() { return crypto.randomUUID(); }
function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(daysBack: number) {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysBack));
  return d;
}
function randomElement<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function seedGdsAndBookings(db: any, schema: any, users: any[], establishments: any[]) {
  console.log("  Seeding GDS, Bookings, and Trip Planner...");
  
  let bookingCount = 0;
  
  // Seed Tourist Bookings
  for (let i = 0; i < 50; i++) {
    const user = randomElement(users);
    const est = randomElement(establishments);
    
    const checkIn = randomDate(30);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + randomInt(1, 7));
    
    const status = randomElement(["confirmed", "confirmed", "completed", "cancelled", "pending"]);
    
    const [booking] = await db.insert(schema.touristBookings).values({
      userId: user.id,
      establishmentId: est.id,
      checkIn,
      checkOut,
      guests: randomInt(1, 4),
      totalAmount: randomInt(20000, 250000).toFixed(2),
      currency: "NGN",
      status,
      bookingRef: `TB-${Date.now().toString(36).toUpperCase()}-${i}`,
      channel: randomElement(["direct", "gds", "ota", "agent"]),
      createdAt: randomDate(60),
    }).returning();
    bookingCount++;
    
    // If GDS booking, add GDS specific records
    if (booking.channel === "gds") {
      await db.insert(schema.gdsBookingTaxes).values({
        bookingId: booking.id,
        countryCode: est.country || "NG",
        totalTax: (Number(booking.totalAmount) * 0.075).toFixed(2),
        taxBreakdown: { vat: 7.5, tourism_levy: 5.0 },
        remittanceStatus: "pending",
        createdAt: booking.createdAt,
      });
      
      await db.insert(schema.gdsLoyaltyEarnings).values({
        bookingId: booking.id,
        userId: user.id,
        pointsEarned: Math.floor(Number(booking.totalAmount) / 100),
        status: "awarded",
        createdAt: booking.createdAt,
      });
    }
  }
  
  // Seed Trip Planner Sessions (AI)
  console.log("  Seeding Trip Planner & AI Conversations...");
  for (let i = 0; i < 20; i++) {
    const user = randomElement(users);
    
    const [session] = await db.insert(schema.tripPlannerSessions).values({
      userId: user.id,
      destination: randomElement(["Lagos", "Abuja", "Nairobi", "Cape Town", "Accra"]),
      startDate: randomDate(10),
      endDate: randomDate(0),
      budget: randomInt(1000, 5000),
      currency: "USD",
      status: randomElement(["active", "completed"]),
      createdAt: randomDate(15),
    }).returning();
    
    // Trip Planner Messages
    for (let j = 0; j < randomInt(2, 6); j++) {
      await db.insert(schema.tripPlannerMessages).values({
        sessionId: session.id,
        role: j % 2 === 0 ? "user" : "assistant",
        content: j % 2 === 0 ? "Can you recommend hotels?" : "Here are some top-rated hotels in your budget...",
        createdAt: randomDate(15),
      });
    }
    
    // General AI Conversations
    const aiSessionId = `session_${user.id}_${Date.now()}`;
    await db.insert(schema.aiConversations).values([
      {
        userId: user.id,
        sessionId: aiSessionId,
        role: "user",
        content: "How do I process a refund?",
        context: "payment",
        createdAt: randomDate(5),
      },
      {
        userId: user.id,
        sessionId: aiSessionId,
        role: "assistant",
        content: "To process a refund, navigate to the transaction details and click 'Refund'.",
        context: "payment",
        modelUsed: "llama3.2:3b",
        createdAt: randomDate(5),
      }
    ]);
  }

  console.log(`  ✓ Seeded ${bookingCount} bookings and AI trip planner sessions`);
}
