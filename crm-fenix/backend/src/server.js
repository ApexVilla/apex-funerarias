require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { auth } = require("./middleware/auth");
const { initDb } = require("./models/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const clientRoutes = require("./routes/clientRoutes");
const contactRoutes = require("./routes/contactRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/users", auth, userRoutes);
app.use("/api/clients", auth, clientRoutes);
app.use("/api/contacts", auth, contactRoutes);
app.use("/api/dashboard", auth, dashboardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({ message: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 4000;
initDb().then(() => {
  app.listen(PORT, () => console.log(`CRM Fênix backend rodando na porta ${PORT}`));
});
