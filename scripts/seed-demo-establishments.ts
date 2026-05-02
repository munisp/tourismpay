/**
 * Seed demo establishments for the tourist walkthrough.
 * Run with: npx tsx scripts/seed-demo-establishments.ts
 */
import { getDb } from "../server/db";
import { establishments, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function seed() {
  const database = await getDb();

  // Get the first user to use as owner
  const [owner] = await database.select({ id: users.id }).from(users).limit(1);
  if (!owner) {
    console.error("No users found. Please log in first to create a user.");
    process.exit(1);
  }

  const demoEstablishments = [
    {
      ownerId: owner.id,
      name: "Serengeti Safari Lodge",
      type: "safari_lodge" as const,
      country: "TZ",
      city: "Serengeti",
      address: "Serengeti National Park, Tanzania",
      contactPhone: "+255 123 456 789",
      contactEmail: "info@serengetisafarilodge.tz",
      website: "https://serengetisafarilodge.tz",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      ownerId: owner.id,
      name: "Lagos Beach Resort",
      type: "hotel" as const,
      country: "NG",
      city: "Lagos",
      address: "Victoria Island, Lagos, Nigeria",
      contactPhone: "+234 801 234 5678",
      contactEmail: "reservations@lagosbeachresort.ng",
      website: "https://lagosbeachresort.ng",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      ownerId: owner.id,
      name: "Nairobi Cultural Kitchen",
      type: "restaurant" as const,
      country: "KE",
      city: "Nairobi",
      address: "Westlands, Nairobi, Kenya",
      contactPhone: "+254 700 123 456",
      contactEmail: "dine@nairobiculturalkitchen.ke",
      website: "https://nairobiculturalkitchen.ke",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const est of demoEstablishments) {
    // Check if already exists by name
    const [existing] = await database
      .select({ id: establishments.id })
      .from(establishments)
      .where(eq(establishments.name, est.name))
      .limit(1);

    if (existing) {
      console.log(`✓ Already exists: ${est.name} (id: ${existing.id})`);
    } else {
      const [inserted] = await database
        .insert(establishments)
        .values(est)
        .returning({ id: establishments.id });
      console.log(`✓ Inserted: ${est.name} (id: ${inserted.id})`);
    }
  }

  console.log("\nDemo establishments seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
