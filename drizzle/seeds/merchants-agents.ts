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

export async function seedMerchantsAndAgents(db: any, schema: any, users: any[]) {
  console.log("  Seeding Merchants, Establishments, and Agents...");
  
  const merchantUsers = users.filter(u => u.role === "merchant");
  const agentUsers = users.filter(u => u.role === "agent");
  
  const establishments = [];
  const agents = [];
  
  // Create Merchants and Establishments
  for (const user of merchantUsers) {
    const businessTypes = ["hotel", "tour_operator", "restaurant", "transport", "attraction"];
    const type = randomElement(businessTypes);
    
    // Merchant record
    const [merchant] = await db.insert(schema.merchants).values({
      userId: user.id,
      merchantCode: `MC${randomInt(10000, 99999)}`,
      businessName: `${user.name.split(" ")[1]}'s ${type.replace("_", " ")}`,
      businessType: type,
      status: "active",
      kybStatus: randomElement(["approved", "pending", "approved"]),
      country: user.country,
      createdAt: user.createdAt,
    }).returning();
    
    // Establishment record
    const [est] = await db.insert(schema.establishments).values({
      ownerId: user.id,
      merchantId: merchant.id,
      name: merchant.businessName,
      type: type,
      status: "active",
      kybStatus: merchant.kybStatus,
      address: `${randomInt(1, 999)} Tourism Ave, City Center`,
      city: "Lagos",
      country: user.country,
      currency: "NGN",
      latitude: (6.5244 + (Math.random() * 0.1 - 0.05)).toFixed(6),
      longitude: (3.3792 + (Math.random() * 0.1 - 0.05)).toFixed(6),
      createdAt: user.createdAt,
    }).returning();
    establishments.push(est);
    
    // Merchant Locations
    for (let i = 0; i < randomInt(1, 3); i++) {
      await db.insert(schema.merchantLocations).values({
        merchantId: merchant.id,
        establishmentId: est.id,
        name: `${est.name} - Branch ${i+1}`,
        address: `Branch ${i+1} Address`,
        status: "active",
      });
    }
    
    // POS Terminals
    for (let i = 0; i < randomInt(1, 5); i++) {
      await db.insert(schema.posTerminals).values({
        merchantId: merchant.id,
        establishmentId: est.id,
        terminalId: `POS-${randomInt(10000000, 99999999)}`,
        serialNumber: `SN${randomInt(100000, 999999)}`,
        status: "active",
        lastActiveAt: randomDate(2),
      });
    }
  }
  
  // Create Agents and Network
  for (const user of agentUsers) {
    const [agent] = await db.insert(schema.agents).values({
      userId: user.id,
      agentCode: `AG${randomInt(10000, 99999)}`,
      name: user.name,
      email: user.email,
      phone: user.phone,
      tier: randomElement(["basic", "silver", "gold", "platinum"]),
      status: "active",
      isActive: true,
      commissionRate: (randomInt(1, 5) / 100).toFixed(4),
      commissionBalance: (randomInt(0, 50000)).toFixed(2),
      floatBalance: (randomInt(10000, 500000)).toFixed(2),
      floatLimit: "1000000.00",
      location: "Lagos, Nigeria",
      terminalSerial: `T-${randomInt(10000, 99999)}`,
      terminalEnabled: true,
      createdAt: user.createdAt,
    }).returning();
    agents.push(agent);
    
    // Agent Float Balances
    await db.insert(schema.agentFloatBalances).values({
      agentId: agent.id,
      currency: "NGN",
      balance: agent.floatBalance,
      lastUpdated: randomDate(1),
    });
    
    // Agent Geofence Zones
    await db.insert(schema.agentGeofenceZones).values({
      agentId: agent.id,
      zoneId: randomInt(1, 10),
      assignedAt: randomDate(30),
    });
    
    // Agent Performance Scores
    await db.insert(schema.agentPerformanceScores).values({
      agentId: agent.id,
      period: "2026-07",
      score: (randomInt(60, 98) + Math.random()).toFixed(2),
      transactionCount: randomInt(50, 500),
      volumeNgn: (randomInt(500000, 5000000)).toFixed(2),
      overallScore: (randomInt(70, 95) + Math.random()).toFixed(2),
    });
  }
  
  // Agent Hierarchy (Supervisors)
  for (let i = 0; i < agents.length; i++) {
    if (i > 0 && randomInt(1, 10) > 7) {
      const supervisor = agents[randomInt(0, i - 1)];
      await db.update(schema.agents)
        .set({ supervisorId: supervisor.id })
        .where(sql`id = ${agents[i].id}`);
        
      await db.insert(schema.supervisorAgents).values({
        supervisorId: supervisor.id,
        agentId: agents[i].id,
      });
    }
  }

  console.log(`  ✓ Seeded ${establishments.length} establishments, ${agents.length} agents`);
  return { establishments, agents };
}
