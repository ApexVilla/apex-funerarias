import React, { useEffect, useState } from 'react';
import { useWhatsappCRM } from '../../lib/WhatsappCRMStore';

export const CRMDashboardPage: React.FC = () => {
  const { getDashboard } = useWhatsappCRM();
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);

  useEffect(() => {
    getDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <div className="text-sm text-gray-600">Carregando dashboard CRM...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[#185FA5]">Dashboard CRM</h1>

      <div className="grid gap-3 md:grid-cols-4">
        <Card titulo="Total de clientes" valor={data.resumo.totalClientes} />
        <Card titulo="Inadimplentes" valor={data.resumo.inadimplentes} />
        <Card titulo="Bloqueados" valor={data.resumo.bloqueados} />
        <Card titulo="Contatos hoje" valor={data.resumo.contatosHoje} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <h2 className="mb-2 font-semibold">Ranking de atividade</h2>
          <ul className="space-y-2 text-sm">
            {data.ranking.map((r) => (
              <li key={r.vendedor} className="flex justify-between rounded bg-gray-50 px-3 py-2">
                <span>{r.vendedor}</span>
                <strong>{r.total}</strong>
              </li>
            ))}
            {data.ranking.length === 0 && <li className="text-gray-500">Sem dados.</li>}
          </ul>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <h2 className="mb-2 font-semibold">Status dos clientes</h2>
          <ul className="space-y-2 text-sm">
            {data.statusChart.map((s) => (
              <li key={s.status} className="flex justify-between rounded bg-gray-50 px-3 py-2">
                <span>{s.status}</span>
                <strong>{s.total}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <h2 className="mb-2 font-semibold text-red-700">Sem contato há mais de 30 dias</h2>
        <ul className="space-y-1 text-sm">
          {data.semContato30Dias.map((c) => (
            <li key={c.id}>{c.nome}</li>
          ))}
          {data.semContato30Dias.length === 0 && <li>Nenhum cliente nessa condição.</li>}
        </ul>
      </div>
    </div>
  );
};

const Card: React.FC<{ titulo: string; valor: number }> = ({ titulo, valor }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <p className="text-xs text-gray-500">{titulo}</p>
    <p className="text-2xl font-bold text-[#185FA5]">{valor}</p>
  </div>
);
