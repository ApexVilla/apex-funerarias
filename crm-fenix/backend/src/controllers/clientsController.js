const { all, get, run } = require("../models/db");
const { maskPhone } = require("../services/security");
const { logAudit } = require("../middleware/audit");

function buildFilters(query, user) {
  const params = [];
  const where = [];

  if (user.role === "vendedor") {
    where.push("c.seller_id = ?");
    params.push(user.id);
  } else if (query.sellerId) {
    where.push("c.seller_id = ?");
    params.push(query.sellerId);
  }

  if (query.search) {
    where.push("LOWER(c.full_name) LIKE ?");
    params.push(`%${query.search.toLowerCase()}%`);
  }

  if (query.status) {
    where.push("c.status = ?");
    params.push(query.status);
  }

  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

async function listClients(req, res) {
  const { clause, params } = buildFilters(req.query, req.user);
  const rows = await all(
    `
      SELECT c.*, u.name AS seller_name
      FROM clients c
      JOIN users u ON u.id = c.seller_id
      ${clause}
      ORDER BY c.full_name ASC
    `,
    params
  );

  const safeRows =
    req.user.role === "admin"
      ? rows
      : rows.map((r) => ({ ...r, whatsapp_phone: maskPhone(r.whatsapp_phone) }));
  return res.json(safeRows);
}

async function getClient(req, res) {
  const { id } = req.params;
  const row = await get(
    `
      SELECT c.*, u.name AS seller_name
      FROM clients c
      JOIN users u ON u.id = c.seller_id
      WHERE c.id = ?
    `,
    [id]
  );
  if (!row) return res.status(404).json({ message: "Cliente não encontrado" });

  if (req.user.role === "vendedor" && row.seller_id !== req.user.id) {
    return res.status(403).json({ message: "Acesso negado ao cliente" });
  }

  await logAudit({
    userId: req.user.id,
    action: "CLIENT_VIEW",
    clientId: row.id,
    details: `Perfil ${req.user.role} visualizou cliente`
  });

  if (req.user.role === "vendedor") {
    return res.json({ ...row, whatsapp_phone: maskPhone(row.whatsapp_phone) });
  }
  return res.json(row);
}

async function createClient(req, res) {
  const { full_name, whatsapp_phone, plan, status, seller_id, notes } = req.body;
  await run(
    `
      INSERT INTO clients (full_name, whatsapp_phone, plan, status, seller_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [full_name, whatsapp_phone, plan, status, seller_id, notes || "", req.user.id]
  );
  return res.status(201).json({ message: "Cliente criado com sucesso" });
}

async function updateClient(req, res) {
  const { id } = req.params;
  const { full_name, whatsapp_phone, plan, status, seller_id, notes } = req.body;
  await run(
    `
      UPDATE clients
      SET full_name = ?, whatsapp_phone = ?, plan = ?, status = ?, seller_id = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    [full_name, whatsapp_phone, plan, status, seller_id, notes || "", id]
  );
  return res.json({ message: "Cliente atualizado com sucesso" });
}

async function removeClient(req, res) {
  await run("DELETE FROM clients WHERE id = ?", [req.params.id]);
  return res.json({ message: "Cliente removido com sucesso" });
}

module.exports = {
  listClients,
  getClient,
  createClient,
  updateClient,
  removeClient
};
