const bcrypt = require("bcryptjs");
const { all, get, run } = require("../models/db");

async function listSellers(_req, res) {
  const sellers = await all(
    "SELECT id, name, email, role, active, created_at FROM users ORDER BY name"
  );
  return res.json(sellers);
}

async function createUser(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "Campos obrigatórios ausentes" });
  }
  if (!["admin", "vendedor"].includes(role)) {
    return res.status(400).json({ message: "Perfil inválido" });
  }
  const exists = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (exists) return res.status(409).json({ message: "Email já cadastrado" });

  const passwordHash = await bcrypt.hash(password, 10);
  await run(
    "INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)",
    [name, email, passwordHash, role]
  );
  return res.status(201).json({ message: "Usuário criado com sucesso" });
}

async function deactivateUser(req, res) {
  const { id } = req.params;
  await run("UPDATE users SET active = 0 WHERE id = ? AND role = 'vendedor'", [id]);
  return res.json({ message: "Vendedor desativado" });
}

async function reassignClients(req, res) {
  const { fromSellerId, toSellerId } = req.body;
  if (!fromSellerId || !toSellerId) {
    return res.status(400).json({ message: "IDs de vendedores são obrigatórios" });
  }
  const result = await run("UPDATE clients SET seller_id = ? WHERE seller_id = ?", [
    toSellerId,
    fromSellerId
  ]);
  return res.json({ message: "Carteira reatribuída", movedClients: result.changes || 0 });
}

module.exports = {
  listSellers,
  createUser,
  deactivateUser,
  reassignClients
};
