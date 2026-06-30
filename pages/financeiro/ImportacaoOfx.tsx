import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileUp,
    CheckCircle2,
    AlertTriangle,
    FileText,
    ThumbsUp,
    Clock,
    Search,
    XCircle,
    Printer,
    FolderOpen,
    Link2,
    Pencil,
    Trash2,
    Undo2,
    MoreVertical,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Button, Card, Select, Badge, Textarea } from '../../components/ui/Components';
import { formatCentavos, useFinanceiro } from '../../lib/FinanceiroStore';
import { useAuth } from '../../lib/AuthContext';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { supabase } from '../../lib/supabase';
import { parseOfx, type OfxParsedData, type OfxTransaction } from '../../lib/ofxParser';
import { detectarFormatoImportacao, parseCnab400SicrediRetorno } from '../../lib/cnab400SicrediRetorno';

interface ContaReceberLookup {
    id: string;
    codigo: string;
    cliente_id?: string;
    valor_aberto_centavos: number;
    data_vencimento: string;
    tipo_documento: string;
    filial_id?: string | null;
}

const toSha256Hex = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Diferença em dias entre duas datas ISO (YYYY-MM-DD). */
const diasEntreDatas = (a: string, b: string): number => {
    const ta = new Date(a + 'T12:00:00').getTime();
    const tb = new Date(b + 'T12:00:00').getTime();
    return Math.round(Math.abs(ta - tb) / 86400000);
};

interface ArquivoHistorico extends Record<string, unknown> {
    id: string;
    empresa_id: string;
    conta_bancaria_id: string;
    nome_arquivo: string;
    formato: string;
    status: string;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    created_at: string;
    total_registros: number | null;
    registros_processados: number | null;
    uploaded_by: string | null;
    valor_total_retorno_centavos?: number;
    valor_liquidado_centavos?: number;
    erros?: Record<string, unknown> | null;
}

interface ExtratoBancoRow {
    id: string;
    data_lancamento: string;
    data_balancete: string | null;
    tipo: string;
    valor_centavos: number;
    descricao: string;
    memo: string | null;
    numero_referencia: string | null;
    conciliado?: boolean | null;
}

const normalizarRefTitulo = (ref: string | null | undefined): string =>
    (ref || '').trim().toUpperCase().replace(/\s+/g, '');

/** Monta texto de conciliação por linha (referência vs contas a receber atuais). */
const montarLogExtrato = (
    ex: Pick<ExtratoBancoRow, 'tipo' | 'numero_referencia' | 'valor_centavos'>,
    mapaCodigo: Map<string, { valor_aberto_centavos: number; status: string }>
): string => {
    if (ex.tipo !== 'credito') {
        return 'Sem baixa automática neste fluxo (débito / não-crédito)';
    }
    const ref = normalizarRefTitulo(ex.numero_referencia);
    if (!ref) {
        return 'Sem referência no arquivo — baixa só por valor + data (se não ambíguo)';
    }
    const tentativas = [ref];
    if (/^\d+$/.test(ref) && ref.length < 12) tentativas.push(ref.padStart(10, '0'));

    let conta: { valor_aberto_centavos: number; status: string } | undefined;
    for (const t of tentativas) {
        const c = mapaCodigo.get(t);
        if (c) {
            conta = c;
            break;
        }
    }

    if (!conta) {
        return 'Documento não encontrado no C.R.';
    }
    const aberto = Number(conta.valor_aberto_centavos || 0);
    const st = (conta.status || '').toLowerCase();
    if (aberto === 0 || st === 'pago') {
        return 'Liquidado no sistema';
    }
    if (st === 'pago_parcial') {
        return 'Baixa parcial — ainda há saldo em aberto no título';
    }
    return 'Título localizado — baixa automática não aplicada (valor/data ou ordem de processamento)';
};

const formatDataBr = (isoDate: string | null | undefined): string => {
    if (!isoDate) return '—';
    const d = isoDate.includes('T') ? isoDate.slice(0, 10) : isoDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return isoDate;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
};

const formatDataHoraBr = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const upsertCreditoCliente = async (empresaId: string, clienteId: string, acrescimoCentavos: number) => {
    if (acrescimoCentavos <= 0) return;
    const { data, error } = await supabase
        .from('fin_creditos_clientes')
        .select('saldo_centavos')
        .eq('empresa_id', empresaId)
        .eq('cliente_id', clienteId)
        .maybeSingle();
    if (error) throw error;
    const atual = Number(data?.saldo_centavos || 0);
    const { error: upsertError } = await supabase
        .from('fin_creditos_clientes')
        .upsert(
            {
                empresa_id: empresaId,
                cliente_id: clienteId,
                saldo_centavos: Math.max(0, atual + acrescimoCentavos),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'empresa_id,cliente_id' }
        );
    if (upsertError) throw upsertError;
};

export const ImportacaoOfx: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { filialId, isTodasFiliais } = useFilial();
    const shouldFilterByFilial =
        Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais);
    const { empresaId, contasBancarias, loadContasBancarias, formasPagamento, loadFormasPagamento } = useFinanceiro();
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [arquivoNome, setArquivoNome] = useState('');
    const [arquivoTexto, setArquivoTexto] = useState('');
    const [parsed, setParsed] = useState<OfxParsedData | null>(null);
    const [processando, setProcessando] = useState(false);
    const [erro, setErro] = useState('');
    const [janelaDiasConciliacao, setJanelaDiasConciliacao] = useState(7);
    const [formatoImportacao, setFormatoImportacao] = useState<'ofx' | 'cnab400'>('ofx');
    const [cnabLinhasIgnoradas, setCnabLinhasIgnoradas] = useState<number | null>(null);
    const [resultado, setResultado] = useState<{
        importados: number;
        baixados: number;
        baixadosPorReferencia: number;
        baixadosPorValorData: number;
        naoConciliados: number;
        ambiguosValorData: number;
        creditosGerados: number;
        saldosGerados: number;
        pendenteConciliacao: boolean;
    } | null>(null);

    const [historico, setHistorico] = useState<
        (ArquivoHistorico & {
            valorTotalExibicao: number;
            contaLabel: string;
            usuarioNome: string | null;
        })[]
    >([]);
    const [loadingHistorico, setLoadingHistorico] = useState(true);
    const [buscaHistorico, setBuscaHistorico] = useState('');

    const [detalheAberto, setDetalheAberto] = useState(false);
    const [detalheLinha, setDetalheLinha] = useState<
        | (ArquivoHistorico & {
              valorTotalExibicao: number;
              contaLabel: string;
              usuarioNome: string | null;
          })
        | null
    >(null);
    const [detalheExtratos, setDetalheExtratos] = useState<(ExtratoBancoRow & { log: string })[]>([]);
    const [loadingDetalhe, setLoadingDetalhe] = useState(false);

    /** Contas bancárias com sessão de caixa aberta (para habilitar estorno / exclusão com baixa). */
    const [contasCaixaAberto, setContasCaixaAberto] = useState<Set<string>>(new Set());

    const [menuCtx, setMenuCtx] = useState<
        | {
              x: number;
              y: number;
              row: ArquivoHistorico & {
                  valorTotalExibicao: number;
                  contaLabel: string;
                  usuarioNome: string | null;
              };
          }
        | null
    >(null);

    const [editObsModal, setEditObsModal] = useState<
        | (ArquivoHistorico & {
              valorTotalExibicao: number;
              contaLabel: string;
              usuarioNome: string | null;
          })
        | null
    >(null);
    const [editObsTexto, setEditObsTexto] = useState('');
    const [salvandoObs, setSalvandoObs] = useState(false);

    const loadHistorico = useCallback(async () => {
        setLoadingHistorico(true);
        try {
            const { data: arquivos, error } = await supabase
                .from('fin_arquivos_importados')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('created_at', { ascending: false })
                .limit(120);
            if (error) throw error;
            const rows = (arquivos || []) as ArquivoHistorico[];
            if (rows.length === 0) {
                setHistorico([]);
                return;
            }

            const ids = rows.map((r) => r.id);
            const { data: extratos } = await supabase
                .from('fin_extratos_bancarios')
                .select('arquivo_id, valor_centavos, tipo')
                .in('arquivo_id', ids);

            const somaCreditosPorArquivo = new Map<string, number>();
            extratos?.forEach((e) => {
                if (e.tipo !== 'credito') return;
                somaCreditosPorArquivo.set(
                    e.arquivo_id,
                    (somaCreditosPorArquivo.get(e.arquivo_id) || 0) + (e.valor_centavos || 0)
                );
            });

            const contaIds = [...new Set(rows.map((r) => r.conta_bancaria_id))];
            const { data: contasRows } = await supabase
                .from('fin_contas_bancarias')
                .select('id,nome,codigo,banco_nome,agencia,conta')
                .in('id', contaIds);
            const mapConta = new Map((contasRows || []).map((c: Record<string, unknown>) => [c.id as string, c]));

            const userIds = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean))] as string[];
            let mapUsers = new Map<string, string>();
            if (userIds.length > 0) {
                const { data: usersRows } = await supabase.from('users').select('id,nome').in('id', userIds);
                mapUsers = new Map((usersRows || []).map((u: { id: string; nome: string }) => [u.id, u.nome]));
            }

            const enriched = rows.map((a) => {
                const c = mapConta.get(a.conta_bancaria_id) as {
                    nome?: string;
                    codigo?: string;
                    banco_nome?: string;
                    agencia?: string;
                    conta?: string;
                } | undefined;
                const partes: string[] = [];
                if (c?.codigo) partes.push(String(c.codigo));
                if (c?.nome) partes.push(String(c.nome));
                if (c?.banco_nome) partes.push(String(c.banco_nome));
                let contaLabel = partes.join(' · ');
                if (c?.agencia) contaLabel += ` · AG ${c.agencia}`;
                if (c?.conta) contaLabel += ` CC ${c.conta}`;
                if (!contaLabel) contaLabel = '—';

                const fallbackExtrato = somaCreditosPorArquivo.get(a.id) || 0;
                const storedTotal = Number(a.valor_total_retorno_centavos ?? 0);
                const valorTotalExibicao = storedTotal > 0 ? storedTotal : fallbackExtrato;

                return {
                    ...a,
                    valorTotalExibicao,
                    contaLabel,
                    usuarioNome: a.uploaded_by ? mapUsers.get(a.uploaded_by) ?? null : null,
                };
            });

            setHistorico(enriched);

            const cids = [...new Set(enriched.map((r) => r.conta_bancaria_id))];
            if (cids.length > 0) {
                const { data: sab } = await supabase
                    .from('fin_caixa_sessoes')
                    .select('conta_bancaria_id')
                    .eq('empresa_id', empresaId)
                    .eq('status', 'aberto')
                    .in('conta_bancaria_id', cids);
                setContasCaixaAberto(new Set((sab || []).map((s) => s.conta_bancaria_id)));
            } else {
                setContasCaixaAberto(new Set());
            }
        } catch (e) {
            console.error('[Retorno boletos] histórico', e);
            setHistorico([]);
            setContasCaixaAberto(new Set());
        } finally {
            setLoadingHistorico(false);
        }
    }, [empresaId]);

    const abrirDetalheArquivo = useCallback(
        async (
            row: ArquivoHistorico & {
                valorTotalExibicao: number;
                contaLabel: string;
                usuarioNome: string | null;
            }
        ) => {
            setDetalheLinha(row);
            setDetalheAberto(true);
            setLoadingDetalhe(true);
            setDetalheExtratos([]);
            try {
                const { data: extratosRaw, error } = await supabase
                    .from('fin_extratos_bancarios')
                    .select('*')
                    .eq('arquivo_id', row.id)
                    .order('data_lancamento', { ascending: true });
                if (error) throw error;
                const extratos = (extratosRaw || []) as ExtratoBancoRow[];

                const refsNorm = new Set<string>();
                extratos.forEach((ex) => {
                    if (ex.tipo !== 'credito') return;
                    const r = normalizarRefTitulo(ex.numero_referencia);
                    if (!r) return;
                    refsNorm.add(r);
                    if (/^\d+$/.test(r) && r.length < 12) refsNorm.add(r.padStart(10, '0'));
                });

                const mapaCodigo = new Map<string, { valor_aberto_centavos: number; status: string }>();
                if (refsNorm.size > 0) {
                    const codigosList = [...refsNorm];
                    const { data: titulos, error: errTitulos } = await supabase
                        .from('fin_contas_receber')
                        .select('codigo,valor_aberto_centavos,status')
                        .eq('empresa_id', empresaId)
                        .is('deleted_at', null)
                        .in('codigo', codigosList);
                    if (!errTitulos && titulos) {
                        (titulos as { codigo: string; valor_aberto_centavos: number; status: string }[]).forEach(
                            (t) => {
                                const k = normalizarRefTitulo(t.codigo);
                                if (!mapaCodigo.has(k)) {
                                    mapaCodigo.set(k, {
                                        valor_aberto_centavos: Number(t.valor_aberto_centavos || 0),
                                        status: String(t.status || ''),
                                    });
                                }
                            }
                        );
                    }
                }

                const enriched = extratos.map((ex) => ({
                    ...ex,
                    log: montarLogExtrato(ex, mapaCodigo),
                }));
                setDetalheExtratos(enriched);
            } catch (e) {
                console.error('[Retorno boletos] detalhe extratos', e);
                setDetalheExtratos([]);
            } finally {
                setLoadingDetalhe(false);
            }
        },
        [empresaId]
    );

    const fecharDetalheArquivo = useCallback(() => {
        setDetalheAberto(false);
        setDetalheLinha(null);
        setDetalheExtratos([]);
    }, []);

    const caixaAbertoNaConta = useCallback((contaBancariaId: string) => contasCaixaAberto.has(contaBancariaId), [contasCaixaAberto]);

    const podeEstornarBaixasRetorno = useCallback(
        (row: ArquivoHistorico & { valorTotalExibicao: number; contaLabel: string; usuarioNome: string | null }) => {
            const liq = Number(row.valor_liquidado_centavos ?? 0);
            const lista = row.erros?.baixas_aplicadas;
            if (liq <= 0) return false;
            if (!Array.isArray(lista) || lista.length === 0) return false;
            return caixaAbertoNaConta(row.conta_bancaria_id);
        },
        [caixaAbertoNaConta]
    );

    /** Só permite excluir o lançamento do arquivo se não houver baixa liquidada (estorne antes se necessário). */
    const podeExcluirArquivoRetorno = useCallback(
        (row: ArquivoHistorico & { valorTotalExibicao: number; contaLabel: string; usuarioNome: string | null }) =>
            Number(row.valor_liquidado_centavos ?? 0) <= 0,
        []
    );

    const executarEstornoRetorno = useCallback(
        async (
            row: ArquivoHistorico & { valorTotalExibicao: number; contaLabel: string; usuarioNome: string | null }
        ) => {
            const motivo = window.prompt('Motivo do estorno (opcional):') ?? '';
            try {
                const { error } = await supabase.rpc('fin_estornar_baixas_retorno_arquivo', {
                    p_arquivo_id: row.id,
                    p_motivo: motivo || 'Estorno via retorno',
                });
                if (error) throw new Error(error.message);
                setMenuCtx(null);
                if (detalheLinha?.id === row.id) fecharDetalheArquivo();
                void loadHistorico();
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Falha ao estornar.';
                window.alert(msg);
            }
        },
        [loadHistorico, detalheLinha, fecharDetalheArquivo]
    );

    const executarExclusaoArquivo = useCallback(
        async (
            row: ArquivoHistorico & { valorTotalExibicao: number; contaLabel: string; usuarioNome: string | null }
        ) => {
            if (
                !window.confirm(
                    `Excluir o arquivo "${row.nome_arquivo}" e os movimentos importados do extrato? Esta ação não pode ser desfeita.`
                )
            )
                return;
            try {
                const { error: ex } = await supabase.from('fin_extratos_bancarios').delete().eq('arquivo_id', row.id);
                if (ex) throw ex;
                const { error: ar } = await supabase.from('fin_arquivos_importados').delete().eq('id', row.id);
                if (ar) throw ar;
                setMenuCtx(null);
                if (detalheLinha?.id === row.id) fecharDetalheArquivo();
                void loadHistorico();
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Falha ao excluir.';
                window.alert(msg);
            }
        },
        [loadHistorico, detalheLinha, fecharDetalheArquivo]
    );

    const salvarObservacaoArquivo = useCallback(async () => {
        if (!editObsModal) return;
        setSalvandoObs(true);
        try {
            const prev = (editObsModal.erros && typeof editObsModal.erros === 'object') ? editObsModal.erros : {};
            const { error } = await supabase
                .from('fin_arquivos_importados')
                .update({
                    erros: {
                        ...prev,
                        observacao_usuario: editObsTexto.trim(),
                    },
                })
                .eq('id', editObsModal.id);
            if (error) throw error;
            setEditObsModal(null);
            void loadHistorico();
        } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Erro ao salvar observação.');
        } finally {
            setSalvandoObs(false);
        }
    }, [editObsModal, editObsTexto, loadHistorico]);

    React.useEffect(() => {
        void loadContasBancarias();
        void loadFormasPagamento();
        void loadHistorico();
    }, [loadContasBancarias, loadFormasPagamento, loadHistorico]);

    React.useEffect(() => {
        const fecharMenu = () => setMenuCtx(null);
        window.addEventListener('scroll', fecharMenu, true);
        return () => window.removeEventListener('scroll', fecharMenu, true);
    }, []);

    React.useEffect(() => {
        if (!contaBancariaId && contasBancarias.length > 0) {
            setContaBancariaId(contasBancarias.find((c) => c.principal)?.id || contasBancarias[0].id);
        }
    }, [contaBancariaId, contasBancarias]);

    const creditos = useMemo(
        () => (parsed?.transacoes || []).filter((t) => t.tipo === 'credito'),
        [parsed]
    );

    const historicoFiltrado = useMemo(() => {
        const q = buscaHistorico.trim().toLowerCase();
        if (!q) return historico;
        return historico.filter((h) =>
            [h.nome_arquivo, h.contaLabel, h.formato, h.usuarioNome || '', h.status]
                .join(' ')
                .toLowerCase()
                .includes(q)
        );
    }, [historico, buscaHistorico]);

    const totaisHistoricoPagina = useMemo(
        () =>
            historicoFiltrado.reduce(
                (acc, h) => ({
                    valorRetorno: acc.valorRetorno + h.valorTotalExibicao,
                    valorLiquidado: acc.valorLiquidado + Number(h.valor_liquidado_centavos ?? 0),
                }),
                { valorRetorno: 0, valorLiquidado: 0 }
            ),
        [historicoFiltrado]
    );

    const handleSelectFile = async (file: File | null) => {
        setErro('');
        setResultado(null);
        setCnabLinhasIgnoradas(null);
        if (!file) return;

        const nomeLower = file.name.toLowerCase();
        const extCnab =
            nomeLower.endsWith('.crt') ||
            nomeLower.endsWith('.ret') ||
            /\.r\d{2}$/i.test(file.name.trim());

        const text = await file.text();

        const aplicarCnab = () => {
            const cnab = parseCnab400SicrediRetorno(text);
            if (cnab.transacoes.length === 0) {
                setErro(
                    'Nenhuma liquidação encontrada no retorno CNAB (apenas ocorrências 06, 15 e 17 são baixadas automaticamente). Confira se o arquivo é retorno Sicredi CNAB 400.'
                );
                return false;
            }
            setFormatoImportacao('cnab400');
            setCnabLinhasIgnoradas(cnab.linhasIgnoradas);
            setParsed({
                inicio: cnab.dataArquivo,
                fim: cnab.dataArquivo,
                transacoes: cnab.transacoes,
            });
            return true;
        };

        if (extCnab) {
            if (!aplicarCnab()) return;
            setArquivoNome(file.name);
            setArquivoTexto(text);
            return;
        }

        if (!nomeLower.endsWith('.ofx') && !nomeLower.endsWith('.txt')) {
            setErro('Use arquivo OFX (.ofx), retorno Sicredi (.crt, .r01, .ret) ou .txt.');
            return;
        }

        const fmt = detectarFormatoImportacao(text);
        if (fmt === 'cnab400') {
            if (!aplicarCnab()) return;
        } else {
            const parsedData = parseOfx(text);
            if (parsedData.transacoes.length === 0) {
                setErro('Nenhuma transação válida encontrada no arquivo OFX.');
                return;
            }
            setFormatoImportacao('ofx');
            setCnabLinhasIgnoradas(null);
            setParsed(parsedData);
        }

        setArquivoNome(file.name);
        setArquivoTexto(text);
    };

    const processarImportacao = async () => {
        if (!parsed || !arquivoTexto || !contaBancariaId) return;
        setProcessando(true);
        setErro('');
        setResultado(null);
        let arquivoId: string | null = null;
        try {
            const hash = await toSha256Hex(arquivoTexto);
            const { data: fileRow, error: fileError } = await supabase
                .from('fin_arquivos_importados')
                .insert({
                    empresa_id: empresaId,
                    conta_bancaria_id: contaBancariaId,
                    nome_arquivo: arquivoNome || (formatoImportacao === 'cnab400' ? 'importacao.crt' : 'importacao.ofx'),
                    formato: formatoImportacao === 'cnab400' ? 'cnab400' : 'ofx',
                    tamanho_bytes: arquivoTexto.length,
                    hash_arquivo: hash,
                    periodo_inicio: parsed.inicio || null,
                    periodo_fim: parsed.fim || null,
                    total_registros: parsed.transacoes.length,
                    registros_processados: 0,
                    status: 'processando',
                    uploaded_by: user?.id || null,
                })
                .select('id')
                .single();

            if (fileError) {
                if (fileError.code === '23505') {
                    throw new Error('Este arquivo OFX já foi importado anteriormente.');
                }
                throw fileError;
            }

            arquivoId = fileRow.id;

            const valorTotalRetornoCentavos = creditos.reduce((s, c) => s + c.valorCentavos, 0);
            let valorLiquidadoAcumuladoCentavos = 0;

            const extratoRows = parsed.transacoes.map((tx) => ({
                empresa_id: empresaId,
                arquivo_id: arquivoId,
                conta_bancaria_id: contaBancariaId,
                data_lancamento: tx.dataLancamento,
                data_balancete: tx.dataBalancete || null,
                tipo: tx.tipo,
                valor_centavos: tx.valorCentavos,
                descricao: tx.descricao,
                memo: tx.memo || null,
                numero_referencia: tx.numeroReferencia || null,
                fitid: tx.fitid,
                conciliado: false,
            }));

            const { error: extratoError } = await supabase.from('fin_extratos_bancarios').insert(extratoRows);
            if (extratoError) throw extratoError;

            const { data: contasAbertas, error: contasError } = await (() => {
                let q = supabase
                    .from('fin_contas_receber')
                    .select(
                        'id,codigo,cliente_id,valor_aberto_centavos,data_vencimento,tipo_documento,filial_id',
                    )
                    .eq('empresa_id', empresaId)
                    .in('status', ['aberto', 'vencido', 'pago_parcial'])
                    .is('deleted_at', null);
                if (shouldFilterByFilial) q = q.eq('filial_id', filialId);
                return q;
            })();
            if (contasError) throw contasError;

            const mapPorCodigo = new Map<string, ContaReceberLookup>();
            (contasAbertas as ContaReceberLookup[]).forEach((conta) => {
                mapPorCodigo.set(conta.codigo.toUpperCase(), conta);
            });

            const formaBoleto = formasPagamento.find((f) => f.tipo === 'boleto') || formasPagamento[0];
            let baixadosPorReferencia = 0;
            let baixadosPorValorData = 0;
            let ambiguosValorData = 0;
            let creditosGerados = 0;
            let saldosGerados = 0;

            const listaContas = (contasAbertas as ContaReceberLookup[]) || [];
            const contasJaBaixadas = new Set<string>();
            const creditosProcessados = new Set<number>();
            const baixasAplicadas: { conta_receber_id: string; valor_centavos: number }[] = [];

            const executarBaixaAutomatica = async (
                conta: ContaReceberLookup,
                tx: OfxTransaction,
                observacoes: string
            ) => {
                const valorPagoProcessado = Math.min(tx.valorCentavos, conta.valor_aberto_centavos);
                const saldoRemanescente = Math.max(0, conta.valor_aberto_centavos - valorPagoProcessado);
                const descontoTecnico = saldoRemanescente;
                const excesso = Math.max(0, tx.valorCentavos - conta.valor_aberto_centavos);

                const { error: baixaError } = await supabase.rpc('fin_baixar_conta_receber', {
                    p_conta_receber_id: conta.id,
                    p_valor_pago_centavos: valorPagoProcessado,
                    p_forma_pagamento_id: formaBoleto?.id || null,
                    p_conta_bancaria_id: contaBancariaId,
                    p_valor_desconto_centavos: descontoTecnico,
                    p_observacoes: observacoes,
                });
                if (baixaError) throw baixaError;

                valorLiquidadoAcumuladoCentavos += valorPagoProcessado;
                baixasAplicadas.push({ conta_receber_id: conta.id, valor_centavos: valorPagoProcessado });

                contasJaBaixadas.add(conta.id);

                const contaDestino = contasBancarias.find((c) => c.id === contaBancariaId);
                if (contaDestino && ['caixa', 'corrente'].includes((contaDestino.tipo || '').toLowerCase())) {
                    const { data: sessao } = await supabase
                        .from('fin_caixa_sessoes')
                        .select('id')
                        .eq('empresa_id', empresaId)
                        .eq('conta_bancaria_id', contaBancariaId)
                        .eq('status', 'aberto')
                        .maybeSingle();
                    if (sessao?.id) {
                        await supabase.from('fin_caixa_movimentos').insert({
                            empresa_id: empresaId,
                            sessao_id: sessao.id,
                            tipo: 'entrada',
                            descricao: `Baixa automática OFX - ${conta.codigo}`,
                            valor_centavos: valorPagoProcessado,
                            forma_pagamento: 'boleto',
                            referencia_id: conta.id,
                            referencia_tipo: 'conta_receber',
                            arquivo_importacao_id: arquivoId,
                            usuario_id: user?.id || null,
                        });
                    }
                }

                if (saldoRemanescente > 0 && conta.cliente_id) {
                    const { data: codigoData } = await supabase.rpc('fn_gerar_codigo_fin_conta_receber', {
                        p_empresa_id: empresaId,
                    });
                    const codigo = typeof codigoData === 'string' && codigoData.trim() ? codigoData : `CR-${Date.now()}`;
                    const hoje = new Date().toISOString().slice(0, 10);
                    const { error: novaContaError } = await supabase.from('fin_contas_receber').insert({
                        empresa_id: empresaId,
                        codigo,
                        cliente_id: conta.cliente_id,
                        tipo_documento: 'outro',
                        descricao: `Saldo remanescente automático da baixa OFX (${conta.codigo})`,
                        valor_original_centavos: saldoRemanescente,
                        valor_juros_centavos: 0,
                        valor_multa_centavos: 0,
                        valor_desconto_centavos: 0,
                        valor_total_centavos: saldoRemanescente,
                        valor_pago_centavos: 0,
                        valor_aberto_centavos: saldoRemanescente,
                        data_emissao: hoje,
                        data_vencimento: conta.data_vencimento || hoje,
                        data_competencia: hoje,
                        status: 'aberto',
                        parcela_numero: 1,
                        total_parcelas: 1,
                        filial_id: conta.filial_id ?? (shouldFilterByFilial ? filialId : null),
                    });
                    if (novaContaError) throw novaContaError;
                    saldosGerados += 1;
                }

                if (excesso > 0 && conta.cliente_id) {
                    await upsertCreditoCliente(empresaId, conta.cliente_id, excesso);
                    creditosGerados += 1;
                }
            };

            // 1) Por código do título (referência OFX ou “Seu número” no retorno CNAB)
            for (let i = 0; i < creditos.length; i++) {
                const tx = creditos[i];
                let ref = (tx.numeroReferencia || '').toUpperCase().replace(/\s+/g, '');
                if (!ref) continue;

                let conta = mapPorCodigo.get(ref);
                if (!conta && ref.length < 10 && /^\d+$/.test(ref)) {
                    conta = mapPorCodigo.get(ref.padStart(10, '0'));
                }
                if (!conta || contasJaBaixadas.has(conta.id)) continue;

                await executarBaixaAutomatica(
                    conta,
                    tx,
                    `Baixa automática por importação OFX (ref ${ref}).`
                );
                creditosProcessados.add(i);
                baixadosPorReferencia += 1;
            }

            // 2) Por valor em aberto idêntico ao crédito + data de vencimento dentro da janela (vs data do extrato)
            for (let i = 0; i < creditos.length; i++) {
                if (creditosProcessados.has(i)) continue;

                const tx = creditos[i];
                const candidatos = listaContas.filter(
                    (c) =>
                        !contasJaBaixadas.has(c.id) &&
                        c.valor_aberto_centavos === tx.valorCentavos &&
                        diasEntreDatas(tx.dataLancamento, c.data_vencimento) <= janelaDiasConciliacao
                );

                if (candidatos.length === 0) continue;

                let contaEscolhida: ContaReceberLookup | null = null;
                if (candidatos.length === 1) {
                    contaEscolhida = candidatos[0];
                } else {
                    const ordenados = [...candidatos].sort(
                        (a, b) =>
                            diasEntreDatas(tx.dataLancamento, a.data_vencimento) -
                            diasEntreDatas(tx.dataLancamento, b.data_vencimento)
                    );
                    const distMin = diasEntreDatas(tx.dataLancamento, ordenados[0].data_vencimento);
                    const empateMinimo = ordenados.filter(
                        (c) => diasEntreDatas(tx.dataLancamento, c.data_vencimento) === distMin
                    );
                    if (empateMinimo.length === 1) {
                        contaEscolhida = empateMinimo[0];
                    } else {
                        ambiguosValorData += 1;
                    }
                }

                if (!contaEscolhida) continue;

                await executarBaixaAutomatica(
                    contaEscolhida,
                    tx,
                    `Baixa automática por importação OFX (valor + data, ±${janelaDiasConciliacao} dias vs vencimento).`
                );
                creditosProcessados.add(i);
                baixadosPorValorData += 1;
            }

            let naoConciliados = 0;
            for (let i = 0; i < creditos.length; i++) {
                if (!creditosProcessados.has(i)) naoConciliados += 1;
            }

            const baixados = baixadosPorReferencia + baixadosPorValorData;

            /** Créditos no arquivo mas nenhuma baixa no C.R. = sem vínculo com título/cliente → não finalizado. */
            const pendenteSemVinculo =
                valorTotalRetornoCentavos > 0 && valorLiquidadoAcumuladoCentavos === 0;
            const statusArquivo = pendenteSemVinculo ? 'pendente_conciliacao' : 'concluido';

            await supabase
                .from('fin_arquivos_importados')
                .update({
                    status: statusArquivo,
                    registros_processados: parsed.transacoes.length,
                    valor_total_retorno_centavos: valorTotalRetornoCentavos,
                    valor_liquidado_centavos: valorLiquidadoAcumuladoCentavos,
                    erros: {
                        nao_conciliados: naoConciliados,
                        ambiguos_valor_data: ambiguosValorData,
                        janela_dias: janelaDiasConciliacao,
                        formato: formatoImportacao,
                        finalizado: !pendenteSemVinculo,
                        baixas_aplicadas: baixasAplicadas,
                        ...(pendenteSemVinculo
                            ? {
                                  pendente_motivo:
                                      'Há valores de retorno no arquivo, mas nenhum título em aberto foi vinculado para baixa no sistema.',
                              }
                            : {}),
                        ...(cnabLinhasIgnoradas != null ? { cnab_linhas_nao_liquidacao: cnabLinhasIgnoradas } : {}),
                    },
                })
                .eq('id', arquivoId);

            void loadHistorico();

            setResultado({
                importados: parsed.transacoes.length,
                baixados,
                baixadosPorReferencia,
                baixadosPorValorData,
                naoConciliados,
                ambiguosValorData,
                creditosGerados,
                saldosGerados,
                pendenteConciliacao: pendenteSemVinculo,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Falha ao importar OFX.';
            setErro(message);
            if (arquivoId) {
                await supabase
                    .from('fin_arquivos_importados')
                    .update({
                        status: 'erro',
                        erros: { message },
                    })
                    .eq('id', arquivoId);
                void loadHistorico();
            }
        } finally {
            setProcessando(false);
        }
    };

    const situacaoArquivo = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'pendente_conciliacao')
            return {
                icon: AlertTriangle,
                badge: <Badge variant="warning">Não finalizado</Badge>,
                rowClass: 'bg-amber-50/60',
            };
        if (s === 'concluido')
            return {
                icon: ThumbsUp,
                badge: <Badge variant="success">Concluído</Badge>,
                rowClass: '',
            };
        if (s === 'erro')
            return {
                icon: XCircle,
                badge: <Badge variant="danger">Erro</Badge>,
                rowClass: 'bg-red-50/40',
            };
        if (s === 'processando')
            return {
                icon: Clock,
                badge: <Badge variant="warning">Processando</Badge>,
                rowClass: '',
            };
        return {
            icon: AlertTriangle,
            badge: <Badge variant="outline">{status || '—'}</Badge>,
            rowClass: '',
        };
    };

    return (
        <div className="space-y-8">
            {menuCtx && (
                <>
                    <div className="fixed inset-0 z-[80]" aria-hidden onClick={() => setMenuCtx(null)} />
                    <div
                        role="menu"
                        className="fixed z-[90] min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                        style={{
                            left: Math.max(8, menuCtx.x),
                            top: Math.max(8, menuCtx.y),
                            maxWidth: 'min(280px, calc(100vw - 16px))',
                        }}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                                void abrirDetalheArquivo(menuCtx.row);
                                setMenuCtx(null);
                            }}
                        >
                            <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                            Abrir detalhe
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                                navigate('/financeiro/contas-receber');
                                setMenuCtx(null);
                            }}
                        >
                            <Link2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                            Vincular / títulos (C.R.)
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                                const r = menuCtx.row;
                                setEditObsTexto(
                                    String(
                                        (r.erros as Record<string, unknown> | null | undefined)?.observacao_usuario ??
                                            ''
                                    )
                                );
                                setEditObsModal(r);
                                setMenuCtx(null);
                            }}
                        >
                            <Pencil className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                            Editar observação
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            disabled={!podeEstornarBaixasRetorno(menuCtx.row)}
                            title={
                                podeEstornarBaixasRetorno(menuCtx.row)
                                    ? 'Desfaz baixas no contas a receber e remove entradas de caixa deste retorno'
                                    : 'Exige caixa aberto nesta conta, valor liquidado e importação com registro de baixas (baixas_aplicadas). Se o caixa estiver fechado, abra antes.'
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                            onClick={() => {
                                if (!podeEstornarBaixasRetorno(menuCtx.row)) return;
                                const r = menuCtx.row;
                                setMenuCtx(null);
                                void executarEstornoRetorno(r);
                            }}
                        >
                            <Undo2 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                            Estornar baixas do retorno
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            disabled={!podeExcluirArquivoRetorno(menuCtx.row)}
                            title={
                                podeExcluirArquivoRetorno(menuCtx.row)
                                    ? 'Remove o lançamento e linhas do extrato importado'
                                    : 'Há baixa liquidada. Estorne as baixas antes de excluir o arquivo.'
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                            onClick={() => {
                                if (!podeExcluirArquivoRetorno(menuCtx.row)) return;
                                const r = menuCtx.row;
                                setMenuCtx(null);
                                void executarExclusaoArquivo(r);
                            }}
                        >
                            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                            Excluir arquivo do sistema
                        </button>
                    </div>
                </>
            )}

            <Modal
                isOpen={!!editObsModal}
                onClose={() => setEditObsModal(null)}
                title={editObsModal ? `Observação — ${editObsModal.nome_arquivo}` : 'Observação'}
                size="md"
            >
                <div className="space-y-4">
                    <Textarea
                        label="Notas internas sobre este retorno"
                        value={editObsTexto}
                        onChange={(e) => setEditObsTexto(e.target.value)}
                        rows={4}
                        placeholder="Ex.: conferir com financeiro, cliente X pendente de cadastro…"
                    />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setEditObsModal(null)}>
                            Cancelar
                        </Button>
                        <Button type="button" loading={salvandoObs} onClick={() => void salvarObservacaoArquivo()}>
                            Salvar
                        </Button>
                    </div>
                </div>
            </Modal>

            <PageHeader
                title="Importação OFX / CNAB"
                subtitle="Arquivos OFX ou retorno CNAB 400 (.crt, .R01, .ret). Baixa automática por referência / seu número e, em seguida, por valor e data de vencimento na janela configurável."
            />

            <p className="text-sm text-slate-600 -mt-5 mb-1 max-w-3xl leading-relaxed">
                Se o arquivo tiver créditos de retorno mas <strong>nenhum título em aberto</strong> for encontrado para baixa, o lançamento fica{' '}
                <strong>Não finalizado</strong> até existir vínculo (código / cliente no contas a receber). Com baixa aplicada, o valor aparece em
                contas a receber e na tesouraria quando houver caixa aberto na conta escolhida.
            </p>

            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/80">
                <div className="flex flex-col gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Arquivos de retorno lançados</h2>
                        <p className="mt-0.5 text-sm text-slate-300">
                            Valor retorno (créditos no arquivo), valor liquidado (baixas no C.R.), data do arquivo e cadastro.
                        </p>
                        <p className="mt-2 text-xs text-slate-400">Clique em uma linha para ver movimentos e conciliação. A lista atualiza após cada importação.</p>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={buscaHistorico}
                            onChange={(e) => setBuscaHistorico(e.target.value)}
                            placeholder="Pesquisar arquivo, conta, usuário..."
                            className="h-10 w-full rounded-xl border border-slate-600 bg-slate-800/80 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                <th className="w-12 whitespace-nowrap px-2 py-3 text-center">Ações</th>
                                <th className="whitespace-nowrap px-3 py-3">Situação</th>
                                <th className="min-w-[200px] px-3 py-3">Conta</th>
                                <th className="whitespace-nowrap px-3 py-3">Data arquivo</th>
                                <th className="min-w-[140px] px-3 py-3">Nome arquivo</th>
                                <th className="whitespace-nowrap px-3 py-3">Formato</th>
                                <th className="whitespace-nowrap px-3 py-3 text-right">Valor retorno</th>
                                <th className="whitespace-nowrap px-3 py-3 text-right">Valor liquidado</th>
                                <th className="whitespace-nowrap px-3 py-3">Usuário</th>
                                <th className="whitespace-nowrap px-3 py-3">Data cadastro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingHistorico && historico.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                                        Carregando arquivos…
                                    </td>
                                </tr>
                            ) : historicoFiltrado.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                                        Nenhum arquivo encontrado. Importe um OFX ou retorno CNAB abaixo.
                                    </td>
                                </tr>
                            ) : (
                                historicoFiltrado.map((row) => {
                                    const sit = situacaoArquivo(row.status);
                                    const Icone = sit.icon;
                                    const dataArquivo = formatDataBr(row.periodo_fim || row.periodo_inicio);
                                    const fmt = String(row.formato || '').toUpperCase();
                                    const liq = Number(row.valor_liquidado_centavos ?? 0);
                                    return (
                                        <tr
                                            key={row.id}
                                            role="button"
                                            tabIndex={0}
                                            title="Clique: detalhes · Botão direito: menu"
                                            onClick={() => void abrirDetalheArquivo(row)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    void abrirDetalheArquivo(row);
                                                }
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setMenuCtx({ x: e.clientX, y: e.clientY, row });
                                            }}
                                            className={`cursor-pointer transition-colors hover:bg-blue-50/80 ${sit.rowClass} even:bg-slate-50/40`}
                                        >
                                            <td
                                                className="whitespace-nowrap px-1 py-2 text-center"
                                                onClick={(e) => e.stopPropagation()}
                                                onContextMenu={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    type="button"
                                                    title="Menu de ações"
                                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const br = e.currentTarget.getBoundingClientRect();
                                                        setMenuCtx({
                                                            x: Math.min(br.left, window.innerWidth - 216),
                                                            y: Math.min(br.bottom + 4, window.innerHeight - 8),
                                                            row,
                                                        });
                                                    }}
                                                >
                                                    <MoreVertical className="h-5 w-5" aria-hidden />
                                                </button>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <Icone className="h-5 w-5 shrink-0 text-blue-500" aria-hidden />
                                                    {sit.badge}
                                                </div>
                                            </td>
                                            <td className="max-w-[280px] px-3 py-2.5 text-slate-800">
                                                <span className="line-clamp-2 text-xs leading-snug">{row.contaLabel}</span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{dataArquivo}</td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-slate-800">{row.nome_arquivo}</td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmt}</td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                                                {formatCentavos(row.valorTotalExibicao)}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-800">
                                                {formatCentavos(liq)}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{row.usuarioNome || '—'}</td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{formatDataHoraBr(row.created_at)}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {historicoFiltrado.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-slate-900 text-white">
                                    <td className="px-2 py-3" aria-hidden />
                                    <td colSpan={5} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                                        Totais ({historicoFiltrado.length} na lista)
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums">
                                        {formatCentavos(totaisHistoricoPagina.valorRetorno)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums">
                                        {formatCentavos(totaisHistoricoPagina.valorLiquidado)}
                                    </td>
                                    <td colSpan={2} className="px-3 py-3 text-xs text-slate-400">
                                        Soma dos valores exibidos na grade filtrada
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>

            <Card className="p-6 space-y-4">
                <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Importar arquivo de retorno</h3>
                    <p className="mt-1 text-sm text-slate-600">
                        Conta de destino, janela de datas e arquivo — use o botão abaixo para processar tudo de uma vez.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select
                        label="Conta bancária de destino"
                        value={contaBancariaId}
                        onChange={(e) => setContaBancariaId(e.target.value)}
                    >
                        <option value="">Selecione...</option>
                        {contasBancarias.filter((c) => c.ativo).map((conta) => (
                            <option key={conta.id} value={conta.id}>{conta.nome}</option>
                        ))}
                    </Select>

                    <Select
                        label="Janela valor + data (dias)"
                        value={String(janelaDiasConciliacao)}
                        onChange={(e) => setJanelaDiasConciliacao(Number(e.target.value))}
                    >
                        <option value="3">± 3 dias</option>
                        <option value="5">± 5 dias</option>
                        <option value="7">± 7 dias</option>
                        <option value="14">± 14 dias</option>
                        <option value="21">± 21 dias</option>
                        <option value="30">± 30 dias</option>
                    </Select>

                    <div className="flex flex-col justify-end">
                        <span className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-700">
                            Arquivo (OFX ou retorno CNAB)
                        </span>
                        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50/50">
                            <FolderOpen className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                            <span className="truncate text-center">
                                {arquivoNome ? 'Trocar arquivo…' : 'Escolher arquivo (.ofx, .crt, .ret…)'}
                            </span>
                            <input
                                type="file"
                                accept=".ofx,.crt,.ret,.txt,.CRT,.RET"
                                className="sr-only"
                                onChange={(e) => void handleSelectFile(e.target.files?.[0] || null)}
                            />
                        </label>
                        <p className="mt-1 ml-1 text-[11px] text-slate-500">Clique para selecionar o arquivo no computador.</p>
                    </div>
                </div>

                {arquivoNome && (
                    <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        Arquivo carregado: <strong>{arquivoNome}</strong>
                    </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                        type="button"
                        variant="primary"
                        onClick={processarImportacao}
                        loading={processando}
                        disabled={!parsed || !contaBancariaId}
                        title={
                            !contaBancariaId
                                ? 'Selecione primeiro a conta bancária de destino'
                                : !parsed
                                  ? 'Selecione um arquivo válido acima'
                                  : 'Grava o extrato e tenta baixar os títulos automaticamente'
                        }
                        className="min-h-[2.75rem] bg-gradient-to-r from-blue-600 to-indigo-600 !text-white shadow-md hover:from-blue-700 hover:to-indigo-700"
                    >
                        <FileUp className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        Importar arquivo e baixar títulos
                    </Button>
                    {!processando && (!contaBancariaId || !parsed) && (
                        <p className="text-xs text-amber-800 sm:max-w-md">
                            {!contaBancariaId && !parsed && 'Selecione a conta e um arquivo para habilitar a importação.'}
                            {!contaBancariaId && parsed && 'Selecione a conta bancária de destino.'}
                            {contaBancariaId && !parsed && 'Escolha um arquivo OFX ou retorno CNAB (.crt, .ret…).'}
                        </p>
                    )}
                </div>
            </Card>

            {parsed && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        Pré-visualização {formatoImportacao === 'cnab400' ? '(retorno CNAB — liquidações)' : 'OFX'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="rounded-lg border p-3">
                            <p className="text-gray-500">Início</p>
                            <p className="font-semibold">{parsed.inicio || '-'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-gray-500">Fim</p>
                            <p className="font-semibold">{parsed.fim || '-'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-gray-500">Transações</p>
                            <p className="font-semibold">{parsed.transacoes.length}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-gray-500">Créditos</p>
                            <p className="font-semibold">{creditos.length}</p>
                        </div>
                        {formatoImportacao === 'cnab400' && cnabLinhasIgnoradas != null && (
                            <div className="rounded-lg border p-3 md:col-span-2">
                                <p className="text-gray-500">Linhas de detalhe sem liquidação automática</p>
                                <p className="font-semibold">{cnabLinhasIgnoradas}</p>
                                <p className="text-xs text-gray-500 mt-1">Entradas, tarifas e outras ocorrências não geram baixa neste passo.</p>
                            </div>
                        )}
                    </div>
                    <div className="max-h-72 overflow-auto border rounded-xl">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="text-left">
                                    <th className="px-3 py-2">Data</th>
                                    <th className="px-3 py-2">Descrição</th>
                                    <th className="px-3 py-2">Ref</th>
                                    <th className="px-3 py-2">Tipo</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.transacoes.slice(0, 120).map((tx: OfxTransaction) => (
                                    <tr key={`${tx.fitid}-${tx.dataLancamento}`} className="border-t">
                                        <td className="px-3 py-2">{tx.dataLancamento}</td>
                                        <td className="px-3 py-2">{tx.descricao}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{tx.numeroReferencia || '-'}</td>
                                        <td className="px-3 py-2">{tx.tipo}</td>
                                        <td className="px-3 py-2 text-right">{formatCentavos(tx.valorCentavos)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Modal
                isOpen={detalheAberto && !!detalheLinha}
                onClose={fecharDetalheArquivo}
                title={detalheLinha ? `Detalhe — ${detalheLinha.nome_arquivo}` : 'Detalhe do retorno'}
                size="xl"
            >
                {detalheLinha && (
                    <div className="space-y-5">
                        <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-3 text-sm text-white shadow-inner">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Arquivo</p>
                            <p className="font-mono text-sm text-slate-100">{detalheLinha.nome_arquivo}</p>
                            <p className="mt-2 text-xs leading-relaxed text-slate-300">{detalheLinha.contaLabel}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                                <span>
                                    Data arquivo:{' '}
                                    <strong className="text-slate-200">
                                        {formatDataBr(detalheLinha.periodo_fim || detalheLinha.periodo_inicio)}
                                    </strong>
                                </span>
                                <span>
                                    Formato:{' '}
                                    <strong className="text-slate-200">{String(detalheLinha.formato || '').toUpperCase()}</strong>
                                </span>
                                <span>
                                    Valor retorno:{' '}
                                    <strong className="text-slate-200">{formatCentavos(detalheLinha.valorTotalExibicao)}</strong>
                                </span>
                                <span>
                                    Valor liquidado:{' '}
                                    <strong className="text-slate-200">
                                        {formatCentavos(Number(detalheLinha.valor_liquidado_centavos ?? 0))}
                                    </strong>
                                </span>
                            </div>
                        </div>

                        {(() => {
                            const er = detalheLinha.erros;
                            if (!er || typeof er !== 'object') return null;
                            const naoConc = typeof er.nao_conciliados === 'number' ? er.nao_conciliados : null;
                            const amb = typeof er.ambiguos_valor_data === 'number' ? er.ambiguos_valor_data : null;
                            const cnabIgn =
                                typeof er.cnab_linhas_nao_liquidacao === 'number' ? er.cnab_linhas_nao_liquidacao : null;
                            const msg = typeof er.message === 'string' ? er.message : null;
                            const pendenteMotivo = typeof er.pendente_motivo === 'string' ? er.pendente_motivo : null;
                            if (
                                naoConc == null &&
                                amb == null &&
                                cnabIgn == null &&
                                !msg &&
                                !pendenteMotivo
                            )
                                return null;
                            return (
                                <div className="flex flex-col gap-2">
                                    {pendenteMotivo && (
                                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                            <strong className="font-semibold">Não finalizado:</strong> {pendenteMotivo}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {naoConc != null && (
                                            <Badge variant="warning">Linhas sem baixa: {naoConc}</Badge>
                                        )}
                                        {amb != null && amb > 0 && (
                                            <Badge variant="outline">Ambíguos (valor+data): {amb}</Badge>
                                        )}
                                        {cnabIgn != null && cnabIgn > 0 && (
                                            <Badge variant="outline">Linhas CNAB sem liquidação: {cnabIgn}</Badge>
                                        )}
                                        {msg && (
                                            <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-800">
                                                {msg}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {loadingDetalhe ? (
                            <p className="py-10 text-center text-slate-500">Carregando movimentos…</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="min-w-[860px] w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                            <th className="whitespace-nowrap px-3 py-2.5">Data</th>
                                            <th className="min-w-[120px] px-3 py-2.5">Ref / seu número</th>
                                            <th className="min-w-[160px] px-3 py-2.5">Descrição</th>
                                            <th className="whitespace-nowrap px-3 py-2.5">Tipo</th>
                                            <th className="whitespace-nowrap px-3 py-2.5 text-right">Valor</th>
                                            <th className="min-w-[220px] px-3 py-2.5">Log / conciliação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {detalheExtratos.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                                    Nenhum movimento vinculado a este arquivo.
                                                </td>
                                            </tr>
                                        ) : (
                                            detalheExtratos.map((ex) => (
                                                <tr key={ex.id} className="bg-white even:bg-slate-50/60">
                                                    <td className="whitespace-nowrap px-3 py-2 text-slate-800">
                                                        {formatDataBr(ex.data_lancamento)}
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-xs text-slate-800">
                                                        {ex.numero_referencia || '—'}
                                                    </td>
                                                    <td className="max-w-xs px-3 py-2 text-slate-700">
                                                        <span className="line-clamp-2" title={ex.descricao}>
                                                            {ex.descricao}
                                                        </span>
                                                        {ex.memo ? (
                                                            <span className="mt-0.5 block text-[11px] text-slate-500">{ex.memo}</span>
                                                        ) : null}
                                                    </td>
                                                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{ex.tipo}</td>
                                                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                                                        {formatCentavos(ex.valor_centavos)}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs leading-snug text-slate-700">{ex.log}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {detalheExtratos.length > 0 && (
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-800 bg-slate-900 text-white">
                                                <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                                                    Totais (créditos no arquivo)
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                                                    {formatCentavos(
                                                        detalheExtratos
                                                            .filter((e) => e.tipo === 'credito')
                                                            .reduce((s, e) => s + e.valor_centavos, 0)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-xs text-slate-400">
                                                    Soma dos valores de linhas tipo crédito
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}

                        <p className="text-[11px] text-slate-500">
                            O texto em “Log / conciliação” cruza a referência do arquivo com o cadastro atual de contas a receber;
                            títulos já liquidados aparecem como conciliados. Linhas sem referência podem ter sido baixadas só por valor
                            + data.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center justify-end border-t border-slate-200 pt-4 print:hidden">
                            <Button
                                type="button"
                                variant="secondary"
                                className="!bg-slate-800 hover:!bg-slate-900"
                                title="Abre o diálogo de impressão do navegador (Ctrl+P). Use o X acima para fechar."
                                onClick={() => window.print()}
                            >
                                <Printer className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                                Imprimir
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {resultado && (
                <Card className={`p-6 ${resultado.pendenteConciliacao ? 'border-amber-200 bg-amber-50/40' : ''}`}>
                    <h3
                        className={`text-lg font-semibold flex items-center gap-2 mb-3 ${
                            resultado.pendenteConciliacao ? 'text-amber-900' : 'text-green-700'
                        }`}
                    >
                        {resultado.pendenteConciliacao ? (
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                        ) : (
                            <CheckCircle2 className="h-5 w-5 shrink-0" />
                        )}
                        {resultado.pendenteConciliacao
                            ? 'Arquivo importado — não finalizado (sem baixa no contas a receber)'
                            : 'Importação concluída'}
                    </h3>
                    {resultado.pendenteConciliacao && (
                        <p className="mb-3 text-sm text-amber-950">
                            Há créditos no arquivo, mas nenhum título em aberto foi vinculado. Cadastre/ajuste os títulos e referências,
                            ou importe de novo após corrigir.
                        </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Registros importados</p><p className="font-semibold">{resultado.importados}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Baixas totais</p><p className="font-semibold">{resultado.baixados}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Por código/referência OFX</p><p className="font-semibold">{resultado.baixadosPorReferencia}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Por valor + data</p><p className="font-semibold">{resultado.baixadosPorValorData}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Não conciliados</p><p className="font-semibold">{resultado.naoConciliados}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Ambíguos (valor+data)</p><p className="font-semibold">{resultado.ambiguosValorData}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Créditos p/ próxima parcela</p><p className="font-semibold">{resultado.creditosGerados}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-gray-500">Saldos remanescentes gerados</p><p className="font-semibold">{resultado.saldosGerados}</p></div>
                    </div>
                </Card>
            )}

            {erro && (
                <Card className="p-4 border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {erro}
                </Card>
            )}
        </div>
    );
};
