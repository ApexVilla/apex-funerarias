import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Eye, Edit, Plus, RefreshCw, FileText,
  Printer, Trash2, AlertCircle, ChevronDown, Clock,
  CheckCircle2, XCircle, Loader2, Calendar, User, Heart,
  Truck, Navigation, MapPin, Wallet, Receipt, ShieldCheck
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useServicoStore } from '../../lib/ServicoStore';
import { useToast } from '../../lib/ToastStore';
import { useAuth } from '../../lib/AuthContext';
import { gerarOrdemServicoAtendimentoPdf } from '../../lib/AtendimentoOrdemServicoPdf';
import { DocumentosAtendimentoModal } from '../../components/atendimentos/DocumentosAtendimentoModal';
import { BaixaAtendimentoModal } from '../../components/atendimentos/BaixaAtendimentoModal';
import {
  aprovarOsAtendimento,
  atendimentoJaRecebido,
  type AtendimentoBaixaRow,
} from '../../lib/atendimentoBaixaService';
import type { AtendimentoResumoDoc } from '../../lib/AtendimentoDocumentos';

const STATUS_CONFIG = {
  aguardando:   { label: 'Aguardando',   color: 'yellow', icon: Clock },
  em_andamento: { label: 'Em Andamento', color: 'blue',   icon: Loader2 },
  concluido:    { label: 'Concluído',    color: 'green',  icon: CheckCircle2 },
  cancelado:    { label: 'Cancelado',    color: 'red',    icon: XCircle },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

export const AtendimentosList: React.FC = () => {
  const navigate = useNavigate();
  const { atendimentos, loading, loadAtendimentos } = useServicoStore();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm]       = useState('');
  const [statusFilter, setStatusFilter]   = useState<string>('');
  const [activeRowId, setActiveRowId]     = useState<string | null>(null);
  const [contextMenu, setContextMenu]     = useState<{ id: string; x: number; y: number } | null>(null);
  const [docsAtendimento, setDocsAtendimento] = useState<AtendimentoResumoDoc | null>(null);
  const [baixaAtendimento, setBaixaAtendimento] = useState<AtendimentoBaixaRow | null>(null);
  const [aprovandoId, setAprovandoId] = useState<string | null>(null);

  useEffect(() => { loadAtendimentos(); }, [loadAtendimentos]);

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const filtered = atendimentos.filter((a) => {
    const q = searchTerm.toLowerCase();
    const repNome = (a.representante_nome || '').toLowerCase();
    const repContato = (a.representante_contato || '').toLowerCase();
    const matchSearch =
      a.codigo.toLowerCase().includes(q) ||
      a.cliente_nome.toLowerCase().includes(q) ||
      (a.falecido_nome?.toLowerCase().includes(q) ?? false) ||
      repNome.includes(q) ||
      repContato.includes(q);
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:       atendimentos.length,
    andamento:   atendimentos.filter(a => a.status === 'em_andamento').length,
    concluido:   atendimentos.filter(a => a.status === 'concluido').length,
    aguardando:  atendimentos.filter(a => a.status === 'aguardando').length,
  };

  const fmt = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const formatFormaPagamento = (forma: string) => {
    const map: Record<string, string> = {
      dinheiro: 'Dinheiro',
      pix: 'PIX',
      cartao_credito: 'Cartão crédito',
      cartao_debito: 'Cartão débito',
      boleto: 'Boleto',
      transferencia: 'Transferência',
      outro: 'Outro',
    };
    return map[forma] || forma;
  };

  const resumoPagamentos = (pagamentos: Array<{ forma: string; valor_centavos: number }> | undefined) => {
    if (!Array.isArray(pagamentos) || pagamentos.length === 0) return 'Não informado';
    return pagamentos.map((p) => `${formatFormaPagamento(p.forma)} ${fmt(Number(p.valor_centavos || 0))}`).join(' + ');
  };

  const VIAGEM_STATUS_BADGE: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    agendada:     { label: 'Viagem agendada', cls: 'bg-blue-50 text-blue-700 border-blue-200',     Icon: Calendar },
    em_andamento: { label: 'Em rota',         cls: 'bg-amber-50 text-amber-700 border-amber-200',  Icon: Navigation },
    concluida:    { label: 'Viagem concluída',cls: 'bg-green-50 text-green-700 border-green-200',  Icon: CheckCircle2 },
    cancelada:    { label: 'Viagem cancelada',cls: 'bg-red-50 text-red-700 border-red-200',        Icon: XCircle },
  };

  const ViagemIndicador: React.FC<{
    viagens?: { id: string; status: string; placa?: string | null; motorista_nome?: string | null; }[];
  }> = ({ viagens }) => {
    if (!viagens || viagens.length === 0) return null;
    // Prioridade visual: em_andamento > agendada > concluida > cancelada
    const priority = ['em_andamento', 'agendada', 'concluida', 'cancelada'];
    const sorted = [...viagens].sort(
      (a, b) => priority.indexOf(a.status) - priority.indexOf(b.status)
    );
    const principal = sorted[0];
    const config = VIAGEM_STATUS_BADGE[principal.status] || VIAGEM_STATUS_BADGE.agendada;
    const Icon = config.Icon;
    return (
      <button
        type="button"
        title={`Abrir viagem ${principal.placa ? '• ' + principal.placa : ''}${principal.motorista_nome ? ' • ' + principal.motorista_nome : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/frota/viagens/${principal.id}`);
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${config.cls} hover:brightness-95 transition`}
      >
        <Icon className="h-3 w-3" />
        {config.label}
        {viagens.length > 1 && (
          <span className="ml-1 bg-white/60 px-1 rounded text-[10px] font-bold">+{viagens.length - 1}</span>
        )}
      </button>
    );
  };

  const baixarOsPdf = async (atendimentoId: string) => {
    try {
      const r = await gerarOrdemServicoAtendimentoPdf(atendimentoId);
      if (!r) showToast('Não foi possível gerar o PDF. Verifique sua sessão.', 'error');
      else showToast('PDF da ordem de serviço gerado.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao gerar PDF.', 'error');
    }
  };

  const handleAprovarOs = async (atendimentoId: string) => {
    const nome = user?.nome?.trim() || user?.email || 'Usuário';
    setAprovandoId(atendimentoId);
    const res = await aprovarOsAtendimento(atendimentoId, nome);
    setAprovandoId(null);
    if (res.ok === false) {
      showToast(res.error, 'error');
      return;
    }
    showToast('Ordem de serviço aprovada.', 'success');
    await loadAtendimentos();
  };

  const toBaixaRow = (atd: (typeof atendimentos)[number]): AtendimentoBaixaRow => ({
    id: atd.id,
    codigo: atd.codigo,
    empresa_id: atd.empresa_id,
    cliente_id: atd.cliente_id,
    status: atd.status,
    valor_total_centavos: atd.valor_total_centavos,
    valor_pago_centavos: atd.valor_pago_centavos,
    os_aprovada: atd.os_aprovada,
    baixa_registrada_em: atd.baixa_registrada_em,
    pagamentos_divididos: atd.pagamentos_divididos,
    representante_nome: atd.representante_nome,
    representante_contato: atd.representante_contato,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimentos"
        subtitle="Gestão de serviços funerários"
        actionButton={
          <Button onClick={() => navigate('/atendimentos/novo')}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Atendimento
          </Button>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Geral',    value: stats.total,     color: 'border-gray-300',   text: 'text-gray-800' },
          { label: 'Em Andamento',   value: stats.andamento,  color: 'border-blue-400',   text: 'text-blue-700' },
          { label: 'Concluídos',     value: stats.concluido,  color: 'border-green-400',  text: 'text-green-700' },
          { label: 'Aguardando',     value: stats.aguardando, color: 'border-yellow-400', text: 'text-yellow-700' },
        ].map((s) => (
          <Card key={s.label} className={`p-4 text-center border-b-4 ${s.color}`}>
            <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wider">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.text}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por código, cliente ou falecido..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="aguardando">Aguardando</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </div>
          <Button variant="outline" onClick={() => loadAtendimentos()} disabled={loading} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código</th>
                <th className="px-5 py-3.5">Responsável</th>
                <th className="px-5 py-3.5">Falecido</th>
                <th className="px-5 py-3.5">Data do Serviço</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Valor Total</th>
                <th className="px-5 py-3.5 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Carregando atendimentos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                    Nenhum atendimento encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((atd) => (
                  <tr
                    key={atd.id}
                    className={`group transition-colors cursor-pointer ${
                      activeRowId === atd.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveRowId(atd.id)}
                    onDoubleClick={() => navigate(`/atendimentos/${atd.id}`)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: atd.id, x: e.clientX, y: e.clientY }); }}
                  >
                    {/* Código */}
                    <td className="px-5 py-4">
                      <span
                        className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/atendimentos/${atd.id}`); }}
                      >
                        {atd.codigo}
                      </span>
                    </td>

                    {/* Responsável */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{atd.cliente_nome}</div>
                          {(atd.representante_nome || atd.representante_contato) && (
                            <div className="text-xs text-gray-500">
                              Rep.: {atd.representante_nome || 'Não informado'}
                              {atd.representante_contato ? ` (${atd.representante_contato})` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Falecido */}
                    <td className="px-5 py-4">
                      {atd.falecido_nome ? (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Heart className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span>{atd.falecido_nome}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Não informado</span>
                      )}
                      {atd.viagens && atd.viagens.length > 0 && (
                        <div className="mt-1.5">
                          <ViagemIndicador viagens={atd.viagens as any} />
                        </div>
                      )}
                    </td>

                    {/* Data */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        {fmtDate(atd.data_servico)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={atd.status} />
                        {atd.os_aprovada && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            <ShieldCheck className="h-3 w-3" />
                            OS aprovada
                          </span>
                        )}
                        {atd.baixa_registrada_em && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                            <Wallet className="h-3 w-3" />
                            Baixa no caixa
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Valor */}
                    <td className="px-5 py-4 text-right">
                      <div className="font-semibold text-gray-900">{fmt(atd.valor_total_centavos)}</div>
                      {(atd.valor_pago_centavos > 0 || (Array.isArray(atd.pagamentos_divididos) && atd.pagamentos_divididos.length > 0)) && (
                        <div className="text-xs text-gray-500">
                          Pago: {fmt(atd.valor_pago_centavos || 0)}
                          <div>{resumoPagamentos(atd.pagamentos_divididos as Array<{ forma: string; valor_centavos: number }> | undefined)}</div>
                        </div>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-4 text-center">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-gray-200"
                        onClick={(e) => { e.stopPropagation(); setContextMenu({ id: atd.id, x: e.clientX, y: e.clientY }); }}
                      >
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-500 flex justify-between items-center">
            <span>Exibindo <strong>{filtered.length}</strong> de <strong>{atendimentos.length}</strong> atendimentos</span>
          </div>
        )}
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 w-56 overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const atdMenu = atendimentos.find((a) => a.id === contextMenu.id);
              const viagens = atdMenu?.viagens || [];
              const cancelado = atdMenu?.status === 'cancelado';
              const osAprovada = !!atdMenu?.os_aprovada;
              const jaRecebido = atdMenu ? atendimentoJaRecebido(atdMenu) : false;

              type MenuItem = {
                icon: React.ElementType;
                label: string;
                action?: () => void;
                tone?: 'default' | 'green' | 'blue' | 'amber';
                disabled?: boolean;
                title?: string;
              };

              const itens: MenuItem[] = [
                { icon: Eye, label: 'Visualizar', action: () => navigate(`/atendimentos/${contextMenu.id}`) },
                { icon: Edit, label: 'Editar', action: () => navigate(`/atendimentos/${contextMenu.id}`) },
                {
                  icon: ShieldCheck,
                  label: osAprovada ? 'OS já aprovada' : 'Aprovar OS',
                  tone: 'green',
                  disabled: cancelado || osAprovada || aprovandoId === contextMenu.id,
                  title: cancelado
                    ? 'Atendimento cancelado'
                    : osAprovada
                      ? `Aprovada por ${atdMenu?.os_aprovada_por || '—'}`
                      : 'Autoriza o recebimento no caixa',
                  action: () => void handleAprovarOs(contextMenu.id),
                },
                {
                  icon: Wallet,
                  label: 'Dar baixa no caixa',
                  tone: 'blue',
                  disabled: cancelado || jaRecebido || !osAprovada,
                  title: cancelado
                    ? 'Atendimento cancelado'
                    : jaRecebido
                      ? 'Baixa já registrada'
                      : !osAprovada
                        ? 'Aprove a OS antes da baixa'
                        : 'Registrar recebimento no caixa',
                  action: () => atdMenu && setBaixaAtendimento(toBaixaRow(atdMenu)),
                },
                {
                  icon: Receipt,
                  label: 'Faturar NF funeral',
                  disabled: true,
                  title: 'Em breve — módulo de nota fiscal ainda não habilitado',
                },
                { icon: Printer, label: 'Baixar OS (PDF)', action: () => void baixarOsPdf(contextMenu.id) },
                {
                  icon: FileText,
                  label: 'Documentos / Visualizar PDFs',
                  action: () => atdMenu && setDocsAtendimento(atdMenu as unknown as AtendimentoResumoDoc),
                },
              ];
              if (viagens.length === 1) {
                itens.splice(7, 0, {
                  icon: Truck,
                  label: 'Ver viagem de remoção',
                  tone: 'green',
                  action: () => navigate(`/frota/viagens/${viagens[0].id}`),
                });
              } else if (viagens.length > 1) {
                itens.splice(7, 0, {
                  icon: Truck,
                  label: `Ver viagens (${viagens.length})`,
                  tone: 'green',
                  action: () => navigate(`/frota/viagens?atendimento=${contextMenu.id}`),
                });
              }
              return itens;
            })().map(({ icon: Icon, label, action, tone, disabled, title }) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                title={title}
                onClick={() => {
                  if (disabled || !action) return;
                  action();
                  setContextMenu(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                  tone === 'green'
                    ? 'text-emerald-700 hover:bg-emerald-50 disabled:hover:bg-transparent'
                    : tone === 'blue'
                      ? 'text-blue-700 hover:bg-blue-50 disabled:hover:bg-transparent'
                      : 'text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${
                  tone === 'green' ? 'text-emerald-500' : tone === 'blue' ? 'text-blue-500' : 'text-gray-400'
                }`} />
                {label}
              </button>
            ))}
            <div className="border-t my-1" />
            <button
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Cancelar Atendimento
            </button>
          </div>
        </>
      )}

      <DocumentosAtendimentoModal
        isOpen={!!docsAtendimento}
        onClose={() => setDocsAtendimento(null)}
        atendimento={docsAtendimento}
      />

      <BaixaAtendimentoModal
        isOpen={!!baixaAtendimento}
        onClose={() => setBaixaAtendimento(null)}
        atendimento={baixaAtendimento}
        onSuccess={() => void loadAtendimentos()}
      />
    </div>
  );
};
