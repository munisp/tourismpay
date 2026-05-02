import { getDb } from "../server/db.ts";
import { establishments, users, kybApplications } from "../drizzle/schema.ts";
import { eq } from "drizzle-orm";

async function main() {
  const db = await getDb();

  // Find Kofi Mensah
  const kofiUsers = await db
    .select()
    .from(users)
    .where(eq(users.openId, "demo_merchant_001"))
    .limit(1);

  if (!kofiUsers.length) {
    console.log("Kofi Mensah not found in DB");
    process.exit(1);
  }

  const kofi = kofiUsers[0];
  console.log("Found Kofi:", kofi.id, kofi.name, kofi.role);

  // Check if establishment already exists
  const existing = await db
    .select()
    .from(establishments)
    .where(eq(establishments.ownerId, kofi.id))
    .limit(1);

  let estId: number;
  if (existing.length) {
    estId = existing[0].id;
    console.log("Establishment already exists:", estId);
  } else {
    // Insert establishment
    const [est] = await db
      .insert(establishments)
      .values({
        name: "Mensah's Kitchen & Grill",
        type: "restaurant",
        city: "Accra",
        country: "GH",
        address: "14 Oxford Street, Osu",
        contactEmail: "kofi.mensah@demo.tourismpay.com",
        contactPhone: "+233 20 000 0001",
        registrationNumber: "GH-RC-2024-8821",
        taxId: "TIN-GH-442891",
        employeeCount: 12,
        ownerId: kofi.id,
        status: "active",
        kybStatus: "draft",
        bisStatus: "not_started",
      })
      .returning({ id: establishments.id });

    estId = est.id;
    console.log("Inserted establishment:", estId);
  }

  // Insert a KYB application for this establishment
  const existingKyb = await db
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.establishmentId, estId))
    .limit(1);

  if (!existingKyb.length) {
    await db.insert(kybApplications).values({
      establishmentId: estId,
      submittedBy: kofi.id,
      status: "draft",
      documents: JSON.stringify({
        businessIdentity: { status: "pending", files: [] },
        ownershipDirectors: { status: "pending", files: [] },
        financialProfile: { status: "pending", files: [] },
        complianceAml: { status: "pending", files: [] },
        operationalDocs: { status: "pending", files: [] },
      }),
    });
    console.log("Inserted KYB application for establishment:", estId);
  } else {
    console.log("KYB application already exists for establishment:", estId);
  }

  console.log("Done! Kofi's establishment ID:", estId);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
