const ExcelJS = require("exceljs");
const { all, get, run } = require("../models/db");

async function createContact(req, res) {
  const { client_id, summary, contact_status } = req.body;
  const client = await get("SELECT id, seller_id FROM clients WHERE id = ?", [client_id]);
  if (!client) return res.status(404).json({ message: "Cliente não encontrado" });

  if (req.user.role === "vendedor" && client.seller_id !== req.user.id) {
    return res.status(403).json({ message: "Você só pode registrar contato da sua carteira" });
  }

  await run(
    "INSERT INTO whatsapp_contacts (client_id, seller_id, summary, contact_status) VALUES (?, ?, ?, ?)",
    [client_id, req.user.id, summary, contact_status]
  );
  return res.status(201).json({ message: "Contato registrado com sucesso" });
}

async function listContacts(req, res) {
  const params = [];
  let where = "";

  if (req.user.role === "vendedor") {
    where = "WHERE wc.seller_id = ?";
    params.push(req.user.id);
  }

  if (req.query.clientId) {
    where += where ? " AND wc.client_id = ?" : "WHERE wc.client_id = ?";
    params.push(req.query.clientId);
  }

  const rows = await all(
    `
      SELECT wc.*, c.full_name AS client_name, u.name AS seller_name
      FROM whatsapp_contacts wc
      JOIN clients c ON c.id = wc.client_id
      JOIN users u ON u.id = wc.seller_id
      ${where}
      ORDER BY wc.created_at DESC
    `,
    params
  );
  return res.json(rows);
}

async function exportContactsExcel(req, res) {
  const rows = await all(
    `
      SELECT wc.created_at, c.full_name AS cliente, u.name AS vendedor, wc.contact_status, wc.summary
      FROM whatsapp_contacts wc
      JOIN clients c ON c.id = wc.client_id
      JOIN users u ON u.id = wc.seller_id
      ORDER BY wc.created_at DESC
    `
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Contatos");
  sheet.columns = [
    { header: "Data/Hora", key: "created_at", width: 20 },
    { header: "Cliente", key: "cliente", width: 30 },
    { header: "Vendedor", key: "vendedor", width: 24 },
    { header: "Status", key: "contact_status", width: 22 },
    { header: "Resumo", key: "summary", width: 60 }
  ];
  rows.forEach((row) => sheet.addRow(row));

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=relatorio-contatos-fenix.xlsx"
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await workbook.xlsx.write(res);
  return res.end();
}

module.exports = {
  createContact,
  listContacts,
  exportContactsExcel
};
