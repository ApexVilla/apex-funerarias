import React, { useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, UserPlus } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useClienteStore, type ClienteSB } from '../../lib/ClienteStore';
import { clienteMatchBusca } from '../../lib/buscaCliente';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { supabase } from '../../lib/supabase';
import {
  atribuirClienteCarteiraEscritorio,
  clienteIdsNaCarteiraEscritorio,
  removerClienteDaCarteiraEscritorio,
} from '../../lib/carteiraEscritorio';
import { clienteIdsComCobradorNaCarteira } from '../../lib/cobradorDisponiveis';

interface ClienteCarteiraEscritorio {
  cliente_id: string;
  cliente_codigo: string;
  cliente_nome: string;
  contrato_codigo: string;
  parcelas_pendentes: number;
  valor_total_centavos: number;
}

const formatCurrency = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const CarteiraEscritorio: React.FC = () => {
  const { showToast } = useToast();
  const {
    empresaIdOperacao,
    empresaIdsFiltro,
    visaoConsolidada,
    labelContexto,
    dataRevisionEmpresa,
  } = useEmpresaIdsOperacao();
  const { buscarClientes } = useClienteStore();

  const [clientes, setClientes] = useState<ClienteCarteiraEscritorio[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [buscaAdicionar, setBuscaAdicionar] = useState('');
  const [resultadosAdicionar, setResultadosAdicionar] = useState<ClienteSB[]>([]);
  const [buscandoAdicionar, setBuscandoAdicionar] = useState(false);
  const [clienteAdicionarId, setClienteAdicionarId] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [clientesBloqueadosBusca, setClientesBloqueadosBusca] = useState<Set<string>>(() => new Set());

  const empresaIdsSync =
    empresaIdsFiltro.length > 0 ? empresaIdsFiltro : empresaIdOperacao ? [empresaIdOperacao] : [];

  const loadData = async () => {
    if (empresaIdsSync.length === 0) return;
    setLoading(true);
    try {
      let q = supabase
        .from('cob_cobrancas_pendentes')
        .select(`
          id, cliente_id, valor_centavos, observacao, conta_receber_id,
          fin_contas_receber ( deleted_at, assinaturas ( codigo ) ),
          clientes ( nome, codigo )
        `)
        .eq('canal_cobranca', 'escritorio')
        .in('status', ['pendente', 'em_andamento', 'promessa']);
      q = empresaIdsSync.length === 1 ? q.eq('empresa_id', empresaIdsSync[0]) : q.in('empresa_id', empresaIdsSync);

      const { data, error } = await q;
      if (error) throw error;

      const grouped = new Map<string, ClienteCarteiraEscritorio>();
      (data || []).forEach((item: Record<string, unknown>) => {
        const clienteId = String(item.cliente_id || '');
        if (!clienteId) return;

        const fr = item.fin_contas_receber as {
          deleted_at?: string | null;
          assinaturas?: { codigo?: string } | null;
        } | null;
        const contaReceberId = item.conta_receber_id ? String(item.conta_receber_id) : '';
        if (contaReceberId && (!fr || fr.deleted_at)) return;

        const cli = item.clientes as { nome?: string; codigo?: string } | null;
        const obs = String(item.observacao || '');
        const contratoFromObs = obs.match(/Contrato\s+(CTR-[\dA-Z-]+|\S+)/i)?.[1] || '';
        const contratoCodigo =
          fr?.assinaturas?.codigo ||
          contratoFromObs ||
          (obs.includes('Contrato') ? obs.replace(/^Contrato\s+/i, '') : '—');

        const valorCentavos = Number(item.valor_centavos || 0);
        const current = grouped.get(clienteId) || {
          cliente_id: clienteId,
          cliente_codigo: cli?.codigo || '—',
          cliente_nome: cli?.nome || 'Cliente sem nome',
          contrato_codigo: contratoCodigo,
          parcelas_pendentes: 0,
          valor_total_centavos: 0,
        };

        current.parcelas_pendentes += 1;
        current.valor_total_centavos += valorCentavos;
        if (current.contrato_codigo === '—' && contratoCodigo !== '—') {
          current.contrato_codigo = contratoCodigo;
        }
        grouped.set(clienteId, current);
      });

      setClientes(Array.from(grouped.values()));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar carteira', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [empresaIdsSync.join(','), dataRevisionEmpresa]);

  useEffect(() => {
    if (empresaIdsSync.length === 0) {
      setClientesBloqueadosBusca(new Set());
      return;
    }
    let cancelled = false;
    Promise.all([
      clienteIdsNaCarteiraEscritorio(empresaIdsSync),
      clienteIdsComCobradorNaCarteira(empresaIdsSync),
    ]).then(([escritorio, cobrador]) => {
      if (!cancelled) {
        const bloqueados = new Set<string>([...escritorio, ...cobrador]);
        setClientesBloqueadosBusca(bloqueados);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [empresaIdsSync.join(','), dataRevisionEmpresa]);

  useEffect(() => {
    const termo = buscaAdicionar.trim();
    if (termo.length < 2) {
      setResultadosAdicionar([]);
      return;
    }
    setBuscandoAdicionar(true);
    const t = window.setTimeout(() => {
      buscarClientes(termo)
        .then((lista) =>
          setResultadosAdicionar(
            lista
              .filter((c) => clienteMatchBusca(c, termo))
              .filter((c) => !clientesBloqueadosBusca.has(c.id))
              .slice(0, 20),
          ),
        )
        .finally(() => setBuscandoAdicionar(false));
    }, 320);
    return () => window.clearTimeout(t);
  }, [buscaAdicionar, buscarClientes, clientesBloqueadosBusca]);

  const filtrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientes.filter((c) => {
      if (!term) return true;
      return (
        c.cliente_nome.toLowerCase().includes(term) ||
        c.cliente_codigo.toLowerCase().includes(term) ||
        c.contrato_codigo.toLowerCase().includes(term)
      );
    });
  }, [clientes, search]);

  const adicionarCliente = async () => {
    const empId = empresaIdsSync[0] || empresaIdOperacao;
    if (!empId) {
      showToast('Unidade não identificada.', 'error');
      return;
    }
    if (!clienteAdicionarId) {
      showToast('Selecione o cliente na busca.', 'warning');
      return;
    }
    setAdicionando(true);
    try {
      const res = await atribuirClienteCarteiraEscritorio(empId, clienteAdicionarId);
      if (!res.ok) {
        showToast(res.erro || 'Não foi possível incluir na carteira.', 'error');
        return;
      }
      showToast(`Cliente incluído na carteira do escritório (${res.linhasAtualizadas} pendência(s)).`, 'success');
      setBuscaAdicionar('');
      setClienteAdicionarId('');
      setResultadosAdicionar([]);
      await loadData();
    } finally {
      setAdicionando(false);
    }
  };

  const removerCliente = async (clienteId: string) => {
    const empId = empresaIdsSync[0] || empresaIdOperacao;
    if (!empId) return;
    setLoading(true);
    try {
      const res = await removerClienteDaCarteiraEscritorio(empId, clienteId);
      if (!res.ok) {
        showToast(res.erro || 'Cliente não estava na carteira do escritório.', 'warning');
        return;
      }
      showToast('Cliente removido da carteira do escritório.', 'success');
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carteira do Escritório"
        subtitle={
          visaoConsolidada
            ? 'Clientes que pagam diretamente na unidade. Inclua manualmente pela busca abaixo.'
            : `Pagamento no escritório — unidade ${labelContexto}.`
        }
      />

      <Card className="p-4 space-y-3 border-teal-100 bg-teal-50/30">
        <h3 className="text-sm font-bold text-teal-900 flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Adicionar cliente à carteira do escritório
        </h3>
        <p className="text-xs text-teal-800">
          Aparecem clientes que <strong>ainda não estão</strong> na carteira do escritório nem com cobrador atribuído.
          Ao criar contrato, escolha forma de pagamento <strong>Escritório</strong> para incluir automaticamente.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Input
              className="normal-case"
              placeholder="Buscar cliente (nome, CPF, código)..."
              value={buscaAdicionar}
              onChange={(e) => {
                setBuscaAdicionar(e.target.value);
                setClienteAdicionarId('');
              }}
            />
            {buscandoAdicionar ? <p className="text-xs text-gray-500">Buscando...</p> : null}
            {buscaAdicionar.trim().length >= 2 &&
            resultadosAdicionar.length === 0 &&
            !buscandoAdicionar ? (
              <p className="text-xs text-amber-700">
                Nenhum cliente elegível encontrado (já na carteira ou já com cobrador).
              </p>
            ) : null}
            {resultadosAdicionar.length > 0 ? (
              <ul className="border rounded-lg bg-white max-h-40 overflow-y-auto text-sm divide-y">
                {resultadosAdicionar.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-teal-50 ${
                        clienteAdicionarId === c.id ? 'bg-teal-100 font-medium' : ''
                      }`}
                      onClick={() => setClienteAdicionarId(c.id)}
                    >
                      {c.nome}{' '}
                      <span className="text-gray-500 font-mono text-xs">{c.codigo || c.cpf}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button
              className="w-full md:w-auto"
              onClick={() => void adicionarCliente()}
              loading={adicionando}
              disabled={!clienteAdicionarId}
            >
              <Building2 className="h-4 w-4 mr-1" /> Adicionar na carteira
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <Input
            className="max-w-md normal-case"
            placeholder="Filtrar na lista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" loading={loading} onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-medium text-gray-700">
            {filtrados.length} cliente(s) — pagamento no escritório
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="py-3 px-4 text-left">Cód.</th>
                <th className="py-3 px-4 text-left">Cliente</th>
                <th className="py-3 px-4 text-left">Contrato</th>
                <th className="py-3 px-4 text-center">Parcelas</th>
                <th className="py-3 px-4 text-right">Total em aberto</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map((cliente) => (
                <tr key={cliente.cliente_id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-mono text-xs text-gray-600">{cliente.cliente_codigo}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{cliente.cliente_nome}</td>
                  <td className="py-3 px-4 font-mono text-xs text-teal-700">{cliente.contrato_codigo}</td>
                  <td className="py-3 px-4 text-center">{cliente.parcelas_pendentes}</td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {formatCurrency(cliente.valor_total_centavos)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void removerCliente(cliente.cliente_id)}
                      disabled={loading}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtrados.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-500 text-center">
            Nenhum cliente na carteira do escritório. Busque acima ou crie contrato com pagamento Escritório.
          </p>
        )}
      </Card>
    </div>
  );
};
