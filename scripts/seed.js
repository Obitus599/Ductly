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

  // Insert 3 test teams
  const teamIds = [];
  for (let i = 1; i <= 3; i++) {
    const res = await client.query(
      "INSERT INTO teams (name, whatsapp_number, active) VALUES ($1, $2, true) RETURNING id",
      ["Team " + i, "+97150000000" + i]
    );
    teamIds.push(res.rows[0].id);
    console.log("Created Team " + i + ":", res.rows[0].id);
  }

  // Insert schedules: Mon-Fri (1-5), 08:00-18:00
  for (const teamId of teamIds) {
    for (const day of [1, 2, 3, 4, 5]) {
      await client.query(
        "INSERT INTO team_schedules (team_id, day_of_week, start_time, end_time, active) VALUES ($1, $2, '08:00', '18:00', true)",
        [teamId, day]
      );
    }
  }
  console.log("Seeded schedules for 3 teams, Mon-Fri 08:00-18:00");

  await client.end();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
