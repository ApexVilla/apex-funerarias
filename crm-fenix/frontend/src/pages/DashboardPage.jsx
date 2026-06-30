import { useEffect, useState } from "react";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../services/api";

const COLORS = ["#185FA5", "#f59e0b", "#ef4444"];

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => setData(res.data));
  }, []);

  if (!data) return <p>Carregando dashboard...</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-fenix-blue">Dashboard</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <Card title="Total de clientes" value={data.totalClientes} />
        <Card title="Inadimplentes" value={data.inadimplentes} />
        <Card title="Bloqueados" value={data.bloqueados} />
        <Card title="Contatos hoje" value={data.contatosHoje} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border p-3">
          <h3 className="mb-2 font-semibold">Status dos clientes</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statusChart} dataKey="total" nameKey="status" outerRadius={95} label>
                  {data.statusChart.map((entry, index) => (
                    <Cell key={entry.status} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded border p-3">
          <h3 className="mb-2 font-semibold">Ranking de atividade</h3>
          <ul className="space-y-2">
            {data.ranking.map((r) => (
              <li key={r.vendedor} className="flex justify-between rounded bg-slate-100 px-3 py-2">
                <span>{r.vendedor}</span>
                <strong>{r.total_contatos}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded border p-3">
        <h3 className="mb-2 font-semibold text-red-600">Sem contato há mais de 30 dias</h3>
        <ul className="space-y-1 text-sm">
          {data.staleClients.map((c) => (
            <li key={c.id}>
              {c.full_name} - {c.last_contact || "Nunca contatado"}
            </li>
          ))}
          {!data.staleClients.length && <li>Nenhum cliente nessa condição.</li>}
        </ul>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded border bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{title}</p>
      <p className="text-2xl font-bold text-fenix-blue">{value}</p>
    </div>
  );
}
