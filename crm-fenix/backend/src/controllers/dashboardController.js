const { all, get } = require("../models/db");

async function summary(req, res) {
  const sellerFilter = req.user.role === "vendedor" ? "WHERE seller_id = ?" : "";
  const sellerParams = req.user.role === "vendedor" ? [req.user.id] : [];

  const total = await get(`SELECT COUNT(*) AS count FROM clients ${sellerFilter}`, sellerParams);
  const inadimplentes = await get(
    `SELECT COUNT(*) AS count FROM clients ${sellerFilter ? `${sellerFilter} AND` : "WHERE"} status = 'Inadimplente'`,
    sellerParams
  );
  const bloqueados = await get(
    `SELECT COUNT(*) AS count FROM clients ${sellerFilter ? `${sellerFilter} AND` : "WHERE"} status = 'Bloqueado'`,
    sellerParams
  );

  const contatosHoje = await get(
    `
      SELECT COUNT(*) AS count
      FROM whatsapp_contacts
      WHERE date(created_at) = date('now', 'localtime')
      ${req.user.role === "vendedor" ? "AND seller_id = ?" : ""}
    `,
    req.user.role === "vendedor" ? [req.user.id] : []
  );

  const ranking = await all(
    `
      SELECT u.name AS vendedor, COUNT(wc.id) AS total_contatos
      FROM users u
      LEFT JOIN whatsapp_contacts wc ON wc.seller_id = u.id
      ${req.user.role === "vendedor" ? "WHERE u.id = ?" : "WHERE u.role = 'vendedor'"}
      GROUP BY u.id, u.name
      ORDER BY total_contatos DESC
    `,
    req.user.role === "vendedor" ? [req.user.id] : []
  );

  const statusChart = await all(
    `
      SELECT status, COUNT(*) AS total
      FROM clients
      ${sellerFilter}
      GROUP BY status
    `,
    sellerParams
  );

  const staleClients = await all(
    `
      SELECT c.id, c.full_name, MAX(wc.created_at) AS last_contact
      FROM clients c
      LEFT JOIN whatsapp_contacts wc ON wc.client_id = c.id
      ${sellerFilter}
      GROUP BY c.id, c.full_name
      HAVING last_contact IS NULL OR julianday('now', 'localtime') - julianday(last_contact) > 30
      ORDER BY c.full_name
    `,
    sellerParams
  );

  return res.json({
    totalClientes: total.count,
    inadimplentes: inadimplentes.count,
    bloqueados: bloqueados.count,
    contatosHoje: contatosHoje.count,
    ranking,
    statusChart,
    staleClients
  });
}

module.exports = {
  summary
};
