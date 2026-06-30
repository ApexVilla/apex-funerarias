import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError("");
      await login(email, password);
      navigate("/dashboard");
    } catch (_err) {
      setError("Credenciais inválidas.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-bold text-fenix-blue">Acesso CRM Fênix</h2>
        <input
          className="mb-3 w-full rounded border p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-3 w-full rounded border p-2"
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded bg-fenix-blue py-2 font-semibold text-white">
          Entrar
        </button>
      </form>
    </div>
  );
}
