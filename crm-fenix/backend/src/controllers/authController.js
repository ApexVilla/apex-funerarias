const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { get } = require("../models/db");

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email e senha são obrigatórios" });
  }

  const user = await get("SELECT * FROM users WHERE email = ? AND active = 1", [email]);
  if (!user) return res.status(401).json({ message: "Credenciais inválidas" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Credenciais inválidas" });

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "10h" }
  );

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
}

module.exports = {
  login
};
