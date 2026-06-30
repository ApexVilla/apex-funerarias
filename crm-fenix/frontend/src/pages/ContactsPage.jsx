import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";

export default function ContactsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    client_id: "",
    summary: "",
    contact_status: "Mensagem enviada"
  });

  async function load() {
    const clientsRes = await api.get("/clients");
    const contactsRes = await api.get("/contacts");
    setClients(clientsRes.data);
    setContacts(contactsRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    await api.post("/contacts", form);
    setForm({ client_id: "", summary: "", contact_status: "Mensagem enviada" });
    load();
  }

  async function exportExcel() {
    const response = await api.get("/contacts/export/excel", { responseType: "blob" });
    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-contatos-fenix.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-fenix-blue">Contatos WhatsApp</h2>
        {user.role === "admin" && (
          <button onClick={exportExcel} className="rounded bg-fenix-blue px-3 py-2 text-white">
            Exportar Excel
          </button>
        )}
      </div>

      <form onSubmit={submit} className="grid gap-2 rounded border p-3 md:grid-cols-3">
        <select
          className="rounded border p-2"
          value={form.client_id}
          onChange={(e) => setForm((v) => ({ ...v, client_id: e.target.value }))}
          required
        >
          <option value="">Selecione o cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <select
          className="rounded border p-2"
          value={form.contact_status}
          onChange={(e) => setForm((v) => ({ ...v, contact_status: e.target.value }))}
        >
          <option>Mensagem enviada</option>
          <option>Respondeu</option>
          <option>Não atendeu</option>
          <option>Prometeu pagar</option>
        </select>
        <input
          className="rounded border p-2 md:col-span-3"
          placeholder="Resumo da conversa"
          value={form.summary}
          onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))}
          required
        />
        <button className="rounded bg-fenix-blue px-3 py-2 font-semibold text-white md:col-span-3">
          Registrar contato
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Data/Hora</th>
              <th className="p-2 text-left">Cliente</th>
              <th className="p-2 text-left">Vendedor</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Resumo</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-2">{c.created_at}</td>
                <td className="p-2">{c.client_name}</td>
                <td className="p-2">{c.seller_name}</td>
                <td className="p-2">{c.contact_status}</td>
                <td className="p-2">{c.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
