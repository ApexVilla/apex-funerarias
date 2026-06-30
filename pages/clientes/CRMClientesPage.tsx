import React, { useEffect, useState } from 'react';
import { useWhatsappCRM, WhatsAppCliente } from '../../lib/WhatsappCRMStore';
import { TableSkeleton } from '../../components/ui/Skeletons';

export const CRMClientesPage: React.FC = () => {
  const { getClientes, isAdmin, logAcessoCliente } = useWhatsappCRM();
  const [clientes, setClientes] = useState<WhatsAppCliente[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const rows = await getClientes({ search, status });
    setClientes(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-[#185FA5]">Clientes CRM</h1>
        <div className="text-xs text-gray-500">
          Perfil: {isAdmin ? 'Admin (telefone completo)' : 'Vendedor (telefone mascarado)'}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <input
          className="rounded-md border border-gray-300 px-3 py-2"
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={load}
        />
        <select
          className="rounded-md border border-gray-300 px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="Adimplente">Adimplente</option>
          <option value="Inadimplente">Inadimplente</option>
          <option value="Bloqueado">Bloqueado</option>
        </select>
        <button onClick={load} className="rounded-md bg-[#185FA5] px-4 py-2 text-white">
          Atualizar
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-200">
        {loading ? (
          <TableSkeleton cols={5} rows={5} />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">WhatsApp</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Vendedor</th>
                <th className="px-4 py-2 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-gray-200">
                  <td className="px-4 py-2">{c.nome}</td>
                  <td className="px-4 py-2">{c.whatsapp || '-'}</td>
                  <td className="px-4 py-2">{c.status || '-'}</td>
                  <td className="px-4 py-2">{c.vendedor_nome || '-'}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => logAcessoCliente(c.id)}
                      className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
                    >
                      Registrar acesso
                    </button>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
