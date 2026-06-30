const bcrypt = require("bcryptjs");
const { get, initDb, run } = require("../models/db");

async function seed() {
  await initDb();

  const adminEmail = "admin@fenix.com";
  const exists = await get("SELECT id FROM users WHERE email = ?", [adminEmail]);
  if (exists) {
    console.log("Admin já existe.");
    process.exit(0);
  }

  const hash = await bcrypt.hash("123456", 10);
  await run(
    "INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, 'admin', 1)",
    ["Administrador Fênix", adminEmail, hash]
  );

  console.log("Admin criado: admin@fenix.com / 123456");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
