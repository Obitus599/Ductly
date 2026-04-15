const { Client } = require("pg");

const client = new Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.xmukqwscunwjfnfhllcl",
  password: "Oblivion@123.com",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();

  // Get team IDs
  const { rows: teams } = await client.query(
    "SELECT id, name FROM teams WHERE active = true ORDER BY name"
  );
  console.log("Active teams:", teams.map((t) => t.name).join(", "));

  const team1 = teams[0].id;
  const team2 = teams[1].id;
  const team3 = teams[2].id;

  // Create a test customer
  const { rows: [customer] } = await client.query(
    "INSERT INTO customers (name, phone, email) VALUES ($1, $2, $3) RETURNING id",
    ["Test Customer", "+971501234567", "test@example.com"]
  );
  console.log("Created test customer:", customer.id);

  // ── Simulate: Sunday April 5, 2026 ──
  // Team 1: currently doing a job in Al Nahda Sharjah (10:30 - 12:00 UTC = 14:30-16:00 UAE)
  // Actually let's use UTC times that map to ~10:30-12:00 UAE = 06:30-08:00 UTC
  // Let's keep it simple and use UTC directly since our DB stores UTC

  // Scenario: Team 1 has a booking 10:30-12:00 (UTC) at Al Nahda Sharjah
  const booking1 = await client.query(
    `INSERT INTO bookings (team_id, customer_id, slot_start, slot_end, address, status)
     VALUES ($1, $2, '2026-04-05T10:30:00Z', '2026-04-05T12:00:00Z', $3, 'confirmed') RETURNING id`,
    [team1, customer.id, "Al Nahda, Sharjah, UAE"]
  );
  console.log("\n── SCENARIO SETUP ──");
  console.log("Booking 1 (Team 1): 10:30-12:00 UTC at Al Nahda, Sharjah");

  // Team 2: has a booking 09:00-10:30 (done already)
  await client.query(
    `INSERT INTO bookings (team_id, customer_id, slot_start, slot_end, address, status)
     VALUES ($1, $2, '2026-04-05T09:00:00Z', '2026-04-05T10:30:00Z', $3, 'confirmed')`,
    [team2, customer.id, "Dubai Marina, Dubai, UAE"]
  );
  console.log("Booking 2 (Team 2): 09:00-10:30 UTC at Dubai Marina");

  // Team 2: has ANOTHER booking at 13:00-14:30
  await client.query(
    `INSERT INTO bookings (team_id, customer_id, slot_start, slot_end, address, status)
     VALUES ($1, $2, '2026-04-05T13:00:00Z', '2026-04-05T14:30:00Z', $3, 'confirmed')`,
    [team2, customer.id, "Business Bay, Dubai, UAE"]
  );
  console.log("Booking 3 (Team 2): 13:00-14:30 UTC at Business Bay");

  // Team 3: free all day
  console.log("Team 3: No bookings (free all day)");

  // Also create a slot_lock for Team 1's confirmed booking
  await client.query(
    `INSERT INTO slot_locks (team_id, slot_start, booking_id) VALUES ($1, '2026-04-05T10:30:00Z', $2)`,
    [team1, booking1.rows[0].id]
  );

  console.log("\n── NOW TESTING /api/slots for 2026-04-05 ──");
  console.log("(run: curl http://localhost:3000/api/slots?date=2026-04-05)\n");

  // Let's also manually compute what SHOULD happen
  console.log("── EXPECTED ANALYSIS ──");
  console.log("Total active teams: 3");
  console.log("");
  console.log("Bookings on April 5:");
  console.log("  Team 1: 10:30-12:00 (Al Nahda Sharjah)");
  console.log("  Team 2: 09:00-10:30 (Dubai Marina)");
  console.log("  Team 2: 13:00-14:30 (Business Bay)");
  console.log("  Team 3: FREE");
  console.log("");
  console.log("Real-world question: Can Team 1 finish at 12:00 in Al Nahda Sharjah");
  console.log("and make a 14:00 booking in JBR Dubai?");
  console.log("");
  console.log("Google Maps estimate: Al Nahda Sharjah → JBR Dubai ≈ 40-55 min (midday traffic)");
  console.log("  12:00 finish + 50 min drive = ~12:50 arrival at JBR");
  console.log("  14:00 booking start → 70 min buffer ✅ FEASIBLE");
  console.log("");
  console.log("System check:");
  console.log("  Pass 1 (DB Filter): 14:00 slot has 0 overlapping bookings → AVAILABLE");
  console.log("  Pass 2 (Buffer Filter): Last booking ends at 12:00.");
  console.log("    Gap = 14:00 - 12:00 = 120 min > 20 min buffer → PASSES");
  console.log("");
  console.log("⚠️  LIMITATION: System uses a flat 20-min buffer, NOT real travel time.");
  console.log("    A 12:30 slot would ALSO pass (30 min gap > 20 min buffer)");
  console.log("    but in reality Al Nahda→JBR takes ~50 min, so 12:30 would be TIGHT.");

  await client.end();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
