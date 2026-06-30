import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, RefreshCw, Search, DollarSign, User, MessageCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { formatCentavos } from '../../lib/FinanceiroStore';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import {
  carregarCobrancasPendentes,
  registrarAcaoCobrancaEscritorio,
  type CobrancaPendenteDto,
} from '../../lib/cobrancaPendentesSupabase';
import { mensagemErroSupabase } from '../../lib/supabaseErrorMessage';
import { buscarClienteIdsPorCodigoContrato, contratoCodigoMatch } from '../../lib/buscaContrato';

type AcaoCobranca = {
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'promessa';
  observacao: string;
  dataAcao: string;
  promessaData?: string;
  promessaValorCentavos?: number;
};

type CobrancaItem = CobrancaPendenteDto;

const PAGE_SIZE = 15;

export const Cobranca: React.FC = () => {
  const navigate = useNavigate();
  const { empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [carteiraBruta, setCarteiraBruta] = useState<CobrancaItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteIdsBuscaContrato, setClienteIdsBuscaContrato] = useState<Set<string>>(() => new Set());
  const [faixaFilter, setFaixaFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedConta, setSelectedConta] = useState<CobrancaItem | null>(null);
  const [showAcaoModal, setShowAcaoModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [acaoTipo, setAcaoTipo] = useState<AcaoCobranca['tipo']>('ligacao');
  const [acaoObs, setAcaoObs] = useState('');
  const [promessaData, setPromessaData] = useState('');
  const [promessaValor, setPromessaValor] = useState('');

  const loadCarteira = async () => {
    if (empresaIdsFiltro.length === 0) {
      showToast('Selecione a unidade no topo da tela para carregar a cobrança.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const rows = await carregarCobrancasPendentes(empresaIdsFiltro, {
        sincronizarTitulos: true,
      });
      setCarteiraBruta(rows.filter((r) => r.status !== 'cobrado'));
    } catch (error) {
      showToast(mensagemErroSupabase(error, 'Erro ao carregar cobrança'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCarteira();
  }, [empresaIdsFiltro.join(','), dataRevisionEmpresa]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2 || empresaIdsFiltro.length === 0) {
      setClienteIdsBuscaContrato(new Set());
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void buscarClienteIdsPorCodigoContrato(empresaIdsFiltro, term).then(({ clienteIds }) => {
        if (!cancelled) setClienteIdsBuscaContrato(new Set(clienteIds));
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm, empresaIdsFiltro.join(',')]);

  const carteiraFiltrada = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return carteiraBruta.filter((item) => {
      const dias = item.dias_atraso || 0;
      if (faixaFilter === '1_30' && (dias < 1 || dias > 30)) return false;
      if (faixaFilter === '31_60' && (dias < 31 || dias > 60)) return false;
      if (faixaFilter === '61_90' && (dias < 61 || dias > 90)) return false;
      if (faixaFilter === '90_plus' && dias <= 90) return false;
      if (!term) return true;
      return (
        item.cliente_nome.toLowerCase().includes(term) ||
        item.cliente_cpf.toLowerCase().includes(term) ||
        item.parcela_codigo.toLowerCase().includes(term) ||
        contratoCodigoMatch(item.contrato_codigo, searchTerm) ||
        (item.cliente_id ? clienteIdsBuscaContrato.has(item.cliente_id) : false)
      );
    });
  }, [carteiraBruta, searchTerm, faixaFilter, clienteIdsBuscaContrato]);

  const total = carteiraFiltrada.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const carteira = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return carteiraFiltrada.slice(start, start + PAGE_SIZE);
  }, [carteiraFiltrada, page]);

  const totais = useMemo(() => {
    const emCobranca = carteiraFiltrada.reduce((acc, item) => acc + (item.valor_centavos || 0), 0);
    const titulosVencidos = carteiraFiltrada.filter((item) => (item.dias_atraso || 0) > 0).length;
    return { emCobranca, titulosVencidos };
  }, [carteiraFiltrada]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, faixaFilter]);

  const handleAbrirAcao = (conta: CobrancaItem) => {
    setSelectedConta(conta);
    setAcaoTipo('ligacao');
    setAcaoObs('');
    setPromessaData('');
    setPromessaValor('');
    setShowAcaoModal(true);
  };

  const handleSalvarAcao = async () => {
    if (!selectedConta) return;
    try {
      await registrarAcaoCobrancaEscritorio({
        empresa_id: selectedConta.empresa_id,
        cobranca_pendente_id: selectedConta.id,
        tipo: acaoTipo,
        observacao: acaoObs.trim() || null,
        promessa_data: acaoTipo === 'promessa' ? promessaData || null : null,
        promessa_valor_centavos:
          acaoTipo === 'promessa' && promessaValor
            ? Math.round(Number(promessaValor) * 100)
            : null,
      });
      showToast('Ação de cobrança registrada.', 'success');
      setShowAcaoModal(false);
      await loadCarteira();
    } catch (error) {
      showToast(mensagemErroSupabase(error, 'Erro ao salvar ação'), 'error');
    }
  };

  const handleReceberCobranca = (conta: CobrancaItem) => {
    setOpenMenuId(null);
    if (conta.cliente_nome) {
      navigate(`/financeiro/baixa-parcelas?search=${encodeURIComponent(conta.cliente_nome)}`);
      return;
    }
    navigate('/financeiro/baixa-parcelas');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobrança"
        subtitle="Fila operacional de cobrança com ações e promessas de pagamento (Supabase)"
        actionButton={
          <Button type="button" variant="outline" onClick={loadCarteira} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar carteira
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Em Cobrança</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{formatCentavos(totais.emCobranca)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Títulos Vencidos</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{totais.titulosVencidos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total de Registros</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{total}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute top-3 left-3" />
            <Input
              className="pl-9"
              placeholder="Buscar por nº contrato, cliente, CPF ou parcela"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-56">
            <Select value={faixaFilter} onChange={(e) => setFaixaFilter(e.target.value)}>
              <option value="">Faixa de atraso: Todas (Vencidas)</option>
              <option value="1_30">1 a 30 dias</option>
              <option value="31_60">31 a 60 dias</option>
              <option value="61_90">61 a 90 dias</option>
              <option value="90_plus">Acima de 90 dias</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Título</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Atraso</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Em Aberto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Última Ação</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-slate-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && carteira.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Carregando carteira...
                  </td>
                </tr>
              ) : carteira.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Nenhuma cobrança pendente nesta unidade.
                  </td>
                </tr>
              ) : (
                carteira.map((conta) => {
                  const atraso = conta.dias_atraso || 0;
                  return (
                    <tr key={conta.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                      <td className="p-0">
                        <DropdownMenu className="w-full block">
                          <DropdownMenuTrigger
                            className="px-4 py-3 w-full h-full text-left"
                            onClick={() => setOpenMenuId(openMenuId === conta.id ? null : conta.id)}
                            onContextMenu={() => setOpenMenuId(conta.id)}
                          >
                            <span className="font-medium text-gray-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                              {conta.cliente_nome}
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            isOpen={openMenuId === conta.id}
                            onClose={() => setOpenMenuId(null)}
                            align="left"
                          >
                            <DropdownMenuItem onClick={() => handleReceberCobranca(conta)}>
                              <DollarSign className="h-4 w-4 mr-2" /> Receber Pagamento
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                handleAbrirAcao(conta);
                                setOpenMenuId(null);
                              }}
                            >
                              <CalendarClock className="h-4 w-4 mr-2" /> Registrar Ação
                            </DropdownMenuItem>
                            {conta.cliente_id && (
                              <DropdownMenuItem
                                onClick={() => {
                                  navigate(`/clientes/${conta.cliente_id}`);
                                  setOpenMenuId(null);
                                }}
                              >
                                <User className="h-4 w-4 mr-2" /> Perfil do Cliente
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setOpenMenuId(null)}>
                              <MessageCircle className="h-4 w-4 mr-2" /> Enviar WhatsApp
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="text-xs text-gray-500 px-4 pb-2">{conta.cliente_cpf || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-700">{conta.parcela_codigo || '-'}</p>
                        <p className="text-xs text-gray-500">
                          Venc.:{' '}
                          {conta.data_vencimento
                            ? new Date(`${conta.data_vencimento}T00:00`).toLocaleDateString('pt-BR')
                            : '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                          {atraso}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-slate-100">
                        {formatCentavos(conta.valor_centavos || 0)}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-xs text-gray-600" title={conta.observacao}>
                        {conta.observacao || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium uppercase">{conta.status}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/30 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Mostrando {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, total)} de{' '}
            {total}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-xs font-medium text-gray-700">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      </Card>

      {showAcaoModal && selectedConta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Registrar Ação de Cobrança</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedConta.cliente_nome} • {selectedConta.parcela_codigo || '-'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <Select label="Tipo de ação" value={acaoTipo} onChange={(e) => setAcaoTipo(e.target.value as AcaoCobranca['tipo'])}>
                <option value="ligacao">Ligação</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="promessa">Promessa de pagamento</option>
              </Select>
              {acaoTipo === 'promessa' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Data promessa" type="date" value={promessaData} onChange={(e) => setPromessaData(e.target.value)} />
                  <Input
                    label="Valor prometido (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={promessaValor}
                    onChange={(e) => setPromessaValor(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">
                  Observação
                </label>
                <textarea
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
                  rows={3}
                  value={acaoObs}
                  onChange={(e) => setAcaoObs(e.target.value)}
                  placeholder="Ex.: cliente informou pagamento no dia 10."
                />
              </div>
            </div>
            <div className="p-5 border-t bg-gray-50 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAcaoModal(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSalvarAcao}>
                Salvar ação
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
