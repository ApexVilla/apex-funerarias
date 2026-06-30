import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";

const defaultForm = {
  full_name: "",
  whatsapp_phone: "",
  plan: "Plano Fênix",
  status: "Adimplente",
  seller_id: "",
  notes: ""
};

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", sellerId: "" });
  const [form, setForm] = useState(defaultForm);

  async function load() {
    const { data } = await api.get("/clients", { params: filters });
    setClients(data);
    if (user.role === "admin") {
      const sellersData = await api.get("/users");
      setSellers(sellersData.data.filter((u) => u.role === "vendedor" && u.active));
    }
  }

  useEffect(() => {
    load();
  }, [filters.status, filters.sellerId]);

  async function saveClient(e) {
    e.preventDefault();
    await api.post("/clients", form);
    setForm(defaultForm);
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-fenix-blue">Clientes</h2>
      <div className="grid gap-2 md:grid-cols-4">
        <input
          className="rounded border p-2"
          placeholder="Buscar por nome"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          onBlur={load}
        />
        <select
          className="rounded border p-2"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">Todos os status</option>
          <option>Adimplente</option>
          <option>Inadimplente</option>
          <option>Bloqueado</option>
        </select>
        {user.role === "admin" && (
          <select
            className="rounded border p-2"
            value={filters.sellerId}
            onChange={(e) => setFilters((f) => ({ ...f, sellerId: e.target.value }))}
          >
            <option value="">Todos os vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {user.role === "admin" && (
        <form onSubmit={saveClient} className="grid gap-2 rounded border p-3 md:grid-cols-3">
          <input
            className="rounded border p-2"
            placeholder="Nome completo"
            value={form.full_name}
            onChange={(e) => setForm((v) => ({ ...v, full_name: e.target.value }))}
            required
          />
          <input
            className="rounded border p-2"
            placeholder="WhatsApp"
            value={form.whatsapp_phone}
            onChange={(e) => setForm((v) => ({ ...v, whatsapp_phone: e.target.value }))}
            required
          />
          <select
            className="rounded border p-2"
            value={form.plan}
            onChange={(e) => setForm((v) => ({ ...v, plan: e.target.value }))}
          >
            <option>Plano Fênix</option>
            <option>Plano Luxo</option>
            <option>Plano Ônix</option>
          </select>
          <select
            className="rounded border p-2"
            value={form.status}
            onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))}
          >
            <option>Adimplente</option>
            <option>Inadimplente</option>
            <option>Bloqueado</option>
          </select>
          <select
            className="rounded border p-2"
            value={form.seller_id}
            onChange={(e) => setForm((v) => ({ ...v, seller_id: e.target.value }))}
            required
          >
            <option value="">Vendedor responsável</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border p-2"
            placeholder="Observações"
            value={form.notes}
            onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
          />
          <button className="rounded bg-fenix-blue px-3 py-2 font-semibold text-white md:col-span-3">
            Salvar cliente
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">WhatsApp</th>
              <th className="p-2 text-left">Plano</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-2">{c.full_name}</td>
                <td className="p-2">{c.whatsapp_phone}</td>
                <td className="p-2">{c.plan}</td>
                <td className="p-2">{c.status}</td>
                <td className="p-2">{c.seller_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
