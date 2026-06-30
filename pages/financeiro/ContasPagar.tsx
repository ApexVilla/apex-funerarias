import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Search, Plus, CreditCard, FileText, CheckCircle, Undo2, Trash2, Pencil, X, Save, AlertCircle, Printer, RefreshCw, Loader2, Filter, AlertTriangle, TrendingDown, Calendar, DollarSign, Layers, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';
import { imprimirReciboContaPagar } from '../../lib/ReciboService';
import { useAuth } from '../../lib/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawRelatorioComissaoFenixHeader, drawDocumentoPdfFooter, PDF_PALETTE } from '../../lib/documentoPdfLayout';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos, ContaPagar } from '../../lib/FinanceiroStore';
import { StatusFinanceiroBadge, EmptyFinanceiro, FinanceiroLoading, MoneyDisplay, StatCard } from '../../components/financeiro/FinanceiroComponents';
import { contaPagarCodigoMatch } from '../../lib/proximoCodigoContaPagar';
import { contaPagarEstaVencida, contaPagarStatusEfetivo } from '../../lib/finContaPagarStatus';
import { useFilial } from '../../lib/FilialContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { BaixarContaPagarModal } from '../../components/financeiro/BaixarContaPagarModal';
import { DetalhesContaPagarModal } from '../../components/financeiro/DetalhesContaPagarModal';
import { NovaContaPagarModal } from '../../components/financeiro/NovaContaPagarModal';
import { inferirTipoDocumentoPagar } from '../../lib/inferirTipoDocumento';
import { supabase } from '../../lib/supabase';

const TIPOS_DOCUMENTO: Array<{ value: string; label: string }> = [
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'conta_luz', label: 'Conta de luz' },
    { value: 'conta_agua', label: 'Conta de água' },
    { value: 'internet', label: 'Internet / Telefone' },
    { value: 'aluguel', label: 'Aluguel' },
    { value: 'imposto', label: 'Imposto' },
    { value: 'salario', label: 'Salário' },
    { value: 'servico', label: 'Serviço' },
    { value: 'taxa_bancaria', label: 'Taxa bancária' },
    { value: 'seguro', label: 'Seguro' },
    { value: 'combustivel', label: 'Combustível' },
    { value: 'frete', label: 'Frete' },
    { value: 'honorario', label: 'Honorário' },
    { value: 'manutencao', label: 'Manutenção' },
    { value: 'material', label: 'Material' },
    { value: 'outros', label: 'Outros' },
];

type ColumnFilterKey = 'codigo' | 'fornecedor' | 'unidade' | 'tipo' | 'natureza' | 'vencimento' | 'pagamento' | 'valor' | 'status' | 'nf';

const COLUMN_FILTER_LABELS: Record<ColumnFilterKey, string> = {
    codigo: 'Código',
    fornecedor: 'Fornecedor',
    unidade: 'Unidade',
    tipo: 'Tipo',
    natureza: 'Natureza',
    vencimento: 'Vencimento',
    pagamento: 'Pagamento',
    valor: 'Valor',
    status: 'Status',
    nf: 'NF',
};

type FiltroDataCampo = 'vencimento' | 'pagamento';

const STATUS_CP_LABELS: Record<string, string> = {
    aberto: 'Aberto',
    pago: 'Pago',
    pago_parcial: 'Parcial',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
    aprovado: 'Aprovado',
    pendente: 'Pendente',
    renegociado: 'Renegociado',
};

const labelTipoDocumento = (tipo?: string | null) =>
    TIPOS_DOCUMENTO.find((t) => t.value === tipo)?.label || (tipo || '—').replace(/_/g, ' ');

const EMPTY_COLUMN_FILTERS: Record<ColumnFilterKey, string[]> = {
    codigo: [],
    fornecedor: [],
    unidade: [],
    tipo: [],
    natureza: [],
    vencimento: [],
    pagamento: [],
    valor: [],
    status: [],
    nf: [],
};

const formatDataBr = (iso?: string | null) =>
    iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';

const parseValorFiltroCentavos = (input: string): number | null => {
    const raw = input.replace(/\D/g, '');
    if (!raw) return null;
    return parseInt(raw, 10);
};

const addMesesCp = (yyyymmdd: string, meses: number): string => {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const data = new Date(y, m - 1 + meses, d);
    return data.toISOString().split('T')[0];
};

const addMesesYmCp = (ym: string, meses: number): string => {
    const [y, m] = ym.split('-').map(Number);
    const data = new Date(y, m - 1 + meses, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
};

const stripSufixoParcelaCp = (desc: string) => desc.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

interface EditarContaPagarModalProps {
    conta: ContaPagar;
    onClose: () => void;
    onSuccess: () => void;
    updateContaPagar: (id: string, data: Partial<ContaPagar>) => Promise<boolean>;
    criarContaPagar: (data: Partial<ContaPagar>) => Promise<string | null>;
}

const EditarContaPagarModal: React.FC<EditarContaPagarModalProps> = ({
    conta,
    onClose,
    onSuccess,
    updateContaPagar,
    criarContaPagar,
}) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const podeParcelar =
        conta.valor_pago_centavos === 0 && (conta.total_parcelas || 1) <= 1;

    const [descricao, setDescricao] = useState(stripSufixoParcelaCp(conta.descricao || ''));
    const [fornecedorNome, setFornecedorNome] = useState(conta.fornecedor_nome || '');
    const [numeroNF, setNumeroNF] = useState(conta.numero_nota_fiscal || '');
    const [dataVencimento, setDataVencimento] = useState(conta.data_vencimento || '');
    const [dataCompetenciaYm, setDataCompetenciaYm] = useState(
        conta.data_competencia ? conta.data_competencia.slice(0, 7) : ''
    );
    const [valorInput, setValorInput] = useState((conta.valor_original_centavos / 100).toFixed(2));
    const [valorCentavos, setValorCentavos] = useState(conta.valor_original_centavos);
    const [observacoes, setObservacoes] = useState((conta as { observacoes?: string }).observacoes || '');
    const [parcelar, setParcelar] = useState(false);
    const [totalParcelas, setTotalParcelas] = useState(2);

    const valorPorParcela = useMemo(() => {
        if (!parcelar || totalParcelas <= 1) return valorCentavos;
        return Math.floor(valorCentavos / totalParcelas);
    }, [parcelar, totalParcelas, valorCentavos]);

    const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const c = parseInt(raw) || 0;
        setValorCentavos(c);
        setValorInput((c / 100).toFixed(2));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!descricao.trim()) { setError('Informe uma descrição.'); return; }
        if (!dataVencimento) { setError('Informe a data de vencimento.'); return; }
        if (valorCentavos <= 0) { setError('Informe um valor maior que zero.'); return; }

        const nParcelas = parcelar && podeParcelar
            ? Math.max(2, Math.min(60, totalParcelas))
            : 1;

        setSaving(true);
        try {
            const tipoDocumento = inferirTipoDocumentoPagar({
                fornecedorId: conta.fornecedor_id,
                descricao: descricao.trim(),
                naturezaFinanceira: conta.natureza_financeira,
            });

            const contaExtra = conta as ContaPagar & {
                centro_custo_id?: string;
                forma_pagamento_id?: string;
                conta_bancaria_id?: string;
                observacoes?: string;
            };

            if (nParcelas > 1) {
                const baseDesc = stripSufixoParcelaCp(descricao.trim());
                const parcelaBase = Math.floor(valorCentavos / nParcelas);
                const resto = valorCentavos - parcelaBase * nParcelas;

                for (let i = 0; i < nParcelas; i++) {
                    const valor = parcelaBase + (i === nParcelas - 1 ? resto : 0);
                    const venc = i === 0 ? dataVencimento : addMesesCp(dataVencimento, i);
                    const compYm = dataCompetenciaYm
                        ? (i === 0 ? dataCompetenciaYm : addMesesYmCp(dataCompetenciaYm, i))
                        : '';
                    const comp = compYm ? `${compYm}-01` : conta.data_competencia;
                    const descricaoFinal = `${baseDesc} (${i + 1}/${nParcelas})`;

                    const payload: Partial<ContaPagar> & {
                        centro_custo_id?: string;
                        forma_pagamento_id?: string;
                        conta_bancaria_id?: string;
                        observacoes?: string;
                    } = {
                        fornecedor_id: conta.fornecedor_id,
                        fornecedor_nome: fornecedorNome.trim() || conta.fornecedor_nome,
                        tipo_documento: tipoDocumento,
                        descricao: descricaoFinal,
                        numero_nota_fiscal: numeroNF.trim() || undefined,
                        plano_conta_id: conta.plano_conta_id,
                        centro_custo_id: contaExtra.centro_custo_id,
                        forma_pagamento_id: contaExtra.forma_pagamento_id,
                        conta_bancaria_id: contaExtra.conta_bancaria_id,
                        valor_original_centavos: valor,
                        valor_juros_centavos: 0,
                        valor_multa_centavos: 0,
                        valor_desconto_centavos: 0,
                        valor_pago_centavos: 0,
                        data_emissao: conta.data_emissao,
                        data_vencimento: venc,
                        data_competencia: comp,
                        parcela_numero: i + 1,
                        total_parcelas: nParcelas,
                        status: 'aberto',
                        requer_aprovacao: conta.requer_aprovacao,
                        observacoes: observacoes.trim() || undefined,
                        ...(conta.filial_id ? { filial_id: conta.filial_id } : {}),
                    };

                    if (i === 0) {
                        const ok = await updateContaPagar(conta.id, payload);
                        if (!ok) throw new Error('Erro ao atualizar a primeira parcela.');
                    } else {
                        const newId = await criarContaPagar(payload);
                        if (!newId) throw new Error(`Erro ao criar a parcela ${i + 1}.`);
                    }
                }
                onSuccess();
                return;
            }

            const ok = await updateContaPagar(conta.id, {
                descricao: descricao.trim(),
                tipo_documento: tipoDocumento,
                fornecedor_nome: fornecedorNome.trim() || undefined,
                numero_nota_fiscal: numeroNF.trim() || undefined,
                data_vencimento: dataVencimento,
                data_competencia: dataCompetenciaYm ? `${dataCompetenciaYm}-01` : undefined,
                valor_original_centavos: valorCentavos,
                observacoes: observacoes.trim() || undefined,
            } as Partial<ContaPagar> & { observacoes?: string });
            if (ok) {
                onSuccess();
            } else {
                setError('Erro ao salvar alterações.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0 border-l-4 border-slate-800 pl-3">
                        <div className="min-w-0">
                            <h2 className="text-base font-bold uppercase tracking-wider text-slate-900">Editar Conta a Pagar</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Código do Título: {conta.codigo}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-200 rounded-md transition text-slate-500 hover:text-slate-800"
                        aria-label="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md flex items-center gap-2 text-xs font-semibold">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" /> {error}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Descrição *</label>
                            <input
                                type="text"
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Fornecedor</label>
                            <input
                                type="text"
                                value={fornecedorNome}
                                onChange={(e) => setFornecedorNome(e.target.value)}
                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Valor Original (R$) *</label>
                                <input
                                    type="text"
                                    value={valorInput}
                                    onChange={handleValorChange}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition font-semibold text-slate-900"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Nº Nota Fiscal</label>
                                <input
                                    type="text"
                                    value={numeroNF}
                                    onChange={(e) => setNumeroNF(e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Vencimento *</label>
                                <input
                                    type="date"
                                    value={dataVencimento}
                                    onChange={(e) => setDataVencimento(e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition font-semibold text-slate-900"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Competência (Mês/Ano)</label>
                                <input
                                    type="month"
                                    value={dataCompetenciaYm}
                                    onChange={(e) => setDataCompetenciaYm(e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Observações</label>
                            <textarea
                                value={observacoes}
                                onChange={(e) => setObservacoes(e.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none resize-none placeholder:text-slate-400"
                                placeholder="Notas internas sobre essa alteração..."
                            />
                        </div>

                        {podeParcelar && (
                            <div className="rounded-md border border-slate-200 bg-slate-100/40 p-4 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={parcelar}
                                        onChange={(e) => setParcelar(e.target.checked)}
                                        className="h-4 w-4 rounded-sm border-slate-300 text-slate-800 focus:ring-slate-800"
                                    />
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5" />
                                        Dividir o valor total em parcelas
                                    </span>
                                </label>
                                {parcelar && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-7 animate-in slide-in-from-top-1 duration-150">
                                        <div className="space-y-1">
                                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                                Quantidade de Parcelas
                                            </label>
                                            <input
                                                type="number"
                                                min={2}
                                                max={60}
                                                value={totalParcelas}
                                                onChange={(e) =>
                                                    setTotalParcelas(Math.max(2, parseInt(e.target.value) || 2))
                                                }
                                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                            />
                                        </div>
                                        <div className="space-y-1 sm:col-span-2 flex flex-col justify-end">
                                            <p className="text-[11px] text-slate-600 font-semibold pb-2">
                                                Valor por parcela estimado:{' '}
                                                <span className="font-bold text-slate-900">
                                                    R$ {(valorPorParcela / 100).toLocaleString('pt-BR', {
                                                        minimumFractionDigits: 2,
                                                    })}
                                                </span>
                                                {valorCentavos > 0 &&
                                                    totalParcelas > 0 &&
                                                    valorCentavos % totalParcelas !== 0 && (
                                                        <span className="text-amber-700 ml-1.5 font-bold">
                                                            (diferença ajustada na última parcela)
                                                        </span>
                                                    )}
                                            </p>
                                            <p className="text-[10px] text-slate-500">
                                                O título atual vira a 1ª parcela; as demais serão criadas com vencimentos mensais.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!podeParcelar && conta.valor_pago_centavos > 0 && (
                            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 font-medium">
                                Parcelamento indisponível: este título já possui pagamento registrado.
                            </p>
                        )}

                        {!podeParcelar && conta.valor_pago_centavos === 0 && (conta.total_parcelas || 1) > 1 && (
                            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-medium">
                                Este título já faz parte de um parcelamento ({conta.parcela_numero}/{conta.total_parcelas}).
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-sm transition flex items-center gap-2 outline-none disabled:opacity-50"
                        >
                            {saving ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            {saving ? 'Salvando…' : parcelar && podeParcelar && totalParcelas > 1
                                ? `Salvar e criar ${totalParcelas} parcelas`
                                : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


function primeiroDiaMes(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ultimoDiaMes(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export const ContasPagar: React.FC = () => {
    const { contasPagar, loadContasPagar, loading, estornarContaPagar, excluirContaPagar, updateContaPagar, criarContaPagar, planoContas, loadPlanoContas } = useFinanceiro();
    const { dataRevision, isTodasFiliais, filiais } = useFilial();
    const { dataRevisionEmpresa, empresaIdEfetivo, empresasDoGrupo, empresaIdsParaFiltro, visaoTodasEmpresasGrupo } = useEmpresaContextoAtivo();
    const visaoConsolidada =
        (visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1) ||
        (isTodasFiliais && filiais.length > 1);
    const mostrarColunaUnidade = visaoConsolidada;
    const [filiaisGrupo, setFiliaisGrupo] = useState<Array<{ id: string; nome: string; empresa_id: string }>>([]);

    useEffect(() => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (!visaoConsolidada || ids.length === 0) {
            setFiliaisGrupo([]);
            return;
        }
        let cancelled = false;
        supabase
            .from('filiais')
            .select('id, nome, empresa_id')
            .in('empresa_id', ids)
            .eq('ativo', true)
            .order('nome')
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.error('Erro ao carregar filiais do grupo (pagar):', error);
                    setFiliaisGrupo([]);
                    return;
                }
                setFiliaisGrupo((data || []) as Array<{ id: string; nome: string; empresa_id: string }>);
            });
        return () => {
            cancelled = true;
        };
    }, [visaoConsolidada, empresaIdsParaFiltro, dataRevisionEmpresa]);

    const filiaisParaMapa = filiaisGrupo.length > 0 ? filiaisGrupo : filiais;
    const filialNomePorId = useMemo(() => {
        const m = new Map<string, string>();
        filiaisParaMapa.forEach((f) => m.set(f.id, f.nome));
        return m;
    }, [filiaisParaMapa]);
    const filialEmpresaPorId = useMemo(() => {
        const m = new Map<string, string>();
        filiaisGrupo.forEach((f) => m.set(f.id, f.empresa_id));
        return m;
    }, [filiaisGrupo]);
    const empresaNomePorId = useMemo(() => {
        const m = new Map<string, string>();
        empresasDoGrupo.forEach((e) => m.set(e.id, e.nome));
        return m;
    }, [empresasDoGrupo]);
    const { user, empresa } = useAuth();
    const empresaIdsBaixas = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );

    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === (empresaIdEfetivo || user?.empresa_id))?.nome || empresa?.nome || '',
        [empresasDoGrupo, empresaIdEfetivo, user, empresa]
    );

    const [showRelatorioModal, setShowRelatorioModal] = useState(false);
    const [reportTipo, setReportTipo] = useState<'todos' | 'pago' | 'vencido' | 'aberto'>('todos');
    const [reportAgrupamento, setReportAgrupamento] = useState<'nenhum' | 'dia' | 'mes' | 'fornecedor' | 'tipo' | 'natureza' | 'unidade'>('nenhum');

    const gerarRelatorioPdf = async () => {
        let itens = [...filtered];
        if (reportTipo === 'pago') {
            itens = itens.filter(c => c.status === 'pago');
        } else if (reportTipo === 'vencido') {
            itens = itens.filter(c => contaPagarEstaVencida(c));
        } else if (reportTipo === 'aberto') {
            itens = itens.filter(c => ['aberto', 'aprovado'].includes(c.status) && !contaPagarEstaVencida(c));
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();

        const statusLabel = reportTipo === 'todos' ? 'Todos os Títulos' :
                            reportTipo === 'pago' ? 'Títulos Quitados (Pagos)' :
                            reportTipo === 'vencido' ? 'Títulos Vencidos' : 'Títulos em Aberto';
        
        const agrupamentoLabel = reportAgrupamento === 'nenhum' ? 'Lista Detalhada' :
                                 reportAgrupamento === 'dia' ? 'Agrupado por Dia' :
                                 reportAgrupamento === 'mes' ? 'Agrupado por Mês' :
                                 reportAgrupamento === 'fornecedor' ? 'Agrupado por Fornecedor' :
                                 reportAgrupamento === 'tipo' ? 'Agrupado por Tipo de Documento' :
                                 reportAgrupamento === 'unidade' ? 'Agrupado por Unidade' : 'Agrupado por Natureza Financeira';

        const dataInfoStr = dataInicio && dataFim 
            ? `Período: ${formatDataBr(dataInicio)} a ${formatDataBr(dataFim)}` 
            : 'Período: Sem limite de data';

        let startY = await drawRelatorioComissaoFenixHeader(doc, W, {
            subtituloModulo: 'Relatório de Contas a Pagar',
            badgeTitulo: `${statusLabel.toUpperCase()} - ${agrupamentoLabel.toUpperCase()}`,
            badgeSubtitulo: dataInfoStr,
            empresaLogoUrl: empresa?.logo_url,
            empresaCnpj: empresa?.cnpj || undefined,
            unidadeNome: empresaNomeAtual,
        });

        startY += 8;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text('Parâmetros do Relatório:', PDF_PALETTE.MX, startY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
        
        let filtroTxt = `Filtro de busca: ${searchTerm || 'Nenhum'} | Tipo de período: por data de ${filtroDataCampo}`;
        if (statusFilter) filtroTxt += ` | Status na tela: ${STATUS_CP_LABELS[statusFilter] || statusFilter}`;
        if (tipoFilter) filtroTxt += ` | Tipo de doc: ${labelTipoDocumento(tipoFilter)}`;
        if (naturezaFilter) {
            const catNome = planoContas.find(p => p.id === naturezaFilter)?.nome || naturezaFilter;
            filtroTxt += ` | Categoria: ${catNome}`;
        }
        
        startY += 4;
        doc.text(filtroTxt, PDF_PALETTE.MX, startY);

        startY += 6;

        let tableHeaders: string[][] = [];
        let tableBody: any[][] = [];

        if (reportAgrupamento === 'nenhum') {
            tableHeaders = [['FORNECEDOR / CÓDIGO', 'DESCRIÇÃO / DOCUMENTO', 'VENCIMENTO / PAGAMENTO', 'VALORES (R$)', 'STATUS']];
            tableBody = itens.map(cp => {
                const statusEx = contaPagarStatusEfetivo(cp);
                const isVencido = contaPagarEstaVencida(cp);
                const statusStr = isVencido ? 'VENCIDO' : (STATUS_CP_LABELS[statusEx] || statusEx).toUpperCase();
                
                const codFornecedor = `${(cp.fornecedor_nome || '—').toUpperCase()}\nCÓD: ${(cp.codigo || '—').toUpperCase()}`;
                const tipoStr = cp.tipo_documento && cp.tipo_documento !== 'fornecedor'
                    ? `\nTIPO: ${labelTipoDocumento(cp.tipo_documento).toUpperCase()}`
                    : '';
                const descTipo = `${cp.descricao.toUpperCase()}${tipoStr}`;
                const datas = `VENC: ${formatDataBr(cp.data_vencimento)}\nPAGTO: ${cp.data_pagamento ? formatDataBr(cp.data_pagamento) : '—'}`;
                const valores = `ORIG: ${formatCentavos(cp.valor_total_centavos)}\nABTO: ${formatCentavos(cp.valor_aberto_centavos)}`;
                
                return [
                    codFornecedor,
                    descTipo,
                    datas,
                    valores,
                    statusStr
                ];
            });

            const sumOriginal = itens.reduce((s, c) => s + (c.valor_total_centavos || 0), 0);
            const sumAberto = itens.reduce((s, c) => s + (c.valor_aberto_centavos || 0), 0);
            tableBody.push([
                { content: 'TOTAIS DO PERÍODO FILTRADO', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [250, 250, 250] } },
                { content: `ORIGINAL: ${formatCentavos(sumOriginal)}\nEM ABERTO: ${formatCentavos(sumAberto)}`, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } },
                { content: '', styles: { fillColor: [250, 250, 250] } }
            ]);
        } else {
            const grupos = new Map<string, { original: number; aberto: number; pago: number; qtd: number }>();
            
            itens.forEach(cp => {
                let key = '';
                if (reportAgrupamento === 'dia') {
                    key = filtroDataCampo === 'pagamento' && cp.data_pagamento 
                        ? formatDataBr(cp.data_pagamento)
                        : formatDataBr(cp.data_vencimento);
                } else if (reportAgrupamento === 'mes') {
                    const dataRef = filtroDataCampo === 'pagamento' && cp.data_pagamento
                        ? cp.data_pagamento
                        : cp.data_vencimento;
                    key = dataRef ? formatDataBr(dataRef).slice(3) : 'Sem Data';
                } else if (reportAgrupamento === 'fornecedor') {
                    key = (cp.fornecedor_nome || '').trim() || 'Fornecedor não informado';
                } else if (reportAgrupamento === 'tipo') {
                    key = labelTipoDocumento(cp.tipo_documento);
                } else if (reportAgrupamento === 'natureza') {
                    key = (cp.natureza_financeira || '').trim() || 'Natureza não informada';
                } else if (reportAgrupamento === 'unidade') {
                    key = nomeUnidadeConta(cp);
                }

                const actual = grupos.get(key) || { original: 0, aberto: 0, pago: 0, qtd: 0 };
                actual.original += cp.valor_total_centavos || 0;
                actual.aberto += cp.valor_aberto_centavos || 0;
                actual.pago += cp.valor_pago_centavos || 0;
                actual.qtd += 1;
                grupos.set(key, actual);
            });

            const sortedKeys = Array.from(grupos.keys()).sort((a, b) => {
                if (reportAgrupamento === 'dia') {
                    const [da, ma, ya] = a.split('/').map(Number);
                    const [db, mb, yb] = b.split('/').map(Number);
                    return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
                }
                if (reportAgrupamento === 'mes') {
                    const [ma, ya] = a.split('/').map(Number);
                    const [mb, yb] = b.split('/').map(Number);
                    return new Date(ya, ma - 1, 1).getTime() - new Date(yb, mb - 1, 1).getTime();
                }
                return a.localeCompare(b, 'pt-BR');
            });

            const colName = reportAgrupamento === 'dia' ? 'DIA' :
                            reportAgrupamento === 'mes' ? 'MÊS / ANO' :
                            reportAgrupamento === 'fornecedor' ? 'FORNECEDOR' :
                            reportAgrupamento === 'tipo' ? 'TIPO DE DOCUMENTO' :
                            reportAgrupamento === 'unidade' ? 'UNIDADE' : 'NATUREZA FINANCEIRA (CATEGORIA)';

            tableHeaders = [[colName, 'QTD TÍTULOS', 'TOTAL ORIGINAL', 'TOTAL EM ABERTO', 'TOTAL PAGO']];
            
            let totalOriginal = 0;
            let totalAberto = 0;
            let totalPago = 0;
            let totalQtd = 0;

            sortedKeys.forEach(k => {
                const val = grupos.get(k)!;
                totalOriginal += val.original;
                totalAberto += val.aberto;
                totalPago += val.pago;
                totalQtd += val.qtd;

                tableBody.push([
                    k.toUpperCase(),
                    String(val.qtd),
                    formatCentavos(val.original),
                    formatCentavos(val.aberto),
                    formatCentavos(val.pago)
                ]);
            });

            tableBody.push([
                { content: 'TOTAL GERAL', styles: { fontStyle: 'bold' } },
                { content: String(totalQtd), styles: { fontStyle: 'bold' } },
                { content: formatCentavos(totalOriginal), styles: { fontStyle: 'bold' } },
                { content: formatCentavos(totalAberto), styles: { fontStyle: 'bold' } },
                { content: formatCentavos(totalPago), styles: { fontStyle: 'bold' } }
            ]);
        }

        autoTable(doc, {
            startY: startY + 4,
            head: tableHeaders,
            body: tableBody,
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
            didDrawPage: (data) => {
                const H = doc.internal.pageSize.getHeight();
                drawDocumentoPdfFooter(doc, W, H, {
                    empresaNome: empresaNomeAtual || 'FENIX FUNERÁRIA',
                    linhaCentral: 'RELATÓRIO DE CONTAS A PAGAR',
                    linhaInferior: `Página ${data.pageNumber}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`,
                });
            }
        });

        doc.save(`relatorio-contas-pagar-${statusLabel.toLowerCase().replace(/\s+/g, '-')}-${agrupamentoLabel.toLowerCase().replace(/\s+/g, '-')}.pdf`);
        setShowRelatorioModal(false);
    };

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [naturezaFilter, setNaturezaFilter] = useState('');
    const [filtroDataCampo, setFiltroDataCampo] = useState<FiltroDataCampo>('vencimento');
    const [dataInicio, setDataInicio] = useState(primeiroDiaMes());
    const [dataFim, setDataFim] = useState(ultimoDiaMes());
    const [valorMinInput, setValorMinInput] = useState('');
    const [valorMaxInput, setValorMaxInput] = useState('');
    const [showNovaContaModal, setShowNovaContaModal] = useState(false);

    // Estado de Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    // State for actions
    const [selectedConta, setSelectedConta] = useState<any>(null); // Using any to avoid strict type issues with props, or assume ContaPagar matches
    const [showBaixarModal, setShowBaixarModal] = useState(false);
    const [showDetalhesModal, setShowDetalhesModal] = useState(false);
    const [showEditarModal, setShowEditarModal] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const [columnFilters, setColumnFilters] = useState<Record<ColumnFilterKey, string[]>>(EMPTY_COLUMN_FILTERS);
    const [filterMenuColumn, setFilterMenuColumn] = useState<ColumnFilterKey | null>(null);
    const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const [baixasPeriodo, setBaixasPeriodo] = useState({ total: 0, qtd: 0 });
    const [activeTab, setActiveTab] = useState<'lista' | 'graficos'>('lista');

    const valorMinCentavos = useMemo(() => parseValorFiltroCentavos(valorMinInput), [valorMinInput]);
    const valorMaxCentavos = useMemo(() => parseValorFiltroCentavos(valorMaxInput), [valorMaxInput]);
    const hasValorRangeFilter = valorMinCentavos != null || valorMaxCentavos != null;

    const handleValorFiltroChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        setter: React.Dispatch<React.SetStateAction<string>>,
    ) => {
        const raw = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(raw, 10) || 0;
        setter(raw ? (centavos / 100).toFixed(2) : '');
    };

    useEffect(() => {
        loadPlanoContas();
    }, [loadPlanoContas]);

    const nomeUnidadeConta = useCallback(
        (cp: ContaPagar) => {
            const empresaIdTitulo =
                (cp.filial_id ? filialEmpresaPorId.get(cp.filial_id) : undefined) || cp.empresa_id;
            const partes: string[] = [];
            if (visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1) {
                const emp = empresaNomePorId.get(empresaIdTitulo);
                if (emp) partes.push(emp);
            }
            const filNome =
                cp.filial_nome ||
                (cp.filial_id ? filialNomePorId.get(cp.filial_id) : undefined);
            if (filNome && isTodasFiliais && filiaisParaMapa.length > 1) {
                partes.push(filNome);
            } else if (!partes.length && filNome) {
                partes.push(filNome);
            }
            if (partes.length > 0) return partes.join(' · ');
            if (cp.filial_id) return filialNomePorId.get(cp.filial_id) || 'Sem unidade';
            return empresaNomePorId.get(empresaIdTitulo) || 'Sem unidade';
        },
        [
            visaoTodasEmpresasGrupo,
            empresaIdsParaFiltro.length,
            empresaNomePorId,
            filialNomePorId,
            filialEmpresaPorId,
            isTodasFiliais,
            filiaisParaMapa.length,
        ],
    );

    const rotuloEmpresaConta = useCallback(
        (cp: ContaPagar) => {
            const empresaIdTitulo =
                (cp.filial_id ? filialEmpresaPorId.get(cp.filial_id) : undefined) || cp.empresa_id;
            return empresaNomePorId.get(empresaIdTitulo) || '—';
        },
        [filialEmpresaPorId, empresaNomePorId],
    );

    const rotuloFilialConta = useCallback(
        (cp: ContaPagar) => {
            if (cp.filial_nome) return cp.filial_nome;
            if (cp.filial_id) return filialNomePorId.get(cp.filial_id) || '—';
            return '—';
        },
        [filialNomePorId],
    );

    const getRowValueForFilter = (cp: ContaPagar, columnKey: ColumnFilterKey): string => {
        switch (columnKey) {
            case 'codigo':
                return (cp.codigo || '').trim() || '—';
            case 'fornecedor':
                return (cp.fornecedor_nome || '').trim() || '—';
            case 'unidade':
                return nomeUnidadeConta(cp);
            case 'tipo':
                return labelTipoDocumento(cp.tipo_documento);
            case 'natureza':
                return (cp.natureza_financeira || '').trim() || '—';
            case 'vencimento':
                return formatDataBr(cp.data_vencimento);
            case 'pagamento':
                return formatDataBr(cp.data_pagamento);
            case 'valor':
                return String(cp.valor_total_centavos ?? 0);
            case 'status':
                return contaPagarStatusEfetivo(cp) || '—';
            case 'nf':
                return (cp.numero_nota_fiscal || '').trim() || '—';
            default:
                return '';
        }
    };

    const getFriendlyFilterLabel = (columnKey: ColumnFilterKey, val: string): string => {
        if (columnKey === 'status') return STATUS_CP_LABELS[val] || val;
        if (columnKey === 'valor') {
            const centavos = Number(val);
            return formatCentavos(Number.isFinite(centavos) ? centavos : 0);
        }
        return val;
    };

    const getUniqueValuesForColumn = (columnKey: ColumnFilterKey): string[] => {
        const set = new Set<string>();
        contasEnriquecidas.forEach((cp) => set.add(getRowValueForFilter(cp, columnKey)));
        const values = Array.from(set);
        if (columnKey === 'valor') {
            return values.sort((a, b) => Number(a) - Number(b));
        }
        return values.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    };

    const handleOpenFilterMenu = (columnKey: ColumnFilterKey, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        if (filterMenuColumn === columnKey) {
            setFilterMenuColumn(null);
            setFilterMenuPosition(undefined);
            setDropdownSearch('');
        } else {
            const rect = event.currentTarget.getBoundingClientRect();
            const popupWidth = 256;
            let left = rect.left;
            if (rect.left + popupWidth > window.innerWidth) left = Math.max(8, rect.right - popupWidth);
            setFilterMenuPosition({ x: left, y: rect.bottom + 4 });
            setFilterMenuColumn(columnKey);
            setDropdownSearch('');
        }
    };

    const handleToggleColumnFilter = (columnKey: ColumnFilterKey, value: string) => {
        setColumnFilters((prev) => {
            const current = prev[columnKey];
            const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
            return { ...prev, [columnKey]: updated };
        });
    };

    const clearAllColumnFilters = () => setColumnFilters(EMPTY_COLUMN_FILTERS);

    const hasActiveColumnFilters = Object.values(columnFilters).some((arr) => arr.length > 0);

    const ThComFiltro: React.FC<{
        label: string;
        columnKey?: ColumnFilterKey;
        align?: 'left' | 'right' | 'center';
    }> = ({ label, columnKey, align = 'left' }) => {
        const active = columnKey ? columnFilters[columnKey].length > 0 : false;
        const alignCls =
            align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'text-left';
        return (
            <th className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}>
                {columnKey ? (
                    <div className={`flex items-center gap-1 select-none ${alignCls}`}>
                        <span>{label}</span>
                        <button
                            type="button"
                            onClick={(e) => handleOpenFilterMenu(columnKey, e)}
                            className={`p-1 rounded transition-colors ${
                                active
                                    ? 'text-white bg-white/25 ring-1 ring-white/40'
                                    : 'text-blue-100 hover:text-white hover:bg-white/15'
                            }`}
                            title={`Filtrar ${label}`}
                        >
                            <Filter className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    label
                )}
            </th>
        );
    };

    const openRowMenu = (cp: any, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        setMenuPosition({
            y: event.clientY,
            x: event.clientX,
        });
        setSelectedConta(cp);
        setActiveMenuId(activeMenuId === cp.id ? null : cp.id);
    };

    useEffect(() => {
        const handleInteraction = () => activeMenuId && setActiveMenuId(null);
        window.addEventListener('scroll', handleInteraction, true);
        window.addEventListener('resize', handleInteraction);
        return () => {
            window.removeEventListener('scroll', handleInteraction, true);
            window.removeEventListener('resize', handleInteraction);
        };
    }, [activeMenuId]);


    const buscaAtiva = searchTerm.trim().length >= 2;

    const carregarBaixasPeriodo = useCallback(async (de: string, ate: string) => {
        if (!empresaIdsBaixas.length) return { total: 0, qtd: 0 };
        const pageSize = 1000;
        const maxRows = 20000;
        let total = 0;
        let qtd = 0;

        for (let offset = 0; offset < maxRows; offset += pageSize) {
            let q = supabase
                .from('fin_contas_pagar_baixas')
                .select('valor_pago_centavos')
                .eq('estornada', false)
                .gte('data_baixa', de)
                .lte('data_baixa', ate);
            if (empresaIdsBaixas.length === 1) q = q.eq('empresa_id', empresaIdsBaixas[0]);
            else q = q.in('empresa_id', empresaIdsBaixas);
            const { data, error } = await q.range(offset, offset + pageSize - 1);
            if (error) throw error;
            const rows = data ?? [];
            if (rows.length === 0) break;
            qtd += rows.length;
            total += rows.reduce((s, b) => s + (b.valor_pago_centavos || 0), 0);
            if (rows.length < pageSize) break;
        }

        return { total, qtd };
    }, [empresaIdsBaixas]);

    useEffect(() => {
        if (filtroDataCampo !== 'pagamento' || buscaAtiva) {
            setBaixasPeriodo({ total: 0, qtd: 0 });
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const de = dataInicio || today;
        const ate = dataFim || de;
        let cancelled = false;
        carregarBaixasPeriodo(de, ate)
            .then((res) => { if (!cancelled) setBaixasPeriodo(res); })
            .catch((err) => {
                console.error('Erro ao carregar baixas do período (pagar):', err);
                if (!cancelled) setBaixasPeriodo({ total: 0, qtd: 0 });
            });
        return () => { cancelled = true; };
    }, [carregarBaixasPeriodo, filtroDataCampo, dataInicio, dataFim, buscaAtiva, dataRevision, dataRevisionEmpresa]);

    const recarregar = useCallback(() => {
        const filters: Record<string, string> = {};
        const term = searchTerm.trim();
        const buscaAtiva = term.length >= 2;
        if (!buscaAtiva) {
            if (statusFilter) filters.status = statusFilter;
            if (tipoFilter) filters.tipo_documento = tipoFilter;
            if (naturezaFilter) filters.plano_conta_id = naturezaFilter;
            filters.filtro_data_campo = filtroDataCampo;
            if (dataInicio) filters.data_inicio = dataInicio;
            if (dataFim) filters.data_fim = dataFim;
        }
        if (buscaAtiva) filters.search_term = term;
        if (visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1) {
            filters.empresa_ids = empresaIdsParaFiltro.join(',');
        }
        if (
            isTodasFiliais &&
            filiais.length > 1 &&
            !(visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1)
        ) {
            filters.filial_ids = filiais.map((f) => f.id).join(',');
        }
        loadContasPagar(filters);
    }, [loadContasPagar, statusFilter, tipoFilter, naturezaFilter, filtroDataCampo, dataInicio, dataFim, searchTerm, dataRevision, dataRevisionEmpresa, isTodasFiliais, filiais, visaoTodasEmpresasGrupo, empresaIdsParaFiltro]);

    useEffect(() => {
        const term = searchTerm.trim();
        const delay = term.length >= 2 ? 350 : 0;
        const timer = window.setTimeout(() => {
            recarregar();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [recarregar, searchTerm]);

    // Reseta para a primeira página quando os filtros mudam
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, tipoFilter, naturezaFilter, filtroDataCampo, dataInicio, dataFim, valorMinInput, valorMaxInput, JSON.stringify(columnFilters)]);

    const contasEnriquecidas = useMemo(
        () =>
            contasPagar.map((cp) => {
                const filialNome =
                    cp.filial_nome ||
                    (cp.filial_id ? filialNomePorId.get(cp.filial_id) : undefined);
                const empresaIdTitulo =
                    (cp.filial_id ? filialEmpresaPorId.get(cp.filial_id) : undefined) || cp.empresa_id;
                const empresaNome = empresaNomePorId.get(empresaIdTitulo);
                return {
                    ...cp,
                    filial_nome: filialNome,
                    ...(empresaNome && visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1
                        ? { empresa_nome: empresaNome }
                        : {}),
                };
            }),
        [contasPagar, filialNomePorId, filialEmpresaPorId, empresaNomePorId, visaoTodasEmpresasGrupo, empresaIdsParaFiltro.length],
    );

    const sufixoConsolidado = visaoConsolidada
        ? visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1
            ? ` · ${empresaIdsParaFiltro.length} unidades`
            : ` · ${filiais.length} filiais`
        : '';

    const filtered = useMemo(() => {
        let rows = contasEnriquecidas;

        if (searchTerm) {
            const term = searchTerm.trim();
            rows = rows.filter((cp) =>
                contaPagarCodigoMatch(term, cp.codigo) ||
                cp.descricao.toLowerCase().includes(term.toLowerCase()) ||
                (cp.fornecedor_nome || '').toLowerCase().includes(term.toLowerCase()) ||
                (cp.numero_nota_fiscal || '').toLowerCase().includes(term.toLowerCase()) ||
                (cp.natureza_financeira || '').toLowerCase().includes(term.toLowerCase())
            );
        }

        if (valorMinCentavos != null) {
            rows = rows.filter((cp) => (cp.valor_total_centavos ?? 0) >= valorMinCentavos);
        }
        if (valorMaxCentavos != null) {
            rows = rows.filter((cp) => (cp.valor_total_centavos ?? 0) <= valorMaxCentavos);
        }

        for (const [key, selectedValues] of Object.entries(columnFilters) as [ColumnFilterKey, string[]][]) {
            if (selectedValues.length === 0) continue;
            rows = rows.filter((cp) => selectedValues.includes(getRowValueForFilter(cp, key)));
        }

        return rows;
    }, [contasEnriquecidas, searchTerm, valorMinCentavos, valorMaxCentavos, columnFilters, nomeUnidadeConta]);

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Ajusta a página atual se estiver fora dos limites
    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const paginatedItems = filtered.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totais = useMemo(() => {
        const temSaldoAberto = (c: ContaPagar) => (c.valor_aberto_centavos || 0) > 0;
        const aberto = filtered
            .filter((c) => temSaldoAberto(c) && !contaPagarEstaVencida(c))
            .reduce((s, c) => s + c.valor_aberto_centavos, 0);
        const vencido = filtered
            .filter((c) => temSaldoAberto(c) && contaPagarEstaVencida(c))
            .reduce((s, c) => s + c.valor_aberto_centavos, 0);
        const emAbertoPeriodo = filtered
            .filter(temSaldoAberto)
            .reduce((s, c) => s + c.valor_aberto_centavos, 0);
        const pagoFiltrado = filtered
            .filter((c) => c.status === 'pago' || c.status === 'pago_parcial')
            .reduce((s, c) => s + c.valor_pago_centavos, 0);
        const pago = filtroDataCampo === 'pagamento' && !buscaAtiva ? baixasPeriodo.total : pagoFiltrado;
        const qtdEmAberto = filtered.filter(temSaldoAberto).length;
        const qtdAVencer = filtered.filter(
            (c) => temSaldoAberto(c) && !contaPagarEstaVencida(c),
        ).length;
        const qtdVencidos = filtered.filter(
            (c) => temSaldoAberto(c) && contaPagarEstaVencida(c),
        ).length;
        return {
            aberto,
            vencido,
            emAbertoPeriodo,
            pago,
            pagoFiltrado,
            qtdEmAberto,
            qtdAVencer,
            qtdVencidos,
            qtdBaixasPeriodo: baixasPeriodo.qtd,
            sumTotalCentavos: filtered.reduce((s, c) => s + (c.valor_total_centavos || 0), 0),
            sumAbertoCentavos: emAbertoPeriodo,
        };
    }, [filtered, filtroDataCampo, buscaAtiva, baixasPeriodo]);

    const totaisPorUnidade = useMemo(() => {
        if (!mostrarColunaUnidade) return [];
        const map = new Map<
            string,
            { empresa: string; unidade: string; qtd: number; total: number; aberto: number; pago: number }
        >();
        filtered.forEach((cp) => {
            const empresaIdTitulo =
                (cp.filial_id ? filialEmpresaPorId.get(cp.filial_id) : undefined) || cp.empresa_id;
            const empresa = rotuloEmpresaConta(cp);
            const unidade = rotuloFilialConta(cp);
            const chave = `${empresaIdTitulo}|${cp.filial_id || ''}`;
            const atual = map.get(chave) || { empresa, unidade, qtd: 0, total: 0, aberto: 0, pago: 0 };
            atual.qtd += 1;
            atual.total += cp.valor_total_centavos || 0;
            atual.aberto += cp.valor_aberto_centavos || 0;
            atual.pago += cp.valor_pago_centavos || 0;
            map.set(chave, atual);
        });
        return Array.from(map.values()).sort((a, b) => {
            const byEmp = a.empresa.localeCompare(b.empresa, 'pt-BR');
            if (byEmp !== 0) return byEmp;
            return a.unidade.localeCompare(b.unidade, 'pt-BR');
        });
    }, [filtered, mostrarColunaUnidade, filialEmpresaPorId, rotuloEmpresaConta, rotuloFilialConta]);

    const STATUS_CHART_COLORS: Record<string, string> = {
        Aberto: '#f59e0b', Vencido: '#ef4444', Pago: '#10b981',
        Parcial: '#3b82f6', Cancelado: '#94a3b8', Aprovado: '#8b5cf6',
        Pendente: '#f97316', Renegociado: '#06b6d4',
    };

    const dadosGraficos = useMemo(() => {
        const statusMap: Record<string, { name: string; qtd: number; valor: number }> = {};
        filtered.forEach(cp => {
            const rawStatus = contaPagarEstaVencida(cp) ? 'vencido' : (contaPagarStatusEfetivo(cp) || 'aberto');
            const label = STATUS_CP_LABELS[rawStatus] || rawStatus;
            const s = statusMap[label] || { name: label, qtd: 0, valor: 0 };
            s.qtd++;
            s.valor += cp.valor_total_centavos || 0;
            statusMap[label] = s;
        });

        const mesMap: Record<string, { mes: string; label: string; aberto: number; pago: number; vencido: number }> = {};
        filtered.forEach(cp => {
            const mesKey = (cp.data_vencimento || '').slice(0, 7);
            if (!mesKey) return;
            const entry = mesMap[mesKey] || {
                mes: mesKey,
                label: new Date(mesKey + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                aberto: 0, pago: 0, vencido: 0,
            };
            if (['pago', 'pago_parcial'].includes(cp.status)) {
                entry.pago += cp.valor_pago_centavos || 0;
            } else if (contaPagarEstaVencida(cp)) {
                entry.vencido += cp.valor_aberto_centavos || 0;
            } else {
                entry.aberto += cp.valor_aberto_centavos || 0;
            }
            mesMap[mesKey] = entry;
        });

        const tipoMap: Record<string, number> = {};
        filtered.forEach(cp => {
            const tipo = labelTipoDocumento(cp.tipo_documento);
            tipoMap[tipo] = (tipoMap[tipo] || 0) + (cp.valor_total_centavos || 0);
        });

        const naturezaMap: Record<string, number> = {};
        filtered.forEach(cp => {
            const nat = (cp.natureza_financeira || 'Sem natureza').trim();
            naturezaMap[nat] = (naturezaMap[nat] || 0) + (cp.valor_total_centavos || 0);
        });

        const fornecedorMap: Record<string, number> = {};
        filtered.forEach(cp => {
            const forn = (cp.fornecedor_nome || 'Sem fornecedor').trim();
            fornecedorMap[forn] = (fornecedorMap[forn] || 0) + (cp.valor_total_centavos || 0);
        });

        const filialMap: Record<string, { name: string; total: number; pago: number; aberto: number; vencido: number; qtd: number }> = {};
        filtered.forEach(cp => {
            const nome = (() => {
                if (cp.filial_nome) return cp.filial_nome;
                if (cp.filial_id) return filialNomePorId.get(cp.filial_id) || 'Sem unidade';
                return 'Sem unidade';
            })();
            const f = filialMap[nome] || { name: nome, total: 0, pago: 0, aberto: 0, vencido: 0, qtd: 0 };
            f.qtd++;
            f.total += cp.valor_total_centavos || 0;
            if (['pago', 'pago_parcial'].includes(cp.status)) {
                f.pago += cp.valor_pago_centavos || 0;
            } else if (contaPagarEstaVencida(cp)) {
                f.vencido += cp.valor_aberto_centavos || 0;
            } else {
                f.aberto += cp.valor_aberto_centavos || 0;
            }
            filialMap[nome] = f;
        });

        const porMesComTotal = Object.values(mesMap)
            .sort((a, b) => a.mes.localeCompare(b.mes))
            .map(m => ({ ...m, total: m.pago + m.aberto + m.vencido }));

        return {
            porStatus: Object.values(statusMap),
            porMes: porMesComTotal,
            porTipo: Object.entries(tipoMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, valor]) => ({ name, valor })),
            porNatureza: Object.entries(naturezaMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, valor]) => ({ name, valor })),
            porFornecedor: Object.entries(fornecedorMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, valor]) => ({ name, valor })),
            porFilial: Object.values(filialMap).sort((a, b) => b.total - a.total),
        };
    }, [filtered, filialNomePorId]);

    // Only show full loading screen if we have no data AND multiple things are loading,
    // but if we are just opening the modal (which triggers background loads), keep the UI.
    if (loading && contasPagar.length === 0 && !showNovaContaModal) return <FinanceiroLoading />;

    const getPeriodoLabel = () => {
        if (!dataInicio && !dataFim) return "em todo o período";
        
        const formatarDataBr = (iso: string) => {
            const parts = iso.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
            return iso;
        };

        if (dataInicio && dataFim) {
            const startParts = dataInicio.split('-');
            const endParts = dataFim.split('-');
            if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
                const isStartFirst = startParts[2] === '01';
                const lastDay = new Date(Number(endParts[0]), Number(endParts[1]), 0).getDate();
                const isEndLast = Number(endParts[2]) === lastDay;
                if (isStartFirst && isEndLast) {
                    return `no mês ${startParts[1]}/${startParts[0]}`;
                }
                return `de ${startParts[2]}/${startParts[1]} a ${endParts[2]}/${endParts[1]}`;
            }
            return `de ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`;
        }
        
        if (dataInicio) return `a partir de ${formatarDataBr(dataInicio)}`;
        if (dataFim) return `até ${formatarDataBr(dataFim)}`;
        return '';
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Contas a Pagar"
                subtitle="Gerencie pagamentos, fornecedores e aprovações"
                backTo="/financeiro"
                accentColor="#ef4444"
                icon={<CreditCard className="h-5 w-5 text-red-600" />}
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={recarregar} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        <Button variant="outline" onClick={() => setShowRelatorioModal(true)}>
                            <Printer className="h-4 w-4 mr-2 text-slate-650" /> Relatório
                        </Button>
                        <Button onClick={() => setShowNovaContaModal(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Nova Conta
                        </Button>
                    </div>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Total em aberto"
                    value={formatCentavos(totais.aberto)}
                    sublabel={`${totais.qtdAVencer} título${totais.qtdAVencer === 1 ? '' : 's'} ainda no prazo ${getPeriodoLabel()}${sufixoConsolidado}`}
                    icon={<TrendingDown className="h-5 w-5" />}
                    color="amber"
                />
                <StatCard
                    label="Vencido"
                    value={formatCentavos(totais.vencido)}
                    sublabel={`${totais.qtdVencidos} título${totais.qtdVencidos === 1 ? '' : 's'} vencido${totais.qtdVencidos === 1 ? '' : 's'} ${getPeriodoLabel()}${sufixoConsolidado}`}
                    icon={<AlertTriangle className="h-5 w-5" />}
                    color="red"
                />
                <StatCard
                    label={filtroDataCampo === 'pagamento' ? 'Pago (período)' : 'Pago (venc. no período)'}
                    value={formatCentavos(totais.pago)}
                    sublabel={
                        filtroDataCampo === 'pagamento'
                            ? `${totais.qtdBaixasPeriodo} baixa${totais.qtdBaixasPeriodo === 1 ? '' : 's'} ${getPeriodoLabel()}${sufixoConsolidado}`
                            : `${filtered.filter((c) => c.status === 'pago' || c.status === 'pago_parcial').length} títulos pagos com vencimento ${getPeriodoLabel()}${sufixoConsolidado}`
                    }
                    icon={<CheckCircle className="h-5 w-5" />}
                    color="green"
                />
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit border border-gray-200">
                <button
                    onClick={() => setActiveTab('lista')}
                    className={`flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                        activeTab === 'lista'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <FileText className="h-4 w-4" />
                    Lista
                </button>
                <button
                    onClick={() => setActiveTab('graficos')}
                    className={`flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                        activeTab === 'graficos'
                            ? 'bg-white text-red-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <BarChart2 className="h-4 w-4" />
                    Gráficos
                </button>
            </div>

            {activeTab === 'lista' && (<>

            {mostrarColunaUnidade && totaisPorUnidade.length > 0 && (
                <Card className="overflow-hidden border border-indigo-100 dark:border-indigo-900/40">
                    <div className="px-4 py-3 border-b border-indigo-50 dark:border-indigo-900/30 bg-indigo-50/60 dark:bg-indigo-950/30 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                            Total por unidade {getPeriodoLabel()}
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-800">
                                    {visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1 && (
                                        <th className="px-4 py-2.5 font-semibold">Empresa</th>
                                    )}
                                    <th className="px-4 py-2.5 font-semibold">Unidade</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Lançamentos</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Total original</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Em aberto</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Pago</th>
                                </tr>
                            </thead>
                            <tbody>
                                {totaisPorUnidade.map((row) => (
                                    <tr
                                        key={`${row.empresa}|${row.unidade}`}
                                        className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                                    >
                                        {visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1 && (
                                            <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{row.empresa}</td>
                                        )}
                                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.unidade}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{row.qtd}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">{formatCentavos(row.total)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCentavos(row.aberto)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCentavos(row.pago)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                                    {visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 1 && (
                                        <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">—</td>
                                    )}
                                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total geral</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{filtered.length}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCentavos(totais.sumTotalCentavos)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{formatCentavos(totais.sumAbertoCentavos)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                                        {formatCentavos(filtered.reduce((s, c) => s + (c.valor_pago_centavos || 0), 0))}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Filters */}
            <div className="flex flex-col gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input placeholder="Buscar por código, descrição, fornecedor, natureza ou NF..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="w-full md:w-44">
                        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Status: Todos</option>
                            <option value="aberto">Aberto</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="pago">Pago</option>
                            <option value="pago_parcial">Parcial</option>
                            <option value="vencido">Vencido</option>
                            <option value="cancelado">Cancelado</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-44">
                        <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                            <option value="">Tipo: Todos</option>
                            <option value="fornecedor">Fornecedor</option>
                            <option value="salario">Salário</option>
                            <option value="imposto">Imposto</option>
                            <option value="aluguel">Aluguel</option>
                            <option value="servico">Serviço</option>
                            <option value="material">Material</option>
                            <option value="manutencao">Manutenção</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-52">
                        <Select value={naturezaFilter} onChange={(e) => setNaturezaFilter(e.target.value)}>
                            <option value="">Natureza: Todas</option>
                            {planoContas
                                .filter((p) => p.tipo === 'despesa' || p.tipo === 'custo')
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome}
                                    </option>
                                ))}
                        </Select>
                    </div>
                </div>

                {buscaAtiva && (
                    <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        Busca ativa: ignorando filtros de data, status e tipo. Digite ao menos 2 caracteres.
                    </p>
                )}

                {!buscaAtiva && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        {filtroDataCampo === 'pagamento'
                            ? 'Filtra pela data do pagamento (baixa no caixa). Entra o que foi pago entre 01/06 e 30/06, mesmo que o vencimento seja em outro mês (ex.: venceu em maio, pagou em junho).'
                            : 'Filtra pela data de vencimento do título. Entra o que vence entre 01/06 e 30/06, independente de quando foi pago (ex.: venceu em junho, pagou em maio ou julho). Por isso o total pago difere do filtro por pagamento.'}
                        {mostrarColunaUnidade && (
                            <span className="block mt-1 text-indigo-700">
                                Visão consolidada: os totais (aberto, vencido e pago) somam <strong>todas as filiais</strong> no período.
                                A tabela pode estar paginada, mas os cards refletem a soma completa ({filtered.length} títulos carregados).
                            </span>
                        )}
                    </p>
                )}

                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
                    <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                            Filtrar por
                        </span>
                        <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-0.5">
                            <button
                                type="button"
                                onClick={() => setFiltroDataCampo('vencimento')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                    filtroDataCampo === 'vencimento'
                                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                Vencimento
                            </button>
                            <button
                                type="button"
                                onClick={() => setFiltroDataCampo('pagamento')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                    filtroDataCampo === 'pagamento'
                                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                Pagamento
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full md:flex-1">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-1 shadow-sm">
                            <div className="w-[9.5rem] shrink-0">
                                <Input
                                    type="date"
                                    pickerOnly
                                    helperText=""
                                    placeholder="De"
                                    value={dataInicio}
                                    onChange={(e) => setDataInicio(e.target.value)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 dark:text-slate-300 focus:ring-0 shadow-none"
                                />
                            </div>
                            <span className="text-gray-300 dark:text-slate-600 text-xs font-bold" aria-hidden>
                                até
                            </span>
                            <div className="w-[9.5rem] shrink-0">
                                <Input
                                    type="date"
                                    pickerOnly
                                    helperText=""
                                    placeholder="Até"
                                    value={dataFim}
                                    onChange={(e) => setDataFim(e.target.value)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 dark:text-slate-300 focus:ring-0 shadow-none"
                                />
                            </div>
                            <Calendar className="h-4 w-4 text-gray-400 dark:text-slate-500 mr-2 shrink-0 pointer-events-none" />
                        </div>
                        <div className="flex gap-2 animate-in fade-in duration-200">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const todayStr = new Date().toISOString().slice(0, 10);
                                    setDataInicio(todayStr);
                                    setDataFim(todayStr);
                                }}
                                className="h-10 px-3 text-xs"
                            >
                                Hoje
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDataInicio(primeiroDiaMes());
                                    setDataFim(ultimoDiaMes());
                                }}
                                className="h-10 px-3 text-xs"
                            >
                                Este Mês
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => { setDataInicio(''); setDataFim(''); }}
                                disabled={!dataInicio && !dataFim}
                                className="h-10 px-3 text-xs"
                            >
                                Limpar
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider shrink-0">
                        Valor:
                    </span>
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-1 shadow-sm">
                            <div className="w-[8.5rem] shrink-0">
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    helperText=""
                                    placeholder="Mínimo"
                                    value={valorMinInput}
                                    onChange={(e) => handleValorFiltroChange(e, setValorMinInput)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 dark:text-slate-300 focus:ring-0 shadow-none"
                                />
                            </div>
                            <span className="text-gray-300 dark:text-slate-600 text-xs font-bold" aria-hidden>
                                até
                            </span>
                            <div className="w-[8.5rem] shrink-0">
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    helperText=""
                                    placeholder="Máximo"
                                    value={valorMaxInput}
                                    onChange={(e) => handleValorFiltroChange(e, setValorMaxInput)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 dark:text-slate-300 focus:ring-0 shadow-none"
                                />
                            </div>
                            <DollarSign className="h-4 w-4 text-gray-400 dark:text-slate-500 mr-2 shrink-0 pointer-events-none" />
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => { setValorMinInput(''); setValorMaxInput(''); }}
                            disabled={!hasValorRangeFilter}
                            className="h-10 px-3 text-xs"
                        >
                            Limpar
                        </Button>
                    </div>
                </div>
            </div>

            {(hasActiveColumnFilters || hasValorRangeFilter) && (
                <div className="flex flex-wrap items-center gap-2 -mt-2">
                    <span className="text-xs text-gray-500 font-medium">Filtros ativos:</span>
                    {hasValorRangeFilter && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="text-emerald-500 font-bold uppercase text-[10px]">Valor:</span>
                            {valorMinCentavos != null ? formatCentavos(valorMinCentavos) : '—'}
                            {' até '}
                            {valorMaxCentavos != null ? formatCentavos(valorMaxCentavos) : '—'}
                            <button
                                type="button"
                                onClick={() => { setValorMinInput(''); setValorMaxInput(''); }}
                                className="ml-0.5 text-emerald-400 hover:text-emerald-700 transition-colors"
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {(Object.entries(columnFilters) as [ColumnFilterKey, string[]][]).map(([key, values]) =>
                        values.map((val) => (
                            <span
                                key={`${key}-${val}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                            >
                                <span className="text-blue-500 font-bold uppercase text-[10px]">{COLUMN_FILTER_LABELS[key]}:</span>
                                {getFriendlyFilterLabel(key, val)}
                                <button
                                    type="button"
                                    onClick={() => handleToggleColumnFilter(key, val)}
                                    className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                                >
                                    ×
                                </button>
                            </span>
                        ))
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            clearAllColumnFilters();
                            setValorMinInput('');
                            setValorMaxInput('');
                        }}
                        className="text-xs text-red-500 hover:underline font-semibold"
                    >
                        Limpar todos os filtros
                    </button>
                </div>
            )}

            {/* Table */}
            {filtered.length > 0 ? (
                <div className="list-table-shell">
                    <div className="overflow-x-auto">
                        <table className="list-table">
                            <thead>
                                <tr>
                                    <ThComFiltro label="Código" columnKey="codigo" />
                                    <ThComFiltro label="Fornecedor" columnKey="fornecedor" />
                                    {mostrarColunaUnidade && (
                                        <ThComFiltro label="Unidade" columnKey="unidade" />
                                    )}
                                    <th>Descrição</th>
                                    <ThComFiltro label="Tipo" columnKey="tipo" />
                                    <ThComFiltro label="Natureza" columnKey="natureza" />
                                    <ThComFiltro label="Vencimento" columnKey="vencimento" />
                                    <ThComFiltro label="Pagamento" columnKey="pagamento" />
                                    <ThComFiltro label="Valor" columnKey="valor" align="right" />
                                    <th className="text-right">Aberto</th>
                                    <ThComFiltro label="Status" columnKey="status" align="center" />
                                    <ThComFiltro label="NF" columnKey="nf" />
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.map((cp) => {
                                    const statusExibicao = contaPagarStatusEfetivo(cp);
                                    const isOverdue = contaPagarEstaVencida(cp);
                                    const isActiveRow = activeMenuId === cp.id;
                                    return (
                                    <tr
                                        key={cp.id}
                                        onClick={() => { setSelectedConta(cp); setActiveMenuId(null); }}
                                        onContextMenu={(e) => openRowMenu(cp, e)}
                                        className={`transition-colors cursor-pointer ${
                                            isActiveRow
                                                ? 'bg-blue-100 ring-1 ring-inset ring-blue-200'
                                                : selectedConta?.id === cp.id
                                                    ? 'bg-blue-50'
                                                    : isOverdue
                                                        ? 'bg-red-50/70 hover:bg-red-50'
                                                        : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <td>
                                            <span className="text-[10px] font-mono font-semibold text-red-800 bg-red-100 rounded px-1.5 py-0.5">
                                                {cp.codigo}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-700 max-w-[180px] truncate text-xs" title={cp.fornecedor_nome || ''}>
                                            {cp.fornecedor_nome || '—'}
                                        </td>
                                        {mostrarColunaUnidade && (
                                            <td
                                                className="py-3 px-4 text-xs text-slate-700 max-w-[140px] truncate"
                                                title={nomeUnidadeConta(cp)}
                                            >
                                                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                                    {nomeUnidadeConta(cp)}
                                                </span>
                                            </td>
                                        )}
                                        <td className="py-3 px-4 text-gray-900 dark:text-slate-100 max-w-[250px] truncate">{cp.descricao}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 capitalize">
                                                {cp.tipo_documento.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-xs text-gray-700 max-w-[200px] truncate" title={cp.natureza_financeira || ''}>
                                            {cp.natureza_financeira || '—'}
                                        </td>
                                        <td className={`py-3 px-4 text-gray-600 ${isOverdue ? 'text-red-700 font-semibold' : ''}`}>
                                            {formatDataBr(cp.data_vencimento)}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600">
                                            {cp.data_pagamento ? (
                                                <span className="text-emerald-700 font-medium">{formatDataBr(cp.data_pagamento)}</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-medium">{formatCentavos(cp.valor_total_centavos)}</td>
                                        <td className="py-3 px-4 text-right">
                                            <MoneyDisplay centavos={-cp.valor_aberto_centavos} size="sm" />
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <StatusFinanceiroBadge status={statusExibicao} />
                                        </td>
                                        <td className="py-3 px-4 text-xs text-gray-500">{cp.numero_nota_fiscal || '-'}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-semibold text-gray-900 dark:text-slate-100">
                                    <td colSpan={mostrarColunaUnidade ? 7 : 6} className="py-3 px-4 text-right text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                                        Total Filtrado ({filtered.length} {filtered.length === 1 ? 'título' : 'títulos'}):
                                    </td>
                                    <td className="py-3 px-4 text-right tabular-nums font-bold text-gray-900 dark:text-slate-100">
                                        {formatCentavos(totais.sumTotalCentavos)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-bold">
                                        <MoneyDisplay centavos={-totais.sumAbertoCentavos} size="sm" className="font-bold" />
                                    </td>
                                    <td colSpan={2} className="py-3 px-4"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span>Exibir</span>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-sm"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={1000}>1000</option>
                                <option value={5000}>5000</option>
                            </select>
                            <span>itens por página</span>
                            <span className="hidden sm:inline-block border-l border-gray-200 h-4 mx-1" />
                            <span>
                                Mostrando <strong className="text-gray-800 dark:text-slate-200">{Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)}</strong> a{' '}
                                <strong className="text-gray-800 dark:text-slate-200">{Math.min(totalItems, currentPage * itemsPerPage)}</strong> de{' '}
                                <strong className="text-gray-800 dark:text-slate-200">{totalItems}</strong> contas
                            </span>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    Anterior
                                </Button>
                                
                                <div className="flex items-center gap-1">
                                    {(() => {
                                        const pages: number[] = [];
                                        const maxVisible = 5;
                                        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                                        let end = Math.min(totalPages, start + maxVisible - 1);
                                        
                                        if (end - start + 1 < maxVisible) {
                                            start = Math.max(1, end - maxVisible + 1);
                                        }
                                        
                                        for (let i = start; i <= end; i++) {
                                            pages.push(i);
                                        }
                                        
                                        return pages.map((pageNum) => (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                    currentPage === pageNum
                                                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-100'
                                                        : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        ));
                                    })()}
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    Próximo
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <EmptyFinanceiro
                    icon={<CreditCard className="h-8 w-8 text-gray-400" />}
                    title="Nenhuma conta encontrada"
                    description="Não há contas a pagar com os filtros selecionados."
                    action={<Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); setTipoFilter(''); clearAllColumnFilters(); }}>Limpar Filtros</Button>}
                />
            )}

            </>)}

            {/* ═══ ABA GRÁFICOS ═══ */}
            {activeTab === 'graficos' && (
                <div className="space-y-5">
                    {/* Linha 1: Donut status + Barras por mês */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Donut - distribuição por status */}
                        <Card className="p-5">
                            <h3 className="text-sm font-bold text-gray-900">Distribuição por Status</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 mb-4">{filtered.length} títulos no período filtrado</p>
                            {dadosGraficos.porStatus.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={dadosGraficos.porStatus}
                                            cx="50%"
                                            cy="45%"
                                            innerRadius={52}
                                            outerRadius={78}
                                            dataKey="valor"
                                            nameKey="name"
                                            paddingAngle={2}
                                        >
                                            {dadosGraficos.porStatus.map((entry, i) => (
                                                <Cell key={i} fill={STATUS_CHART_COLORS[entry.name] || '#94a3b8'} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            formatter={(value: number, name: string) => [formatCentavos(value), name]}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-52 flex items-center justify-center text-sm text-gray-400">Sem dados no período</div>
                            )}
                            {/* Tabela resumo */}
                            <div className="mt-2 space-y-1.5">
                                {dadosGraficos.porStatus.map((s) => (
                                    <div key={s.name} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_CHART_COLORS[s.name] || '#94a3b8' }} />
                                            <span className="text-gray-600">{s.name}</span>
                                            <span className="text-gray-400">({s.qtd})</span>
                                        </div>
                                        <span className="font-semibold text-gray-800 tabular-nums">{formatCentavos(s.valor)}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Evolução mensal — estilo DRE */}
                        <Card className="p-5 lg:col-span-2">
                            <h3 className="text-sm font-bold text-gray-900">Histórico Mensal de Contas a Pagar</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 mb-4">Pago, aberto e vencido por mês de vencimento — linha de total</p>
                            {dadosGraficos.porMes.length > 0 ? (
                                <div className="w-full bg-slate-50/60 rounded-xl border border-gray-100 p-3">
                                    <ResponsiveContainer width="100%" height={280}>
                                        <ComposedChart
                                            data={dadosGraficos.porMes}
                                            barCategoryGap="30%"
                                            margin={{ top: 16, right: 16, left: 16, bottom: 8 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(v) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                                width={80}
                                            />
                                            <RechartsTooltip
                                                formatter={(value: number, name: string) => [formatCentavos(value), name]}
                                                contentStyle={{
                                                    borderRadius: 8,
                                                    border: '1px solid #e2e8f0',
                                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                                    backgroundColor: '#fff',
                                                }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="square" iconSize={10} />
                                            <Bar dataKey="pago" name="Pago" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="aberto" name="Aberto" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="vencido" name="Vencido" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
                                            <Line
                                                type="monotone"
                                                dataKey="total"
                                                name="Total do mês"
                                                stroke="#6366f1"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: '#6366f1' }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-60 flex items-center justify-center text-sm text-gray-400">Sem dados suficientes</div>
                            )}
                        </Card>
                    </div>

                    {/* Linha 2: Por tipo + Por natureza */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="p-5">
                            <h3 className="text-sm font-bold text-gray-900">Por Tipo de Documento</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 mb-4">Top 10 tipos por valor total (R$)</p>
                            {dadosGraficos.porTipo.length > 0 ? (
                                <ResponsiveContainer width="100%" height={dadosGraficos.porTipo.length * 36 + 20}>
                                    <BarChart
                                        data={dadosGraficos.porTipo}
                                        layout="vertical"
                                        margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis
                                            type="number"
                                            tick={{ fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(v) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={96}
                                        />
                                        <RechartsTooltip
                                            formatter={(value: number) => [formatCentavos(value), 'Total']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
                                        <Bar dataKey="valor" name="Total" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sem dados</div>
                            )}
                        </Card>

                        <Card className="p-5">
                            <h3 className="text-sm font-bold text-gray-900">Por Natureza Financeira</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 mb-4">Top 10 categorias por valor total (R$)</p>
                            {dadosGraficos.porNatureza.length > 0 ? (
                                <ResponsiveContainer width="100%" height={dadosGraficos.porNatureza.length * 36 + 20}>
                                    <BarChart
                                        data={dadosGraficos.porNatureza}
                                        layout="vertical"
                                        margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                        <XAxis
                                            type="number"
                                            tick={{ fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(v) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={110}
                                        />
                                        <RechartsTooltip
                                            formatter={(value: number) => [formatCentavos(value), 'Total']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
                                        <Bar dataKey="valor" name="Total" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sem dados</div>
                            )}
                        </Card>
                    </div>

                    {/* Linha 3: Top fornecedores */}
                    <Card className="p-5">
                        <h3 className="text-sm font-bold text-gray-900">Top Fornecedores por Valor</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5 mb-4">Os 8 fornecedores com maior volume de contas a pagar no período</p>
                        {dadosGraficos.porFornecedor.length > 0 ? (
                            <ResponsiveContainer width="100%" height={dadosGraficos.porFornecedor.length * 38 + 20}>
                                <BarChart
                                    data={dadosGraficos.porFornecedor}
                                    layout="vertical"
                                    margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tick={{ fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={150}
                                    />
                                    <RechartsTooltip
                                        formatter={(value: number) => [formatCentavos(value), 'Total']}
                                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    />
                                    <Bar dataKey="valor" name="Total" fill="#dc2626" radius={[0, 4, 4, 0]} maxBarSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sem dados</div>
                        )}
                    </Card>

                    {/* Linha 4: Por Filial / Unidade */}
                    {dadosGraficos.porFilial.length > 1 && (
                        <Card className="p-5">
                            <h3 className="text-sm font-bold text-gray-900">Distribuição por Filial / Unidade</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 mb-5">Pago, aberto e vencido por unidade — barras empilhadas + total do mês como linha</p>
                            <div className="w-full bg-slate-50/60 rounded-xl border border-gray-100 p-3">
                                <ResponsiveContainer width="100%" height={dadosGraficos.porFilial.length * 52 + 40}>
                                    <ComposedChart
                                        layout="vertical"
                                        data={dadosGraficos.porFilial}
                                        margin={{ top: 4, right: 80, left: 4, bottom: 4 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                                        <XAxis
                                            type="number"
                                            tick={{ fill: '#64748b', fontSize: 10 }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: number) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={120}
                                        />
                                        <RechartsTooltip
                                            formatter={(value: number, name: string) => [formatCentavos(value), name]}
                                            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#fff', fontSize: 12 }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={9} />
                                        <Bar dataKey="pago" name="Pago" fill="#10b981" stackId="s" maxBarSize={28} />
                                        <Bar dataKey="aberto" name="Aberto" fill="#f59e0b" stackId="s" maxBarSize={28} />
                                        <Bar dataKey="vencido" name="Vencido" fill="#ef4444" stackId="s" radius={[0, 4, 4, 0]} maxBarSize={28} />
                                        <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Mini-tabela de resumo */}
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2 pr-4 text-gray-500 font-semibold">Unidade</th>
                                            <th className="text-right py-2 pr-3 text-emerald-600 font-semibold">Pago</th>
                                            <th className="text-right py-2 pr-3 text-amber-600 font-semibold">Aberto</th>
                                            <th className="text-right py-2 pr-3 text-red-600 font-semibold">Vencido</th>
                                            <th className="text-right py-2 font-semibold text-indigo-600">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dadosGraficos.porFilial.map((f) => (
                                            <tr key={f.name} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                                <td className="py-2 pr-4 font-medium text-gray-800">{f.name}</td>
                                                <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{formatCentavos(f.pago)}</td>
                                                <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{formatCentavos(f.aberto)}</td>
                                                <td className="py-2 pr-3 text-right tabular-nums text-red-700">{formatCentavos(f.vencido)}</td>
                                                <td className="py-2 text-right tabular-nums font-bold text-gray-900">{formatCentavos(f.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {showNovaContaModal && (
                <NovaContaPagarModal
                    onClose={() => setShowNovaContaModal(false)}
                    onSuccess={() => {
                        setShowNovaContaModal(false);
                        setCurrentPage(1);
                        recarregar();
                    }}
                />
            )}

            {showBaixarModal && selectedConta && (
                <BaixarContaPagarModal
                    conta={selectedConta}
                    onClose={() => { setShowBaixarModal(false); setSelectedConta(null); }}
                    onSuccess={() => {
                        setShowBaixarModal(false);
                        setSelectedConta(null);
                        recarregar();
                    }}
                />
            )}

            {showDetalhesModal && selectedConta && (
                <DetalhesContaPagarModal
                    conta={selectedConta}
                    onClose={() => { setShowDetalhesModal(false); setSelectedConta(null); }}
                />
            )}

            {showEditarModal && selectedConta && (
                <EditarContaPagarModal
                    conta={selectedConta}
                    onClose={() => { setShowEditarModal(false); setSelectedConta(null); }}
                    onSuccess={() => { recarregar(); setShowEditarModal(false); setSelectedConta(null); }}
                    updateContaPagar={updateContaPagar}
                    criarContaPagar={criarContaPagar}
                />
            )}

            {/* Actions Menu (Fixed Position) */}
            {activeMenuId && selectedConta && menuPosition && (
                <DropdownMenuContent
                    isOpen={true}
                    onClose={() => setActiveMenuId(null)}
                    position={menuPosition}
                >
                    <DropdownMenuItem
                        onClick={() => {
                            setShowDetalhesModal(true);
                            setActiveMenuId(null);
                        }}
                    >
                        <FileText className="h-4 w-4 mr-2 text-gray-400" />
                        Detalhes
                    </DropdownMenuItem>

                        {['aberto', 'vencido', 'aprovado'].includes(selectedConta.status) && (
                            <DropdownMenuItem
                                onClick={() => {
                                    setShowEditarModal(true);
                                    setActiveMenuId(null);
                                }}
                            >
                                <Pencil className="h-4 w-4 mr-2 text-blue-500" />
                                <span className="text-blue-700">Editar</span>
                            </DropdownMenuItem>
                        )}

                        {['aberto', 'vencido', 'parcial'].includes(selectedConta.status) && (
                            <DropdownMenuItem
                                onClick={() => {
                                    setShowBaixarModal(true);
                                    setActiveMenuId(null);
                                }}
                            >
                                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                                <span className="text-green-700">Baixar</span>
                            </DropdownMenuItem>
                        )}

                        {['aberto', 'vencido', 'aprovado', 'pago_parcial'].includes(selectedConta.status) &&
                            (selectedConta.valor_aberto_centavos ?? 0) > 0 && (
                            <DropdownMenuItem
                                onClick={() => {
                                    void imprimirReciboContaPagar({
                                        codigo: selectedConta.codigo,
                                        descricao: selectedConta.descricao,
                                        tipo_documento: selectedConta.tipo_documento,
                                        fornecedor_nome: selectedConta.fornecedor_nome,
                                        numero_nota_fiscal: selectedConta.numero_nota_fiscal,
                                        data_vencimento: selectedConta.data_vencimento,
                                        valor_aberto_centavos: selectedConta.valor_aberto_centavos,
                                        situacao: 'em_aberto',
                                    });
                                    setActiveMenuId(null);
                                }}
                            >
                                <Printer className="h-4 w-4 mr-2 text-amber-500" />
                                <span className="text-amber-800">Imprimir orçamento em aberto</span>
                            </DropdownMenuItem>
                        )}

                        {['pago', 'pago_parcial'].includes(selectedConta.status) && (
                            <DropdownMenuItem
                                onClick={() => {
                                    void imprimirReciboContaPagar({
                                        codigo: selectedConta.codigo,
                                        descricao: selectedConta.descricao,
                                        tipo_documento: selectedConta.tipo_documento,
                                        fornecedor_nome: selectedConta.fornecedor_nome,
                                        numero_nota_fiscal: selectedConta.numero_nota_fiscal,
                                        data_vencimento: selectedConta.data_vencimento,
                                        valor_pago_centavos: selectedConta.valor_pago_centavos || selectedConta.valor_total_centavos,
                                        data_pagamento: selectedConta.data_pagamento || selectedConta.data_emissao,
                                        situacao: 'quitado',
                                    });
                                    setActiveMenuId(null);
                                }}
                            >
                                <Printer className="h-4 w-4 mr-2 text-blue-500" />
                                <span className="text-blue-700">Imprimir recibo</span>
                            </DropdownMenuItem>
                        )}

                        {/* Estornar Baixa - Only for Paid or Partially Paid */}
                        {['pago', 'pago_parcial'].includes(selectedConta.status) && (
                            <DropdownMenuItem
                                onClick={async () => {
                                    if (window.confirm('Tem certeza que deseja estornar o pagamento desta conta? O valor será devolvido ao saldo da conta bancária/caixa.')) {
                                        const motivo = window.prompt('Qual o motivo do estorno?');
                                        if (motivo) {
                                            const success = await estornarContaPagar(selectedConta.id, motivo);
                                            if (success) {
                                                alert('Estorno realizado com sucesso!');
                                            } else {
                                                alert('Erro ao realizar estorno.');
                                            }
                                        }
                                    }
                                    setActiveMenuId(null);
                                }}
                            >
                                <Undo2 className="h-4 w-4 mr-2 text-red-500" />
                                <span className="text-red-700">Estornar</span>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                            onClick={async () => {
                                const confirmacao = window.confirm('Tem certeza que deseja excluir esta conta? Esta ação não poderá ser desfeita.');
                                if (!confirmacao) {
                                    setActiveMenuId(null);
                                    return;
                                }

                                const success = await excluirContaPagar(selectedConta.id);
                                if (success) {
                                    alert('Conta excluída com sucesso!');
                                    setSelectedConta(null);
                                } else {
                                    alert('Não foi possível excluir a conta.');
                                }
                                setActiveMenuId(null);
                            }}
                        >
                            <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                            <span className="text-red-700 font-medium">Excluir</span>
                        </DropdownMenuItem>
                </DropdownMenuContent>
            )}

            {filterMenuColumn && filterMenuPosition && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={() => { setFilterMenuColumn(null); setFilterMenuPosition(undefined); setDropdownSearch(''); }}
                    />
                    <div
                        style={{ position: 'fixed', top: `${filterMenuPosition.y}px`, left: `${filterMenuPosition.x}px` }}
                        className="z-50 w-64 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-3 max-h-80 overflow-hidden flex flex-col"
                    >
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Filtro: {COLUMN_FILTER_LABELS[filterMenuColumn]}
                            </span>
                            {columnFilters[filterMenuColumn].length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setColumnFilters((prev) => ({ ...prev, [filterMenuColumn]: [] }))}
                                    className="text-xs text-red-600 hover:underline font-semibold"
                                >
                                    Limpar
                                </button>
                            )}
                        </div>
                        <div className="relative mb-2 shrink-0">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={dropdownSearch}
                                onChange={(e) => setDropdownSearch(e.target.value)}
                                className="w-full pl-8 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 py-1 max-h-48 border-t border-gray-100 dark:border-gray-800">
                            {getUniqueValuesForColumn(filterMenuColumn)
                                .filter((val) => {
                                    if (!dropdownSearch) return true;
                                    return getFriendlyFilterLabel(filterMenuColumn, val)
                                        .toLowerCase()
                                        .includes(dropdownSearch.toLowerCase());
                                })
                                .map((val) => {
                                    const label = getFriendlyFilterLabel(filterMenuColumn, val);
                                    const isChecked = columnFilters[filterMenuColumn].includes(val);
                                    const isValor = filterMenuColumn === 'valor';
                                    return (
                                        <label
                                            key={val}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs select-none transition-colors dark:text-slate-200"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleColumnFilter(filterMenuColumn, val)}
                                                className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                            />
                                            <span className={`truncate flex-1 ${isValor ? 'text-right tabular-nums font-medium' : ''}`}>{label}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                </>
            )}

            {showRelatorioModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
                    <Card className="w-full max-w-md bg-white p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 rounded-3xl my-8 border border-slate-100">
                        <div className="flex items-center justify-between border-b pb-4">
                            <div className="flex items-center gap-2">
                                <Printer className="h-5 w-5 text-red-600" />
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Imprimir Relatório</h3>
                            </div>
                            <button onClick={() => setShowRelatorioModal(false)} className="text-slate-450 hover:text-slate-650 font-bold text-lg select-none cursor-pointer border-none bg-transparent">&times;</button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs text-slate-500 space-y-1.5">
                                <p className="font-bold text-slate-700">Filtros aplicados da tela:</p>
                                <p>• <strong>Período:</strong> {dataInicio && dataFim ? `${formatDataBr(dataInicio)} a ${formatDataBr(dataFim)}` : 'Sem data'}</p>
                                <p>• <strong>Filtro de busca:</strong> {searchTerm || 'Nenhum'}</p>
                                {statusFilter && <p>• <strong>Status:</strong> {STATUS_CP_LABELS[statusFilter] || statusFilter}</p>}
                                {tipoFilter && <p>• <strong>Tipo:</strong> {labelTipoDocumento(tipoFilter)}</p>}
                                {naturezaFilter && <p>• <strong>Natureza:</strong> {planoContas.find(p => p.id === naturezaFilter)?.nome || naturezaFilter}</p>}
                                <p className="text-[10px] text-red-650 font-semibold mt-1">Nota: O relatório incluirá exatamente os registros que correspondem a estes filtros.</p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Tipo de Relatório (Status)</label>
                                    <Select
                                        value={reportTipo}
                                        onChange={(e: any) => setReportTipo(e.target.value)}
                                    >
                                        <option value="todos">Todos os títulos filtrados</option>
                                        <option value="pago">Apenas pagos / quitados</option>
                                        <option value="vencido">Apenas vencidos</option>
                                        <option value="aberto">Apenas em aberto (a vencer)</option>
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Formato de Agrupamento</label>
                                    <Select
                                        value={reportAgrupamento}
                                        onChange={(e: any) => setReportAgrupamento(e.target.value)}
                                    >
                                        <option value="nenhum">Lista Detalhada (Sem Agrupamento)</option>
                                        <option value="dia">Agrupado por Dia (Vencimento/Pagamento)</option>
                                        <option value="mes">Agrupado por Mês</option>
                                        <option value="fornecedor">Agrupado por Fornecedor</option>
                                        <option value="tipo">Agrupado por Tipo de Documento</option>
                                        <option value="natureza">Agrupado por Natureza Financeira</option>
                                        {mostrarColunaUnidade && (
                                            <option value="unidade">Agrupado por Unidade</option>
                                        )}
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button variant="outline" onClick={() => setShowRelatorioModal(false)}>
                                Cancelar
                            </Button>
                            <Button
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold"
                                onClick={gerarRelatorioPdf}
                                disabled={filtered.length === 0}
                            >
                                Gerar PDF
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
