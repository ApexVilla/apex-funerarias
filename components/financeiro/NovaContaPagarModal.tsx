import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    X,
    Save,
    AlertCircle,
    RefreshCw,
    Truck,
    Layers,
    FileText,
    DollarSign,
    Calendar,
    Hash,
    Search,
    ChevronDown,
    CheckCircle2,
    Building2,
    CreditCard,
    Banknote,
} from 'lucide-react';
import { Button, Input, Select, Label } from '../../components/ui/Components';
import { useFinanceiro, ContaPagar } from '../../lib/FinanceiroStore';
import { supabase } from '../../lib/supabase';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useAuth } from '../../lib/AuthContext';
import { ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';
import { inferirTipoDocumentoPagar } from '../../lib/inferirTipoDocumento';

type FornecedorOption = {
    id: string;
    nome: string;
    codigo?: string | null;
    cnpj_cpf?: string | null;
};

export interface NovaContaPagarModalProps {
    onClose: () => void;
    onSuccess: () => void;
    /** Cria o título e registra o pagamento imediato nesta conta (ex.: caixa na Tesouraria). */
    caixaDireto?: {
        contaBancariaId: string;
        contaLabel?: string;
    };
}

const hoje = () => new Date().toISOString().split('T')[0];

const addMeses = (yyyymmdd: string, meses: number): string => {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const data = new Date(y, m - 1 + meses, d);
    return data.toISOString().split('T')[0];
};

const hojeYm = () => hoje().slice(0, 7);

const ymToIsoDate = (ym: string): string => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return hoje();
    return `${ym}-01`;
};

const addMesesYm = (ym: string, meses: number): string => {
    const [y, m] = ym.split('-').map(Number);
    const data = new Date(y, m - 1 + meses, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
};

// ──────────────── Combobox interno (com pesquisa) ────────────────
interface ComboItem {
    id: string;
    primary: string;
    secondary?: string;
}

interface ComboboxProps {
    placeholder: string;
    items: ComboItem[];
    selected: ComboItem | null;
    onSelect: (item: ComboItem | null) => void;
    loading?: boolean;
    emptyHint?: React.ReactNode;
    permitirLimpar?: boolean;
    icone?: React.ReactNode;
}

const Combobox: React.FC<ComboboxProps> = ({
    placeholder,
    items,
    selected,
    onSelect,
    loading,
    emptyHint,
    permitirLimpar = true,
    icone,
}) => {
    const [open, setOpen] = useState(false);
    const [busca, setBusca] = useState('');
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = useMemo(() => {
        const t = busca.trim().toLowerCase();
        if (!t) return items;
        return items.filter(
            (it) =>
                it.primary.toLowerCase().includes(t) ||
                (it.secondary || '').toLowerCase().includes(t)
        );
    }, [items, busca]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full h-10 flex items-center justify-between gap-2 px-3 border border-slate-200 rounded-md bg-white text-sm hover:border-slate-300 transition focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none"
            >
                <span className="truncate text-left flex items-center gap-2 min-w-0">
                    {icone && <span className="text-gray-400 shrink-0">{icone}</span>}
                    {selected ? (
                        <span className="min-w-0 truncate">
                            <span className="font-semibold text-gray-900">{selected.primary}</span>
                            {selected.secondary && (
                                <span className="text-gray-500 ml-2 text-xs">{selected.secondary}</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-gray-400">{placeholder}</span>
                    )}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
                    <div className="px-2 py-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            autoFocus
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Pesquisar…"
                            className="flex-1 text-sm outline-none bg-transparent"
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {permitirLimpar && selected && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect(null);
                                    setOpen(false);
                                    setBusca('');
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 border-b border-amber-100 font-semibold"
                            >
                                ✕ Limpar seleção
                            </button>
                        )}
                        {loading ? (
                            <div className="px-3 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="px-3 py-6 text-center text-sm text-gray-500">
                                {busca.trim() ? 'Nenhum resultado.' : emptyHint || 'Nenhum item disponível.'}
                            </div>
                        ) : (
                            <ul>
                                {filtered.map((it) => {
                                    const ativo = selected?.id === it.id;
                                    return (
                                        <li key={it.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSelect(it);
                                                    setOpen(false);
                                                    setBusca('');
                                                }}
                                                className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${
                                                    ativo ? 'bg-blue-50' : ''
                                                }`}
                                            >
                                                {ativo ? (
                                                    <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                                                ) : (
                                                    <div className="h-4 w-4 rounded-full border border-gray-300 mt-0.5 shrink-0" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{it.primary}</p>
                                                    {it.secondary && (
                                                        <p className="text-[11px] text-gray-500 truncate">{it.secondary}</p>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ──────────────── Modal ────────────────
export const NovaContaPagarModal: React.FC<NovaContaPagarModalProps> = ({ onClose, onSuccess, caixaDireto }) => {
    const empresaId = useEmpresaContextoAtivo().empresaIdEfetivo || '';
    const {
        criarContaPagar,
        baixarContaPagar,
        planoContas,
        centrosCusto,
        formasPagamento,
        contasBancarias,
        loadCentrosCusto,
        loadPlanoContas,
        loadFormasPagamento,
        loadContasBancarias,
    } = useFinanceiro();
    const { filiais, filialId, isTodasFiliais, dataRevision } = useFilial();
    const { user } = useAuth();
    const precisaEscolherFilialTitulo = isTodasFiliais && filiais.length > 1;
    const [filialTituloId, setFilialTituloId] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([]);
    const [carregandoFornecedores, setCarregandoFornecedores] = useState(false);

    // ─── Form ───
    const [descricao, setDescricao] = useState('');
    const [numeroNF, setNumeroNF] = useState('');
    const [planoContaId, setPlanoContaId] = useState('');
    const [centroCustoId, setCentroCustoId] = useState('');
    const [formaPagamentoId, setFormaPagamentoId] = useState('');
    const [contaBancariaId, setContaBancariaId] = useState('');

    const [valorInput, setValorInput] = useState('');
    const [valorCentavos, setValorCentavos] = useState(0);

    const [dataEmissao, setDataEmissao] = useState(hoje());
    const [dataVencimento, setDataVencimento] = useState('');
    const [dataPagamento, setDataPagamento] = useState(hoje());
    const [dataCompetenciaYm, setDataCompetenciaYm] = useState(hojeYm());

    const [parcelar, setParcelar] = useState(false);
    const [totalParcelas, setTotalParcelas] = useState(2);
    const [observacoes, setObservacoes] = useState('');

    // Fornecedor (id + nome avulso)
    const [fornecedorId, setFornecedorId] = useState<string | null>(null);
    const [fornecedorNomeAvulso, setFornecedorNomeAvulso] = useState('');
    const [modoFornecedorAvulso, setModoFornecedorAvulso] = useState(false);

    useEffect(() => {
        loadCentrosCusto();
        loadPlanoContas();
        loadFormasPagamento();
        loadContasBancarias();
    }, [loadCentrosCusto, loadPlanoContas, loadFormasPagamento, loadContasBancarias]);

    useEffect(() => {
        if (precisaEscolherFilialTitulo && filiais.length > 0) {
            setFilialTituloId((prev) => (prev && filiais.some((f) => f.id === prev) ? prev : filiais[0].id));
        } else if (!isTodasFiliais && filialId && filialId !== FILIAL_TODAS_ID) {
            setFilialTituloId(filialId);
        }
    }, [precisaEscolherFilialTitulo, filiais, filialId, isTodasFiliais, dataRevision]);

    useEffect(() => {
        if (!caixaDireto) return;
        setContaBancariaId(caixaDireto.contaBancariaId);
        setParcelar(false);
        setDataVencimento((prev) => prev || hoje());
        setDataPagamento((prev) => prev || hoje());
    }, [caixaDireto?.contaBancariaId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = 'unset';
        };
    }, [onClose]);

    useEffect(() => {
        let cancelado = false;
        const loadFornecedores = async () => {
            if (!empresaId) return;
            setCarregandoFornecedores(true);
            try {
                const { data, error: qErr } = await supabase
                    .from('fornecedores')
                    .select('id, nome, codigo, cnpj_cpf')
                    .eq('empresa_id', empresaId)
                    .eq('ativo', true)
                    .is('deleted_at', null)
                    .order('nome');
                if (cancelado) return;
                if (qErr) {
                    console.error('[NovaContaPagarModal] fornecedores:', qErr);
                    setFornecedores([]);
                } else {
                    setFornecedores((data ?? []) as FornecedorOption[]);
                }
            } finally {
                if (!cancelado) setCarregandoFornecedores(false);
            }
        };
        loadFornecedores();
        return () => {
            cancelado = true;
        };
    }, [empresaId]);

    const fornecedorItens = useMemo<ComboItem[]>(
        () =>
            fornecedores.map((f) => ({
                id: f.id,
                primary: (f.codigo ? `${f.codigo} — ` : '') + f.nome,
                secondary: f.cnpj_cpf || undefined,
            })),
        [fornecedores]
    );

    const planoContasDespesa = useMemo<ComboItem[]>(
        () =>
            planoContas
                .filter(
                    (c) => {
                        const t = String(c.tipo || '').toLowerCase();
                        const n = String(c.natureza || '').toLowerCase();
                        return (
                            Boolean(c.id) &&
                            (t === 'despesa' || n === 'despesa' || t === 'passivo' || n === 'passivo') &&
                            c.aceita_lancamento &&
                            c.ativo !== false
                        );
                    }
                )
                .sort((a, b) =>
                    String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''), undefined, { numeric: true })
                )
                .map((c) => {
                    const nome = String(c.nome ?? '').trim() || 'Sem nome';
                    return {
                        id: c.id,
                        primary: nome,
                        secondary: c.tipo,
                    };
                }),
        [planoContas]
    );

    const centrosAtivos = useMemo(() => centrosCusto.filter((c) => c.ativo), [centrosCusto]);
    const formasAtivas = useMemo(() => formasPagamento.filter((f) => f.ativo), [formasPagamento]);

    const fornecedorSelecionado = useMemo<ComboItem | null>(() => {
        if (!fornecedorId) return null;
        return fornecedorItens.find((it) => it.id === fornecedorId) || null;
    }, [fornecedorId, fornecedorItens]);

    const planoContaSelecionado = useMemo<ComboItem | null>(() => {
        if (!planoContaId) return null;
        return planoContasDespesa.find((it) => it.id === planoContaId) || null;
    }, [planoContaId, planoContasDespesa]);

    const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const c = parseInt(raw) || 0;
        setValorCentavos(c);
        setValorInput((c / 100).toFixed(2));
    };

    const valorPorParcela = useMemo(() => {
        if (!parcelar || totalParcelas <= 1) return valorCentavos;
        return Math.floor(valorCentavos / totalParcelas);
    }, [parcelar, totalParcelas, valorCentavos]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!descricao.trim()) {
            setError('Informe uma descrição para o lançamento.');
            return;
        }
        if (!planoContaId) {
            setError('Selecione a natureza financeira (Plano de Contas).');
            return;
        }
        if (!dataVencimento) {
            setError('Informe a data de vencimento.');
            return;
        }
        if (valorCentavos <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }
        if (caixaDireto && !formaPagamentoId) {
            setError('Selecione a forma de pagamento para registrar o pagamento no caixa.');
            return;
        }
        if (precisaEscolherFilialTitulo && !filialTituloId) {
            setError('Selecione a unidade (filial) do título.');
            return;
        }

        const nParcelas = caixaDireto ? 1 : (parcelar ? Math.max(2, Math.min(60, totalParcelas)) : 1);
        setLoading(true);
        try {
            const fornecedorNomeFinal = fornecedorId
                ? fornecedores.find((f) => f.id === fornecedorId)?.nome || ''
                : fornecedorNomeAvulso.trim();
            const planoConta = planoContas.find((c) => c.id === planoContaId);

            const parcelaBase = Math.floor(valorCentavos / nParcelas);
            const resto = valorCentavos - parcelaBase * nParcelas;

            for (let i = 0; i < nParcelas; i++) {
                const valor = parcelaBase + (i === nParcelas - 1 ? resto : 0);
                const venc = i === 0 ? dataVencimento : addMeses(dataVencimento, i);
                const compYm = i === 0 ? dataCompetenciaYm : addMesesYm(dataCompetenciaYm, i);
                const comp = ymToIsoDate(compYm);
                const sufixo = nParcelas > 1 ? ` (${i + 1}/${nParcelas})` : '';
                const descricaoFinal = `${descricao.trim()}${sufixo}`;
                const tipoDocumento = inferirTipoDocumentoPagar({
                    fornecedorId,
                    descricao: descricaoFinal,
                    planoContaNome: planoConta?.nome,
                    planoContaCodigo: planoConta?.codigo,
                });

                const payload: Partial<ContaPagar> & {
                    plano_conta_id?: string;
                    centro_custo_id?: string;
                    forma_pagamento_id?: string;
                    conta_bancaria_id?: string;
                    fornecedor_id?: string;
                    observacoes?: string;
                } = {
                    fornecedor_id: fornecedorId || undefined,
                    fornecedor_nome: fornecedorNomeFinal || undefined,
                    tipo_documento: tipoDocumento,
                    descricao: descricaoFinal,
                    numero_nota_fiscal: numeroNF.trim() || undefined,
                    plano_conta_id: planoContaId,
                    centro_custo_id: centroCustoId || undefined,
                    forma_pagamento_id: formaPagamentoId || undefined,
                    conta_bancaria_id: contaBancariaId || undefined,
                    valor_original_centavos: valor,
                    valor_juros_centavos: 0,
                    valor_multa_centavos: 0,
                    valor_desconto_centavos: 0,
                    valor_pago_centavos: 0,
                    data_emissao: dataEmissao,
                    data_vencimento: venc,
                    data_competencia: comp,
                    parcela_numero: i + 1,
                    total_parcelas: nParcelas,
                    status: 'aberto',
                    requer_aprovacao: false,
                    observacoes: observacoes.trim() || undefined,
                    ...((precisaEscolherFilialTitulo && filialTituloId) || (!isTodasFiliais && filialId && filialId !== FILIAL_TODAS_ID)
                        ? { filial_id: filialTituloId || filialId }
                        : {}),
                };

                const newId = await criarContaPagar(payload);
                if (!newId) {
                    throw new Error('Não foi possível criar o título.');
                }

                if (caixaDireto) {
                    const contaCaixa = contasBancarias.find((c) => c.id === caixaDireto.contaBancariaId);
                    const prepCaixa = await ensureContasDestinoBaixa({
                        contas: contaCaixa
                            ? [{ id: contaCaixa.id, nome: contaCaixa.nome, tipo: contaCaixa.tipo }]
                            : [{ id: caixaDireto.contaBancariaId, nome: caixaDireto.contaLabel || 'Caixa', tipo: 'caixa' }],
                        dataPagamento,
                        usuarioId: user?.id,
                        observacaoPrefixo: `Sessão retroativa — despesa no caixa (${caixaDireto.contaLabel || 'caixa'})`,
                    });
                    if (!prepCaixa.ok) {
                        throw new Error(prepCaixa.errorMsg);
                    }

                    const okBaixa = await baixarContaPagar({
                        conta_pagar_id: newId,
                        valor_pago_centavos: valor,
                        forma_pagamento_id: formaPagamentoId || undefined,
                        conta_bancaria_id: caixaDireto.contaBancariaId,
                        observacoes: observacoes.trim() || undefined,
                        data_pagamento: dataPagamento,
                    });
                    if (!okBaixa) {
                        throw new Error('Título criado, mas falhou ao registrar o pagamento no caixa.');
                    }
                }
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === 'object' &&
                        err !== null &&
                        'message' in err &&
                        typeof (err as { message?: unknown }).message === 'string'
                      ? (err as { message: string }).message
                      : 'Erro ao criar conta a pagar.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0 border-l-4 border-rose-600 pl-3">
                        <div className="min-w-0">
                            <h2 className="text-base font-bold uppercase tracking-wider text-slate-900">
                                {caixaDireto ? 'Despesa no Caixa' : 'Lançamento de Conta a Pagar'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {caixaDireto
                                    ? `Registro automático de pagamento no caixa correspondente à conta ${caixaDireto.contaLabel || ''}.`
                                    : 'Lançamento e classificação de títulos e despesas operacionais no Contas a Pagar.'}
                            </p>
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

                {/* Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md flex items-center gap-2 text-xs font-semibold">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                                {error}
                            </div>
                        )}

                        {precisaEscolherFilialTitulo && (
                            <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-md space-y-2">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                    Unidade (Filial) de Origem *
                                </label>
                                <select
                                    value={filialTituloId}
                                    onChange={(e) => setFilialTituloId(e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                >
                                    {filiais.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* SEÇÃO 1: Identificação & Classificação */}
                        <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Identificação & Classificação
                            </div>

                            {/* Fornecedor */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                        Fornecedor / Favorecido
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setModoFornecedorAvulso((v) => !v);
                                            if (!modoFornecedorAvulso) {
                                                setFornecedorId(null);
                                            } else {
                                                setFornecedorNomeAvulso('');
                                            }
                                        }}
                                        className="flex items-center gap-2 group"
                                    >
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide group-hover:text-slate-700 transition">
                                            {modoFornecedorAvulso ? 'Nome avulso' : 'Cadastrado'}
                                        </span>
                                        <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                                            modoFornecedorAvulso ? 'bg-rose-500' : 'bg-slate-300'
                                        }`}>
                                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                                                modoFornecedorAvulso ? 'translate-x-4' : 'translate-x-0'
                                            }`} />
                                        </div>
                                    </button>
                                </div>

                                {modoFornecedorAvulso ? (
                                    <input
                                        type="text"
                                        value={fornecedorNomeAvulso}
                                        onChange={(e) => setFornecedorNomeAvulso(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                        placeholder="Digite o nome do fornecedor ou favorecido"
                                        autoFocus
                                    />
                                ) : (
                                    <Combobox
                                        placeholder={
                                            carregandoFornecedores
                                                ? 'Carregando fornecedores…'
                                                : fornecedores.length === 0
                                                    ? 'Nenhum fornecedor cadastrado'
                                                    : 'Pesquisar fornecedor cadastrado…'
                                        }
                                        items={fornecedorItens}
                                        selected={fornecedorSelecionado}
                                        loading={carregandoFornecedores}
                                        onSelect={(item) => {
                                            setFornecedorId(item?.id || null);
                                            if (item) setFornecedorNomeAvulso('');
                                        }}
                                        icone={<Truck className="h-3.5 w-3.5" />}
                                        emptyHint={
                                            <>
                                                Nenhum fornecedor cadastrado. Cadastre em{' '}
                                                <span className="font-semibold">Estoque → Fornecedores</span>.
                                            </>
                                        }
                                    />
                                )}
                            </div>

                            {/* Natureza */}
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                    Natureza Financeira (Plano de Contas) *
                                </label>
                                <Combobox
                                    placeholder="Pesquisar natureza de despesa…"
                                    items={planoContasDespesa}
                                    selected={planoContaSelecionado}
                                    onSelect={(item) => setPlanoContaId(item?.id || '')}
                                    icone={<Layers className="h-3.5 w-3.5" />}
                                    permitirLimpar={false}
                                    emptyHint={
                                        <>
                                            Nenhuma despesa ativa no Plano de Contas.
                                        </>
                                    }
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Centro de custo */}
                                <div className="space-y-1 md:col-span-2">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                        Centro de Custo
                                    </label>
                                    <select
                                        value={centroCustoId}
                                        onChange={(e) => setCentroCustoId(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                    >
                                        <option value="">— Sem Centro de Custo —</option>
                                        {centrosAtivos.map((cc) => {
                                            const cod = String(cc.codigo ?? '').trim();
                                            const nome = String(cc.nome ?? '').trim() || 'Sem nome';
                                            const label = cod ? `${cod} — ${nome}` : nome;
                                            return (
                                                <option key={cc.id} value={cc.id}>
                                                    {label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* SEÇÃO 2: Valores & Prazos */}
                        <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Valores & Prazos
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Descrição do Título *</label>
                                <input
                                    type="text"
                                    value={descricao}
                                    onChange={(e) => setDescricao(e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                    placeholder="Ex: Aluguel da Loja Central, Compra de Combustível, Pro Labore..."
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Valor Original (R$) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={valorInput}
                                        onChange={handleValorChange}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition font-semibold text-slate-900"
                                        placeholder="0,00"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Nº do Documento / Nota Fiscal</label>
                                    <input
                                        type="text"
                                        value={numeroNF}
                                        onChange={(e) => setNumeroNF(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                        placeholder="NF, recibo, fatura..."
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Data de Vencimento *</label>
                                    <input
                                        type="date"
                                        value={dataVencimento}
                                        onChange={(e) => setDataVencimento(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition font-semibold"
                                        required
                                    />
                                </div>

                                {caixaDireto && (
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Data do Pagamento *</label>
                                        <input
                                            type="date"
                                            value={dataPagamento}
                                            onChange={(e) => setDataPagamento(e.target.value)}
                                            className="w-full h-10 px-3 border border-rose-200 rounded-md text-sm focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-none transition font-semibold"
                                            required
                                        />
                                        <p className="text-[10px] text-slate-500">
                                            Define em qual dia o caixa registrará a saída (pode ser retroativa).
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Data de Emissão</label>
                                    <input
                                        type="date"
                                        value={dataEmissao}
                                        onChange={(e) => setDataEmissao(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Competência (Mês/Ano)</label>
                                    <input
                                        type="month"
                                        value={dataCompetenciaYm}
                                        onChange={(e) => setDataCompetenciaYm(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition"
                                    />
                                </div>
                            </div>

                            {/* Parcelamento */}
                            {!caixaDireto && (
                                <div className="rounded-md border border-slate-200 bg-slate-100/40 p-4 space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={parcelar}
                                            onChange={(e) => setParcelar(e.target.checked)}
                                            className="h-4 w-4 rounded-sm border-slate-300 text-slate-800 focus:ring-slate-800"
                                        />
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Parcelar em mais de uma vez</span>
                                    </label>
                                    {parcelar && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-7 animate-in slide-in-from-top-1 duration-150">
                                            <div className="space-y-1">
                                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Quantidade de Parcelas</label>
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
                                            <div className="space-y-1 md:col-span-2 flex flex-col justify-end">
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
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SEÇÃO 3: Pagamento e Fluxo */}
                        <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Pagamento & Informações de Caixa
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                        {caixaDireto ? 'Forma de Pagamento *' : 'Forma de Pagamento Prevista'}
                                    </label>
                                    <select
                                        value={formaPagamentoId}
                                        onChange={(e) => setFormaPagamentoId(e.target.value)}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                        required={!!caixaDireto}
                                    >
                                        <option value="">{caixaDireto ? 'Selecione…' : '— Não definida —'}</option>
                                        {formasAtivas.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.nome}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                        {caixaDireto ? 'Conta do Caixa *' : 'Conta Bancária / Caixa Previsto'}
                                    </label>
                                    {caixaDireto ? (
                                        <input
                                            type="text"
                                            readOnly
                                            value={caixaDireto.contaLabel || 'Conta selecionada'}
                                            className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm bg-slate-100 text-slate-800 font-semibold outline-none"
                                        />
                                    ) : (
                                        <select
                                            value={contaBancariaId}
                                            onChange={(e) => setContaBancariaId(e.target.value)}
                                            className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none transition appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10"
                                        >
                                            <option value="">— Não definida —</option>
                                            {contasBancarias.map((cb: any) => (
                                                <option key={cb.id} value={cb.id}>
                                                    {cb.nome || cb.banco_nome || cb.codigo}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Observações Gerais</label>
                                <textarea
                                    value={observacoes}
                                    onChange={(e) => setObservacoes(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none resize-none placeholder:text-slate-400"
                                    placeholder="Informações adicionais para auditoria interna ou conciliação bancária..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <div className="text-sm text-slate-700 truncate">
                            {valorCentavos > 0 ? (
                                <>
                                    <span className="text-xs text-slate-500">Valor Lançado:</span>{' '}
                                    <span className="font-bold text-slate-900 text-base">
                                        R$ {(valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    {parcelar && totalParcelas > 1 && (
                                        <span className="text-slate-500 ml-1.5 font-medium">({totalParcelas}x de R$ {((valorPorParcela + (valorCentavos % totalParcelas !== 0 ? (valorCentavos - valorPorParcela * totalParcelas) / totalParcelas : 0)) / 100).toFixed(2)})</span>
                                    )}
                                </>
                            ) : (
                                <span className="text-xs text-slate-400">
                                    Preencha o valor e vencimento do título
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="h-10 px-5 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-md text-sm transition flex items-center gap-2 outline-none disabled:opacity-50"
                            >
                                {loading ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {caixaDireto
                                    ? 'Salvar e Registrar Caixa'
                                    : parcelar && totalParcelas > 1
                                      ? `Criar ${totalParcelas} Parcelas`
                                      : 'Salvar Lançamento'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
