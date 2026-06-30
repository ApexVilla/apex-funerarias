import React, { useEffect, useMemo, useState } from 'react';
import {
    Wallet, DollarSign, User, TrendingUp,
    Download, CheckCircle2, Clock, Search, Settings, RefreshCw, Info,
    ArrowRightLeft, AlertTriangle, Printer, Building2, ChevronDown, ChevronUp, Receipt,
    History, Trash2
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Select, Card, Input } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao, resolveEmpresaIdsConsulta } from '../../lib/useEmpresaIdsOperacao';
import { listarCobradoresComissao, listarBaixasComissaoCobrador, type BaixaComissaoCobradorDto } from '../../lib/cobRecebimentosSupabase';
import {
    listarAcertosManuais,
    salvarAcertoManual as salvarAcertoManualDb,
    excluirAcertoManual as excluirAcertoManualDb,
    type AcertoManualDto,
} from '../../lib/cobAcertosManuaisService';
import { carregarContasCobrador } from '../../lib/cobradorContasBancarias';
import { useCobradorEscopo } from '../../lib/useCobradorEscopo';
import { mensagemErroSupabase } from '../../lib/supabaseErrorMessage';
import { supabase } from '../../lib/supabase';
import { useFilial, FILIAL_TODAS_ID } from '../../lib/FilialContext';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import { empresaIdsConsultaCobradores } from '../../lib/cobradorEmpresaScope';
import { cobradorPertenceUnidade, idsFiliaisDaUnidadeOperacional } from '../../lib/cobradorUnidadeFiltro';
import { empresaIdsGrupoEconomicoParaCobradores } from '../../lib/cobradorDisponiveis';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawRelatorioComissaoFenixHeader, PDF_PALETTE } from '../../lib/documentoPdfLayout';

interface ComissaoCobrador {
    id: string;
    cobrador_nome: string;
    cobrador_id: string;
    mes_referencia: string;
    total_cobrado_centavos: number;
    total_recebido_centavos: number;
    percentual_comissao: number;
    valor_comissao_centavos: number;
    bonus_centavos: number;
    descontos_centavos: number;
    valor_liquido_centavos: number;
    status: 'pendente' | 'aprovada' | 'paga';
    data_pagamento?: string;
    clientes_visitados: number;
    clientes_pagos: number;
    por_metodo: {
        metodo: string;
        percentual: number;
        tipo: 'percentual' | 'fixo';
        recebido_centavos: number;
        comissao_centavos: number;
    }[];
    baixas: RecebimentoApi[];
}

type RecebimentoApi = BaixaComissaoCobradorDto;

type CobradorApi = {
    id: string;
    nome: string;
    comissao_percentual?: number;
    comissao_por_metodo?: Record<string, any>;
    empresa_id?: string;
    filial_id?: string;
    area_atuacao?: string;
};

interface AcertoSessaoInfo {
    sessao_id: string;
    conta_id: string;
    conta_nome: string;
    saldo_sistema_centavos: number;
    empresa_id: string;
    data_abertura: string;
}

/** Evita somar o mesmo dinheiro duas vezes quando há mais de uma sessão aberta na mesma conta. */
function resolverSessoesAcertoCobrador(sessoes: AcertoSessaoInfo[]): {
    efetivas: AcertoSessaoInfo[];
    obsoletas: AcertoSessaoInfo[];
} {
    const porConta = new Map<string, AcertoSessaoInfo[]>();
    for (const s of sessoes) {
        const lista = porConta.get(s.conta_id) || [];
        lista.push(s);
        porConta.set(s.conta_id, lista);
    }
    const efetivas: AcertoSessaoInfo[] = [];
    const obsoletas: AcertoSessaoInfo[] = [];
    for (const lista of porConta.values()) {
        const ordenadas = [...lista].sort(
            (a, b) => new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime(),
        );
        efetivas.push(ordenadas[0]);
        obsoletas.push(...ordenadas.slice(1));
    }
    return { efetivas, obsoletas };
}

interface AcertoResultado {
    cobrador_nome: string;
    data_inicio: string;
    data_fim: string;
    sessoes: AcertoSessaoInfo[];
    total_centavos: number;
    conta_destino_nome: string;
}

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const labelMetodos: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartão',
    boleto: 'Boleto',
    transferencia: 'Transferência',
};

const ultimoDiaMes = (yyyyMm: string): string => {
    const [y, m] = yyyyMm.split('-').map(Number);
    if (!y || !m) return yyyyMm;
    const ultimo = new Date(y, m, 0).getDate();
    return `${yyyyMm}-${String(ultimo).padStart(2, '0')}`;
};

const calcularTotalArrecadadoManual = (valores: Record<string, string> | any): number => {
    if (!valores) return 0;
    let total = 0;
    Object.values(valores).forEach((val) => {
        const num = parseFloat(String(val).replace(',', '.')) || 0;
        total += Math.round(num * 100);
    });
    return total;
};

const periodoDoMes = (yyyyMm: string) => ({
    inicio: `${yyyyMm}-01`,
    fim: ultimoDiaMes(yyyyMm),
});

const StatusBadge: React.FC<{ status: ComissaoCobrador['status'] }> = ({ status }) => {
    const map = {
        pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700', icon: Clock },
        aprovada: { label: 'Aprovada', cls: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
        paga: { label: 'Paga', cls: 'bg-green-100 text-green-700', icon: DollarSign },
    };
    const { label, cls, icon: Icon } = map[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
            <Icon className="h-3 w-3" />{label}
        </span>
    );
};

export const ComissoesCobradores: React.FC = () => {
    const { user, empresa } = useAuth();
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        empresaIdsParaFiltro,
        podeAlternarEmpresa,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const { filialId, isTodasFiliais, dataRevision } = useFilial();
    const { empresaIdsFiltro } = useEmpresaIdsOperacao();
    const { showToast } = useToast();
    const { cobradorRestrito, meuCobradorId } = useCobradorEscopo(empresaIdsFiltro);

    const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
    const empresaIdsConsulta = useMemo(
        () => resolveEmpresaIdsConsulta(empresaId, empresaIdsParaFiltro),
        [empresaId, empresaIdsParaFiltro]
    );
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '',
        [empresasDoGrupo, empresaId]
    );
    const tokenUnidadeGrupo = useMemo(() => {
        if (visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [visaoTodasEmpresasGrupo, empresaNomeAtual]);

    const empresaIdsQueryCobradores = useMemo(
        () =>
            empresaIdsConsultaCobradores({
                empresaIdsParaFiltro: empresaIdsConsulta,
                empresasDoGrupo,
                visaoTodasEmpresasGrupo,
                multiEmpresa,
                tokenUnidadeGrupo,
            }),
        [empresaIdsConsulta, empresasDoGrupo, visaoTodasEmpresasGrupo, multiEmpresa, tokenUnidadeGrupo]
    );

    const shouldFilterByFilialContext = useMemo(
        () =>
            !multiEmpresa &&
            Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais),
        [multiEmpresa, filialId, isTodasFiliais]
    );
    const shouldFilterByUnidadeGrupo = useMemo(
        () => !visaoTodasEmpresasGrupo && Boolean(tokenUnidadeGrupo),
        [visaoTodasEmpresasGrupo, tokenUnidadeGrupo]
    );
    
    const [activeTab, setActiveTab] = useState<'consulta' | 'taxas' | 'acerto'>('consulta');
    const [reloadCounter, setReloadCounter] = useState(0);

    // Defesa extra: cobrador de campo nunca deve acessar taxas ou acerto.
    useEffect(() => {
        if (cobradorRestrito && (activeTab === 'taxas' || activeTab === 'acerto')) setActiveTab('consulta');
    }, [cobradorRestrito, activeTab]);

    const [cobradoresList, setCobradoresList] = useState<CobradorApi[]>([]);

    // ===== STATE PARA ACERTO MANUAL =====
    const [isManualAcertoOpen, setIsManualAcertoOpen] = useState(false);
    const [manualCobradorId, setManualCobradorId] = useState('');
    const [manualData, setManualData] = useState(() => new Date().toISOString().slice(0, 10));
    const [manualPeriodoInfo, setManualPeriodoInfo] = useState('');
    const [manualValores, setManualValores] = useState<Record<string, string>>({
        dinheiro: '',
        pix: '',
        cartao: '',
        boleto: '',
        transferencia: ''
    });
    const [manualBonus, setManualBonus] = useState('');
    const [manualDesconto, setManualDesconto] = useState('');
    const [manualObservacoes, setManualObservacoes] = useState('');
    const [acertosManuaisSalvos, setAcertosManuaisSalvos] = useState<AcertoManualDto[]>([]);
    const [manualComissaoAjustada, setManualComissaoAjustada] = useState('');
    const [salvandoAcertoManual, setSalvandoAcertoManual] = useState(false);
    const [carregandoAcertosManuais, setCarregandoAcertosManuais] = useState(false);

    // ===== ACERTO STATE =====
    const [acertoDataInicio, setAcertoDataInicio] = useState(() => {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}-01`;
    });
    const [acertoDataFim, setAcertoDataFim] = useState(() => new Date().toISOString().slice(0, 10));
    const [acertoCobrador, setAcertoCobrador] = useState('');
    const [acertoSessoes, setAcertoSessoes] = useState<AcertoSessaoInfo[]>([]);
    const [acertoContasDestino, setAcertoContasDestino] = useState<{ id: string; nome: string; tipo: string }[]>([]);
    const [acertoContaDestinoId, setAcertoContaDestinoId] = useState('');
    const [loadingAcerto, setLoadingAcerto] = useState(false);
    const [acertoResultado, setAcertoResultado] = useState<AcertoResultado | null>(null);
    const [acertoConfirmando, setAcertoConfirmando] = useState(false);
    const [isAcertoModalOpen, setIsAcertoModalOpen] = useState(false);
    const [acertoStep, setAcertoStep] = useState(1);
    const [acertoRecebimentos, setAcertoRecebimentos] = useState<{
        metodo: string;
        recebido_centavos: number;
        comissao_centavos: number;
        quantidade: number;
        taxa_exibicao: string;
    }[]>([]);
    const [acertoQuantidadeTotal, setAcertoQuantidadeTotal] = useState(0);
    const [acertoBaixas, setAcertoBaixas] = useState<RecebimentoApi[]>([]);
    const [acertoFiltroResumo, setAcertoFiltroResumo] = useState<'formato' | 'dia'>('formato');

    const acertoPorDia = useMemo(() => {
        if (!acertoBaixas || acertoBaixas.length === 0) return [];

        const cobradorCfg = cobradoresList.find((c) => String(c.id) === acertoCobrador);
        const percentualBase = Number(cobradorCfg?.comissao_percentual || 0);

        const map = new Map<string, { data: string; quantidade: number; recebido_centavos: number; comissao_centavos: number }>();

        acertoBaixas.forEach((r) => {
            const dataSlicada = (r.data || '').slice(0, 10);
            if (!dataSlicada) return;

            const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
            const taxaMetodo = Number(cobradorCfg?.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
            const tipoMetodo = (cobradorCfg?.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
            
            const valorCentavos = Number(r.valor_centavos || 0);
            const comissaoMetodo = tipoMetodo === 'fixo'
                ? Math.round(taxaMetodo * 100)
                : Math.round(valorCentavos * (taxaMetodo / 100));

            const actual = map.get(dataSlicada);
            if (!actual) {
                map.set(dataSlicada, {
                    data: dataSlicada,
                    quantidade: 1,
                    recebido_centavos: valorCentavos,
                    comissao_centavos: comissaoMetodo
                });
            } else {
                actual.quantidade += 1;
                actual.recebido_centavos += valorCentavos;
                actual.comissao_centavos += comissaoMetodo;
            }
        });

        return Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data));
    }, [acertoBaixas, acertoCobrador, cobradoresList]);

    const resetAcertoWizard = () => {
        setAcertoStep(1);
        setAcertoCobrador('');
        setAcertoSessoes([]);
        setAcertoContasDestino([]);
        setAcertoContaDestinoId('');
        setAcertoConfirmando(false);
        setIsAcertoModalOpen(false);
        setAcertoRecebimentos([]);
        setAcertoQuantidadeTotal(0);
        setAcertoBaixas([]);
        setAcertoFiltroResumo('formato');
    };

    // ===== FUNÇÕES E EFEITOS DA COBRANÇA MANUAL =====
    const carregarAcertosManuais = async () => {
        if (!empresaIdsFiltro.length) return;
        setCarregandoAcertosManuais(true);
        try {
            const lista = await listarAcertosManuais(empresaIdsFiltro, {
                cobrador_id: cobradorRestrito ? meuCobradorId || undefined : undefined,
            });
            setAcertosManuaisSalvos(lista);
        } catch (err: any) {
            console.error('Erro ao carregar acertos manuais:', err);
        } finally {
            setCarregandoAcertosManuais(false);
        }
    };

    useEffect(() => {
        void carregarAcertosManuais();
    }, [empresaIdsFiltro.join(','), cobradorRestrito, meuCobradorId, reloadCounter]);

    const resetManualAcerto = () => {
        setManualCobradorId('');
        setManualData(new Date().toISOString().slice(0, 10));
        setManualPeriodoInfo('');
        setManualValores({
            dinheiro: '',
            pix: '',
            cartao: '',
            boleto: '',
            transferencia: ''
        });
        setManualBonus('');
        setManualDesconto('');
        setManualObservacoes('');
        setManualComissaoAjustada('');
        setIsManualAcertoOpen(false);
    };

    const abrirAcertoManual = async () => {
        setIsManualAcertoOpen(true);
        if (cobradoresList.length === 0) {
            try {
                const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(empresaIdsQueryCobradores);
                const cobradoresRaw = await listarCobradoresComissao(idsQuery);
                const activeCobradores = cobradoresRaw.map((c) => ({
                    id: c.id,
                    nome: c.nome,
                    comissao_percentual: c.comissao_percentual,
                    comissao_por_metodo: c.comissao_por_metodo,
                    empresa_id: c.empresa_id,
                    filial_id: c.filial_id,
                }));
                setCobradoresList(activeCobradores);
            } catch (err: any) {
                showToast(`Erro ao carregar cobradores: ${err.message}`, 'error');
            }
        }
    };

    const cobradorSelecionadoCfg = useMemo(() => {
        return cobradoresList.find(c => String(c.id) === manualCobradorId);
    }, [manualCobradorId, cobradoresList]);

    const obterTaxaMetodo = (metodo: string) => {
        if (!cobradorSelecionadoCfg) return 0;
        const percentualBase = Number(cobradorSelecionadoCfg.comissao_percentual || 0);
        return Number(cobradorSelecionadoCfg.comissao_por_metodo?.[metodo] ?? percentualBase);
    };

    const obterTipoMetodo = (metodo: string) => {
        if (!cobradorSelecionadoCfg) return 'percentual';
        return (cobradorSelecionadoCfg.comissao_por_metodo?.[`${metodo}_tipo`] as 'percentual' | 'fixo') || 'percentual';
    };

    const manualTotalArrecadadoCentavos = useMemo(() => {
        return calcularTotalArrecadadoManual(manualValores);
    }, [manualValores]);

    const manualTotalComissaoCalculadaCentavos = useMemo(() => {
        let total = 0;
        Object.entries(manualValores).forEach(([metodo, val]) => {
            const num = parseFloat(val.replace(',', '.')) || 0;
            const valorCentavos = Math.round(num * 100);
            if (valorCentavos <= 0) return;

            const taxa = obterTaxaMetodo(metodo);
            const tipo = obterTipoMetodo(metodo);

            if (tipo === 'fixo') {
                total += Math.round(taxa * 100);
            } else {
                total += Math.round(valorCentavos * (taxa / 100));
            }
        });
        return total;
    }, [manualValores, cobradorSelecionadoCfg]);

    const comissaoFinalCentavos = useMemo(() => {
        if (manualComissaoAjustada !== '') {
            const num = parseFloat(manualComissaoAjustada.replace(',', '.')) || 0;
            return Math.round(num * 100);
        }
        return manualTotalComissaoCalculadaCentavos;
    }, [manualComissaoAjustada, manualTotalComissaoCalculadaCentavos]);

    const manualValorLiquidoCentavos = useMemo(() => {
        const bonusNum = parseFloat(manualBonus.replace(',', '.')) || 0;
        const descNum = parseFloat(manualDesconto.replace(',', '.')) || 0;
        const bonusCentavos = Math.round(bonusNum * 100);
        const descCentavos = Math.round(descNum * 100);
        return comissaoFinalCentavos + bonusCentavos - descCentavos;
    }, [comissaoFinalCentavos, manualBonus, manualDesconto]);

    const salvarAcertoManual = async () => {
        if (!manualCobradorId) {
            showToast('Selecione um cobrador.', 'error');
            return;
        }
        if (manualTotalArrecadadoCentavos <= 0) {
            showToast('Informe os valores arrecadados.', 'error');
            return;
        }

        const empresaAcerto =
            cobradorSelecionadoCfg?.empresa_id || empresaId || empresaIdsFiltro[0] || '';
        if (!empresaAcerto) {
            showToast('Empresa não identificada para o acerto.', 'error');
            return;
        }

        setSalvandoAcertoManual(true);
        try {
            const novoAcerto = await salvarAcertoManualDb({
                empresa_id: empresaAcerto,
                cobrador_id: manualCobradorId,
                data: manualData,
                periodo_info: manualPeriodoInfo,
                valores: { ...manualValores },
                total_arrecadado_centavos: manualTotalArrecadadoCentavos,
                comissao_calculada_centavos: manualTotalComissaoCalculadaCentavos,
                comissao_final_centavos: comissaoFinalCentavos,
                bonus_centavos: Math.round((parseFloat(manualBonus.replace(',', '.')) || 0) * 100),
                desconto_centavos: Math.round((parseFloat(manualDesconto.replace(',', '.')) || 0) * 100),
                liquido_centavos: manualValorLiquidoCentavos,
                observacoes: manualObservacoes,
                created_by: user?.id,
            });

            setAcertosManuaisSalvos((prev) => [novoAcerto, ...prev]);
            showToast('Cobrança manual registrada! Gerando relatório e recibo...', 'success');

            await imprimirDocumentoAcertoManual(novoAcerto);
            imprimirReciboComissaoManual(novoAcerto);

            resetManualAcerto();
        } catch (err: any) {
            showToast(`Erro ao salvar cobrança manual: ${mensagemErroSupabase(err, 'falha ao salvar')}`, 'error');
        } finally {
            setSalvandoAcertoManual(false);
        }
    };

    const excluirAcertoManual = async (id: string) => {
        try {
            await excluirAcertoManualDb(id, empresaIdsFiltro);
            setAcertosManuaisSalvos((prev) => prev.filter((a) => a.id !== id));
            showToast('Cobrança manual removida do histórico.', 'success');
        } catch (err: any) {
            showToast(`Erro ao excluir: ${mensagemErroSupabase(err, 'falha ao excluir')}`, 'error');
        }
    };

    const imprimirDocumentoAcertoManual = async (acerto: AcertoManualDto) => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();

        let startY = await drawRelatorioComissaoFenixHeader(doc, W, {
            subtituloModulo: 'DOCUMENTO DE ACERTO DE COBRADOR',
            badgeTitulo: 'ACERTO MANUAL DE ARRECADAÇÃO',
            badgeSubtitulo: `DATA: ${new Date(acerto.data + 'T12:00').toLocaleDateString('pt-BR')}`,
            empresaLogoUrl: empresa?.logo_url,
            empresaCnpj: empresa?.cnpj || undefined,
            unidadeNome: empresaNomeAtual || empresa?.nome,
        });

        startY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text('IDENTIFICAÇÃO DO COBRADOR', PDF_PALETTE.MX, startY);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
        startY += 5;
        doc.text(`COBRADOR: ${acerto.cobrador_nome.toUpperCase()}`, PDF_PALETTE.MX, startY);
        startY += 5;
        doc.text(`REFERÊNCIA / PERÍODO: ${(acerto.periodo_info || 'AVULSO').toUpperCase()}`, PDF_PALETTE.MX, startY);
        startY += 5;
        doc.text(`DATA DO ACERTO: ${new Date(acerto.data + 'T12:00').toLocaleDateString('pt-BR')}`, PDF_PALETTE.MX, startY);
        startY += 5;
        doc.text(`DATA EMISSÃO: ${new Date(acerto.criado_em || new Date()).toLocaleString('pt-BR')}`, PDF_PALETTE.MX, startY);

        startY += 8;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text('DETALHAMENTO DOS VALORES ARRECADADOS', PDF_PALETTE.MX, startY);
        
        const tableBody: any[] = [];
        Object.entries(acerto.valores).forEach(([metodo, val]: any) => {
            const numVal = parseFloat(String(val).replace(',', '.')) || 0;
            if (numVal <= 0) return;

            const label = (labelMetodos[metodo] || metodo).toUpperCase();
            const valorFormatado = formatCurrency(Math.round(numVal * 100));
            
            let taxaMetodoTexto = '—';
            let comissaoMetodoTexto = '—';
            
            const cob = cobradoresList.find(c => c.id === acerto.cobrador_id);
            if (cob) {
                const percentualBase = Number(cob.comissao_percentual || 0);
                const taxa = Number(cob.comissao_por_metodo?.[metodo] ?? percentualBase);
                const tipo = (cob.comissao_por_metodo?.[`${metodo}_tipo`] as 'percentual' | 'fixo') || 'percentual';
                
                taxaMetodoTexto = tipo === 'fixo' ? `R$ ${taxa.toFixed(2)}` : `${taxa}%`;
                
                const valorCentavos = Math.round(numVal * 100);
                const comissaoCentavos = tipo === 'fixo' ? Math.round(taxa * 100) : Math.round(valorCentavos * (taxa / 100));
                comissaoMetodoTexto = formatCurrency(comissaoCentavos);
            }

            tableBody.push([label, valorFormatado, taxaMetodoTexto, comissaoMetodoTexto]);
        });

        if (tableBody.length === 0) {
            tableBody.push(['NENHUM VALOR INFORMADO', 'R$ 0,00', '—', 'R$ 0,00']);
        }

        autoTable(doc, {
            startY: startY + 2,
            head: [['MEIO DE PAGAMENTO', 'VALOR ARRECADADO', 'TAXA APLICADA', 'COMISSÃO ESTIMADA']],
            body: tableBody,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
        });

        let currentY = (doc as any).lastAutoTable?.finalY || (startY + 15);
        currentY += 8;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text('RESUMO FINANCEIRO DO ACERTO', PDF_PALETTE.MX, currentY);
        currentY += 4;

        const resumoBody = [
            ['TOTAL ARRECADADO', formatCurrency(calcularTotalArrecadadoManual(acerto.valores))],
            ['COMISSÃO CALCULADA', formatCurrency(acerto.comissao_calculada_centavos)],
            ['COMISSÃO AJUSTADA (FINAL)', formatCurrency(acerto.comissao_final_centavos)],
            ['BÔNUS ADICIONAL', `+ ${formatCurrency(acerto.bonus_centavos)}`],
            ['DESCONTOS / RETENÇÕES', `- ${formatCurrency(acerto.desconto_centavos)}`],
            ['VALOR LÍQUIDO DA COMISSÃO', formatCurrency(acerto.liquido_centavos)],
        ];

        autoTable(doc, {
            startY: currentY,
            head: [['DESCRIÇÃO', 'VALOR']],
            body: resumoBody,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
        });

        currentY = (doc as any).lastAutoTable?.finalY || (currentY + 30);
        
        if (acerto.observacoes) {
            currentY += 8;
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVAÇÕES', PDF_PALETTE.MX, currentY);
            doc.setFont('helvetica', 'normal');
            currentY += 4;
            const splitObs = doc.splitTextToSize(acerto.observacoes.toUpperCase(), W - 2 * PDF_PALETTE.MX);
            doc.text(splitObs, PDF_PALETTE.MX, currentY);
            currentY += (splitObs.length * 5);
        }

        // Assinaturas
        currentY = Math.max(currentY + 25, 230);
        doc.setLineWidth(0.3);
        doc.setDrawColor(150, 150, 150);
        
        const lineW = 60;
        const lineY = currentY;
        const marginX = PDF_PALETTE.MX;

        // Linha da esquerda (Responsável)
        doc.line(marginX, lineY, marginX + lineW, lineY);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('RESPONSÁVEL P/ ACERTO', marginX + 2, lineY + 4);
        doc.text('FINANCEIRO / CAIXA CENTRAL', marginX + 2, lineY + 8);

        // Linha da direita (Cobrador)
        doc.line(W - marginX - lineW, lineY, W - marginX, lineY);
        doc.text(acerto.cobrador_nome.toUpperCase(), W - marginX - lineW + 2, lineY + 4);
        doc.text('COBRADOR', W - marginX - lineW + 2, lineY + 8);

        doc.save(`documento-acerto-${acerto.cobrador_nome.toLowerCase().replace(/\s+/g, '-')}-${acerto.data}.pdf`);
    };

    const imprimirReciboComissaoManual = (acerto: AcertoManualDto) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();

        doc.setDrawColor(79, 70, 229);
        doc.setLineWidth(1);
        doc.rect(5, 5, W - 10, H - 10);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.2);
        doc.rect(7, 7, W - 14, H - 14);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229);
        doc.text('RECIBO DE PAGAMENTO DE COMISSÃO', W / 2, 18, { align: 'center' });
        
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nº DO ACERTO: ${acerto.id.slice(0, 8).toUpperCase()}`, W / 2, 23, { align: 'center' });

        doc.setFillColor(243, 244, 246);
        doc.rect(W - 60, 28, 50, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`VALOR: ${formatCurrency(acerto.liquido_centavos)}`, W - 56, 34.5);

        let textY = 48;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);

        const empresaNome = empresaNomeAtual || empresa?.nome || 'a Empresa';
        const cnpjTexto = empresa?.cnpj ? `, INSCRITA NO CNPJ SOB O Nº ${empresa.cnpj}` : '';

        const textoRecibo = `RECEBI(EMOS) DE ${empresaNome.toUpperCase()}${cnpjTexto}, A IMPORTÂNCIA LÍQUIDA DE ${formatCurrency(acerto.liquido_centavos)} REFERENTE AO PAGAMENTO DE COMISSÃO SOBRE COBRANÇAS EM CAMPO NO PERÍODO/REFERÊNCIA "${(acerto.periodo_info || 'AVULSO').toUpperCase()}", CONFORME ACERTO MANUAL DE CONTAS REALIZADO EM ${new Date(acerto.data + 'T12:00').toLocaleDateString('pt-BR')}.`;

        const splitTexto = doc.splitTextToSize(textoRecibo, W - 24);
        doc.text(splitTexto, 12, textY);
        textY += (splitTexto.length * 6) + 12;

        const hoje = new Date();
        const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const dataTexto = `EMITIDO EM ${hoje.getDate()} DE ${meses[hoje.getMonth()]} DE ${hoje.getFullYear()}`;
        doc.text(dataTexto, W / 2, textY, { align: 'center' });

        textY += 25;

        doc.setLineWidth(0.3);
        doc.setDrawColor(100, 116, 139);
        doc.line(W / 2 - 40, textY, W / 2 + 40, textY);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(acerto.cobrador_nome.toUpperCase(), W / 2, textY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text('ASSINATURA DO COBRADOR', W / 2, textY + 9, { align: 'center' });

        doc.save(`recibo-comissao-${acerto.cobrador_nome.toLowerCase().replace(/\s+/g, '-')}-${acerto.data}.pdf`);
    };

    const carregarSessoesAcerto = async () => {
        if (!acertoCobrador || !acertoDataInicio || !acertoDataFim) return;
        setLoadingAcerto(true);
        setAcertoResultado(null);
        try {
            // Primeiro busca recebimentos para calcular as quantidades e comissões do cobrador no período
            const recebimentos = await listarBaixasComissaoCobrador(empresaIdsFiltro, {
                data_inicio: acertoDataInicio,
                data_fim: acertoDataFim,
                cobrador_id: acertoCobrador,
            });
            setAcertoBaixas(recebimentos);

            // Localizar configurações de comissão do cobrador
            let activeCobradores = cobradoresList;
            if (cobradoresList.length === 0) {
                const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(empresaIdsQueryCobradores);
                const cobradoresRaw = await listarCobradoresComissao(idsQuery);
                activeCobradores = cobradoresRaw.map((c) => ({
                    id: c.id,
                    nome: c.nome,
                    comissao_percentual: c.comissao_percentual,
                    comissao_por_metodo: c.comissao_por_metodo,
                    empresa_id: c.empresa_id,
                    filial_id: c.filial_id,
                }));
                setCobradoresList(activeCobradores);
            }
            
            const cobradorCfg = activeCobradores.find((c) => String(c.id) === acertoCobrador);
            const percentualBase = Number(cobradorCfg?.comissao_percentual || 0);

            const methodsMap = new Map<string, { metodo: string; recebido_centavos: number; comissao_centavos: number; quantidade: number; taxa_exibicao: string }>();
            let totalQtd = 0;

            recebimentos.forEach((r) => {
                const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
                const taxaMetodo = Number(cobradorCfg?.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
                const tipoMetodo = (cobradorCfg?.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
                
                const valorCentavos = Number(r.valor_centavos || 0);
                const comissaoMetodo = tipoMetodo === 'fixo'
                    ? Math.round(taxaMetodo * 100)
                    : Math.round(valorCentavos * (taxaMetodo / 100));

                totalQtd += 1;

                const taxaExibicao = tipoMetodo === 'fixo'
                    ? `R$ ${taxaMetodo.toFixed(2)}`
                    : `${taxaMetodo}%`;

                const actual = methodsMap.get(metodoNormalizado);
                if (!actual) {
                    methodsMap.set(metodoNormalizado, {
                        metodo: metodoNormalizado,
                        recebido_centavos: valorCentavos,
                        comissao_centavos: comissaoMetodo,
                        quantidade: 1,
                        taxa_exibicao: taxaExibicao
                    });
                } else {
                    actual.recebido_centavos += valorCentavos;
                    actual.comissao_centavos += comissaoMetodo;
                    actual.quantidade += 1;
                }
            });

            const recebimentosBreakdown = Array.from(methodsMap.values());
            setAcertoRecebimentos(recebimentosBreakdown);
            setAcertoQuantidadeTotal(totalQtd);

            const vinculos = await carregarContasCobrador(acertoCobrador);
            if (vinculos.length === 0) {
                setAcertoSessoes([]);
                setAcertoContasDestino([]);
                setAcertoStep(2);
                return;
            }

            const contaIds = vinculos.map((v) => v.conta_bancaria_id);

            const inicioDia = `${acertoDataInicio}T00:00:00`;
            const fimDia = `${acertoDataFim}T23:59:59`;
            const { data: sessoes } = await supabase
                .from('fin_caixa_sessoes')
                .select('id, conta_bancaria_id, saldo_sistema_centavos, empresa_id, status, data_abertura')
                .in('conta_bancaria_id', contaIds)
                .eq('status', 'aberto')
                .gte('data_abertura', inicioDia)
                .lte('data_abertura', fimDia);

            const sessoesBrutas = (sessoes || []) as Array<{
                id: string;
                conta_bancaria_id: string;
                saldo_sistema_centavos: number | null;
                empresa_id: string;
                data_abertura: string;
            }>;

            await Promise.all(
                sessoesBrutas.map((s) =>
                    supabase.rpc('fin_sync_baixas_caixa_sessao', { p_sessao_id: s.id }),
                ),
            );

            const saldosAtualizados = await Promise.all(
                sessoesBrutas.map(async (s) => {
                    const { data: saldo } = await supabase.rpc('fin_caixa_saldo_fisico_sessao', {
                        p_sessao_id: s.id,
                    });
                    return { id: s.id, saldo: saldo != null ? Number(saldo) : Number(s.saldo_sistema_centavos || 0) };
                }),
            );
            const saldoMap = new Map(saldosAtualizados.map((x) => [x.id, x.saldo]));

            const { data: contas } = await supabase
                .from('fin_contas_bancarias')
                .select('id, nome')
                .in('id', contaIds);

            const contaMap = new Map((contas || []).map((c: any) => [String(c.id), String(c.nome || '')]));

            const sessoesInfo: AcertoSessaoInfo[] = sessoesBrutas.map((s) => ({
                sessao_id: String(s.id),
                conta_id: String(s.conta_bancaria_id),
                conta_nome: contaMap.get(String(s.conta_bancaria_id)) || 'Caixa',
                saldo_sistema_centavos: saldoMap.get(s.id) ?? Number(s.saldo_sistema_centavos || 0),
                empresa_id: String(s.empresa_id),
                data_abertura: String(s.data_abertura || ''),
            }));

            setAcertoSessoes(sessoesInfo);

            if (sessoesInfo.length > 0) {
                const empresaIdSessao = sessoesInfo[0].empresa_id;
                const { data: todasContas } = await supabase
                    .from('fin_contas_bancarias')
                    .select('id, nome, tipo')
                    .eq('empresa_id', empresaIdSessao)
                    .eq('ativo', true);

                const cobContaIds = new Set(contaIds);
                const destContas = ((todasContas || []) as any[])
                    .filter((c: any) => !cobContaIds.has(String(c.id)))
                    .map((c: any) => ({ id: String(c.id), nome: String(c.nome || ''), tipo: String(c.tipo || '') }));

                setAcertoContasDestino(destContas);
                if (destContas.length > 0) {
                    setAcertoContaDestinoId((prev) => (prev && destContas.some((c) => c.id === prev) ? prev : destContas[0].id));
                }
            } else {
                setAcertoContasDestino([]);
            }
            setAcertoStep(2);
        } catch (err: any) {
            showToast(`Erro ao carregar sessões: ${err.message || 'Erro desconhecido'}`, 'error');
        } finally {
            setLoadingAcerto(false);
        }
    };

    const acertoResolvido = useMemo(
        () => resolverSessoesAcertoCobrador(acertoSessoes),
        [acertoSessoes],
    );

    const acertoTotalCentavos = useMemo(
        () => acertoResolvido.efetivas.reduce((sum, s) => sum + Math.max(0, s.saldo_sistema_centavos), 0),
        [acertoResolvido.efetivas],
    );

    const executarAcerto = async () => {
        const { efetivas, obsoletas } = acertoResolvido;
        if (!acertoCobrador || !acertoContaDestinoId || efetivas.length === 0) return;
        if (acertoTotalCentavos <= 0) {
            showToast('Saldo do caixa é zero. Não há valor a transferir.', 'error');
            return;
        }
        setLoadingAcerto(true);
        setAcertoConfirmando(false);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || null;

            const cobradorNome = cobradoresList.find((c) => c.id === acertoCobrador)?.nome || 'Cobrador';
            const descricao = `Acerto cobrador ${cobradorNome} - ${acertoDataInicio} a ${acertoDataFim}`;

            for (const sessao of efetivas) {
                if (sessao.saldo_sistema_centavos <= 0) continue;

                const { error: sangriaErr } = await supabase.rpc('fin_realizar_sangria', {
                    p_sessao_id: sessao.sessao_id,
                    p_conta_destino_id: acertoContaDestinoId,
                    p_valor_centavos: sessao.saldo_sistema_centavos,
                    p_descricao: descricao,
                    p_usuario_id: userId,
                });
                if (sangriaErr) throw new Error(`Sangria falhou: ${sangriaErr.message}`);

                const { error: fechErr } = await supabase
                    .from('fin_caixa_sessoes')
                    .update({
                        status: 'fechado',
                        saldo_sistema_centavos: 0,
                        saldo_informado_centavos: 0,
                        diferenca_centavos: 0,
                        data_fechamento: new Date().toISOString(),
                        usuario_fechamento_id: userId,
                        observacoes_fechamento: descricao,
                    })
                    .eq('id', sessao.sessao_id)
                    .eq('status', 'aberto');
                if (fechErr) throw new Error(`Fechamento falhou: ${fechErr.message}`);
            }

            for (const sessao of obsoletas) {
                const { error: fechObsoletoErr } = await supabase
                    .from('fin_caixa_sessoes')
                    .update({
                        status: 'fechado',
                        saldo_sistema_centavos: 0,
                        saldo_informado_centavos: 0,
                        diferenca_centavos: 0,
                        data_fechamento: new Date().toISOString(),
                        usuario_fechamento_id: userId,
                        observacoes_fechamento:
                            'Fechamento automático no acerto — saldo já encaminhado para sessão posterior.',
                    })
                    .eq('id', sessao.sessao_id)
                    .eq('status', 'aberto');
                if (fechObsoletoErr) throw new Error(`Fechamento da sessão antiga falhou: ${fechObsoletoErr.message}`);
            }

            const contaDestinoNome = acertoContasDestino.find((c) => c.id === acertoContaDestinoId)?.nome || 'Conta';

            setAcertoResultado({
                cobrador_nome: cobradorNome,
                data_inicio: acertoDataInicio,
                data_fim: acertoDataFim,
                sessoes: efetivas,
                total_centavos: acertoTotalCentavos,
                conta_destino_nome: contaDestinoNome,
            });

            setAcertoSessoes([]);
            setAcertoCobrador('');
            setAcertoStep(4);
            showToast('Acerto realizado com sucesso!', 'success');
            try { window.dispatchEvent(new CustomEvent('fin-caixa-updated')); } catch { /* ignore */ }
        } catch (err: any) {
            showToast(`Erro no acerto: ${err.message || 'Erro desconhecido'}`, 'error');
        } finally {
            setLoadingAcerto(false);
        }
    };

    const imprimirRelatorioAcerto = (resultado: AcertoResultado) => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(16);
        doc.text('RELATÓRIO DE ACERTO DE COBRADOR', 14, 18);
        doc.setFontSize(10);
        const periodoTexto = resultado.data_inicio === resultado.data_fim
            ? new Date(resultado.data_inicio + 'T12:00').toLocaleDateString('pt-BR')
            : `${new Date(resultado.data_inicio + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(resultado.data_fim + 'T12:00').toLocaleDateString('pt-BR')}`;
        doc.text(`Período do acerto: ${periodoTexto}`, 14, 26);
        doc.text(`COBRADOR: ${resultado.cobrador_nome.toUpperCase()}`, 14, 32);
        doc.text(`TRANSFERIDO PARA: ${resultado.conta_destino_nome.toUpperCase()}`, 14, 38);
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, 14, 44);

        const body = resultado.sessoes.map((s) => [
            s.conta_nome.toUpperCase(),
            formatCurrency(s.saldo_sistema_centavos),
            'SANGRIA + FECHAMENTO',
        ]);

        autoTable(doc, {
            startY: 50,
            head: [['CAIXA', 'VALOR TRANSFERIDO', 'OPERAÇÃO']],
            body,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
        });

        const finalY = (doc as any).lastAutoTable?.finalY || 80;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTAL TRANSFERIDO: ${formatCurrency(resultado.total_centavos)}`, 14, finalY + 10);

        doc.save(`acerto-cobrador-${resultado.cobrador_nome.toLowerCase().replace(/\s+/g, '-')}-${resultado.data_inicio}-a-${resultado.data_fim}.pdf`);
    };

    const imprimirDetalhamentoRecebidos = () => {
        if (!acertoCobrador || acertoBaixas.length === 0) return;
        
        const cobradorNome = cobradoresList.find((c) => c.id === acertoCobrador)?.nome || 'Cobrador';
        const cobradorCfg = cobradoresList.find((c) => String(c.id) === acertoCobrador);
        const percentualBase = Number(cobradorCfg?.comissao_percentual || 0);

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DETALHADO DE RECEBIMENTOS EM CAMPO', 14, 18);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const periodoTexto = acertoDataInicio === acertoDataFim
            ? new Date(acertoDataInicio + 'T12:00').toLocaleDateString('pt-BR')
            : `${new Date(acertoDataInicio + 'T12:00').toLocaleDateString('pt-BR')} A ${new Date(acertoDataFim + 'T12:00').toLocaleDateString('pt-BR')}`;
            
        doc.text(`PERÍODO: ${periodoTexto}`, 14, 25);
        doc.text(`COBRADOR: ${cobradorNome.toUpperCase()}`, 14, 30);
        doc.text(`TOTAL LANÇAMENTOS: ${acertoQuantidadeTotal}`, 14, 35);
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, 14, 40);

        const body = acertoBaixas.map((r) => {
            const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
            const taxaMetodo = Number(cobradorCfg?.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
            const tipoMetodo = (cobradorCfg?.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
            
            const valorCentavos = Number(r.valor_centavos || 0);
            const comissaoMetodo = tipoMetodo === 'fixo'
                ? Math.round(taxaMetodo * 100)
                : Math.round(valorCentavos * (taxaMetodo / 100));

            return [
                new Date(r.data + 'T12:00').toLocaleDateString('pt-BR'),
                (r.cliente_nome || '-').toUpperCase(),
                (r.parcela_codigo || '-').toUpperCase(),
                (labelMetodos[metodoNormalizado] || metodoNormalizado).toUpperCase(),
                formatCurrency(valorCentavos),
                formatCurrency(comissaoMetodo)
            ];
        });

        autoTable(doc, {
            startY: 45,
            head: [['DATA', 'CLIENTE', 'CONTRATO / PARCELA', 'FORMATO', 'VALOR PAGO', 'COMISSÃO']],
            body,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
            columnStyles: {
                4: { halign: 'right' },
                5: { halign: 'right' }
            }
        });

        const finalY = (doc as any).lastAutoTable?.finalY || 80;

        // Tabela de Resumo Diário no PDF
        const bodyDia = acertoPorDia.map((d) => [
            new Date(d.data + 'T12:00').toLocaleDateString('pt-BR'),
            String(d.quantidade),
            formatCurrency(d.recebido_centavos),
            formatCurrency(d.comissao_centavos)
        ]);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO DIÁRIO DE COBRANÇA', 14, finalY + 12);

        autoTable(doc, {
            startY: finalY + 16,
            head: [['DATA', 'QTD LANÇAMENTOS', 'TOTAL RECEBIDO', 'TOTAL COMISSÃO']],
            body: bodyDia,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right' }
            }
        });

        const finalYDia = (doc as any).lastAutoTable?.finalY || (finalY + 40);
        
        const totalRecebido = acertoBaixas.reduce((sum, r) => sum + Number(r.valor_centavos || 0), 0);
        const totalComissao = acertoBaixas.reduce((sum, r) => {
            const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
            const taxaMetodo = Number(cobradorCfg?.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
            const tipoMetodo = (cobradorCfg?.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
            
            const valorCentavos = Number(r.valor_centavos || 0);
            return sum + (tipoMetodo === 'fixo' ? Math.round(taxaMetodo * 100) : Math.round(valorCentavos * (taxaMetodo / 100)));
        }, 0);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Geral Recebido: ${formatCurrency(totalRecebido)}`, 14, finalYDia + 10);
        doc.text(`Total Geral de Comissão: ${formatCurrency(totalComissao)}`, 14, finalYDia + 15);

        doc.save(`detalhe-recebidos-${cobradorNome.toLowerCase().replace(/\s+/g, '-')}-${acertoDataInicio}-a-${acertoDataFim}.pdf`);
    };

    const mesesDisponiveis = useMemo(() => {
        const list = [];
        const hoje = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            list.push({ value: `${yyyy}-${mm}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
        }
        return list;
    }, []);

    const [mesFilter, setMesFilter] = useState(() => {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    });
    const [dataInicio, setDataInicio] = useState(() => periodoDoMes(
        (() => {
            const hoje = new Date();
            return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        })(),
    ).inicio);
    const [dataFim, setDataFim] = useState(() => periodoDoMes(
        (() => {
            const hoje = new Date();
            return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        })(),
    ).fim);

    const [statusFilter, setStatusFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [cobradorFilter, setCobradorFilter] = useState('');
    const [comissoes, setComissoes] = useState<ComissaoCobrador[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedBaixas, setExpandedBaixas] = useState<Set<string>>(new Set());

    const [editingCobrador, setEditingCobrador] = useState<{
        id: string;
        nome: string;
        comissao_percentual: number;
        comissao_por_metodo: {
            dinheiro: number;
            dinheiro_tipo: 'percentual' | 'fixo';
            pix: number;
            pix_tipo: 'percentual' | 'fixo';
            cartao: number;
            cartao_tipo: 'percentual' | 'fixo';
            boleto: number;
            boleto_tipo: 'percentual' | 'fixo';
            transferencia: number;
            transferencia_tipo: 'percentual' | 'fixo';
        };
    } | null>(null);

    const handleSaveRates = async () => {
        if (!editingCobrador) return;
        try {
            const { error } = await supabase
                .from('cobradores')
                .update({
                    comissao_percentual: editingCobrador.comissao_percentual,
                    comissao_por_metodo: editingCobrador.comissao_por_metodo
                })
                .eq('id', editingCobrador.id);

            if (error) throw error;

            showToast(`Taxas de comissão de ${editingCobrador.nome} salvas com sucesso!`, 'success');
            setEditingCobrador(null);
            setReloadCounter(prev => prev + 1);
        } catch (err: any) {
            console.error('Erro ao salvar comissões:', err);
            showToast('Erro ao salvar as comissões.', 'error');
        }
    };

    useEffect(() => {
        const load = async () => {
            if (empresaIdsFiltro.length === 0) return;
            setLoading(true);
            try {
                const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(empresaIdsQueryCobradores);
                const [cobradoresRaw, filiaisRows] = await Promise.all([
                    listarCobradoresComissao(idsQuery),
                    supabase.from('filiais').select('id, nome').in('empresa_id', idsQuery),
                ]);

                const recebimentos = await listarBaixasComissaoCobrador(empresaIdsFiltro, {
                    data_inicio: dataInicio,
                    data_fim: dataFim,
                    ...(cobradorRestrito && meuCobradorId ? { cobrador_id: meuCobradorId } : {}),
                    ...(cobradorFilter ? { cobrador_id: cobradorFilter } : {}),
                });

                const filiaisCatalogo = (filiaisRows.data || []).map((f) => ({
                    id: String(f.id),
                    nome: String(f.nome || ''),
                }));

                const filialIdsUnidadeGrupo = idsFiliaisDaUnidadeOperacional(filiaisCatalogo, tokenUnidadeGrupo);

                const cobradoresFiltrados = cobradoresRaw
                    .map((c) => ({
                        id: c.id,
                        nome: c.nome,
                        comissao_percentual: c.comissao_percentual,
                        comissao_por_metodo: c.comissao_por_metodo,
                        empresa_id: c.empresa_id,
                        filial_id: c.filial_id,
                        area_atuacao: c.area_atuacao,
                    }))
                    .filter((c) => {
                        if (cobradorRestrito && meuCobradorId && String(c.id) !== meuCobradorId) {
                            return false;
                        }
                        return cobradorPertenceUnidade(
                            {
                                empresa_id: c.empresa_id,
                                filial_id: c.filial_id,
                                area_atuacao: c.area_atuacao,
                            },
                            filiaisCatalogo,
                            {
                                filialIdFixo: shouldFilterByFilialContext ? filialId : undefined,
                                filialIdsUnidade: shouldFilterByUnidadeGrupo ? filialIdsUnidadeGrupo : undefined,
                                tokenUnidade: shouldFilterByUnidadeGrupo ? tokenUnidadeGrupo : undefined,
                                empresaIdAtual: empresaId || undefined,
                            }
                        );
                    });

                setCobradoresList(cobradoresFiltrados);

                const periodoRef = `${dataInicio}_${dataFim}`;
                const porCobrador = new Map<string, ComissaoCobrador>();
                recebimentos.forEach((r) => {
                    const cobradorId = String(r.cobrador_id || '');
                    if (!cobradorId) return;
                    const cobradorCfg = cobradoresFiltrados.find((c) => String(c.id) === cobradorId);
                    if (!cobradorCfg) return;

                    const percentualBase = Number(cobradorCfg.comissao_percentual || 0);
                    const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
                    
                    const taxaMetodo = Number(cobradorCfg.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
                    const tipoMetodo = (cobradorCfg.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
                    
                    const valorCentavos = Number(r.valor_centavos || 0);
                    const comissaoMetodo = tipoMetodo === 'fixo'
                        ? Math.round(taxaMetodo * 100)
                        : Math.round(valorCentavos * (taxaMetodo / 100));

                    const atual = porCobrador.get(cobradorId);
                    if (!atual) {
                        porCobrador.set(cobradorId, {
                            id: `${cobradorId}-${periodoRef}`,
                            cobrador_nome: r.cobrador_nome || cobradorCfg.nome || 'Cobrador',
                            cobrador_id: cobradorId,
                            mes_referencia: periodoRef,
                            total_cobrado_centavos: valorCentavos,
                            total_recebido_centavos: valorCentavos,
                            percentual_comissao: percentualBase,
                            valor_comissao_centavos: comissaoMetodo,
                            bonus_centavos: 0,
                            descontos_centavos: 0,
                            valor_liquido_centavos: comissaoMetodo,
                            status: 'pendente',
                            clientes_visitados: 0,
                            clientes_pagos: 1,
                            baixas: [r],
                            por_metodo: [{
                                metodo: metodoNormalizado,
                                percentual: taxaMetodo,
                                tipo: tipoMetodo,
                                recebido_centavos: valorCentavos,
                                comissao_centavos: comissaoMetodo,
                            }],
                        });
                        return;
                    }

                    atual.total_cobrado_centavos += valorCentavos;
                    atual.total_recebido_centavos += valorCentavos;
                    atual.valor_comissao_centavos += comissaoMetodo;
                    atual.valor_liquido_centavos += comissaoMetodo;
                    atual.clientes_pagos += 1;
                    atual.baixas.push(r);

                    const metodoExistente = atual.por_metodo.find((m) => m.metodo === metodoNormalizado);
                    if (metodoExistente) {
                        metodoExistente.recebido_centavos += valorCentavos;
                        metodoExistente.comissao_centavos += comissaoMetodo;
                        metodoExistente.percentual = taxaMetodo;
                        metodoExistente.tipo = tipoMetodo;
                    } else {
                        atual.por_metodo.push({
                            metodo: metodoNormalizado,
                            percentual: taxaMetodo,
                            tipo: tipoMetodo,
                            recebido_centavos: valorCentavos,
                            comissao_centavos: comissaoMetodo,
                        });
                    }
                });

                setComissoes(Array.from(porCobrador.values()));
            } catch (error) {
                showToast(mensagemErroSupabase(error, 'Erro ao calcular comissões'), 'error');
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [
        mesFilter,
        dataInicio,
        dataFim,
        cobradorFilter,
        showToast,
        empresaIdsFiltro.join(','),
        dataRevisionEmpresa,
        cobradorRestrito,
        meuCobradorId,
        reloadCounter,
        empresaIdsQueryCobradores,
        shouldFilterByFilialContext,
        shouldFilterByUnidadeGrupo,
        filialId,
        tokenUnidadeGrupo,
        empresaId,
        dataRevision
    ]);

    const filtered = useMemo(() => comissoes.filter(c => {
        const matchStatus = !statusFilter || c.status === statusFilter;
        const matchSearch = !searchTerm || activeTab !== 'consulta' || c.cobrador_nome.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCobrador = !cobradorFilter || c.cobrador_id === cobradorFilter;
        return matchStatus && matchSearch && matchCobrador;
    }), [comissoes, statusFilter, searchTerm, cobradorFilter, activeTab]);

    const stats = useMemo(() => ({
        totalComissoes: filtered.reduce((acc, c) => acc + c.valor_liquido_centavos, 0),
        totalRecebido: filtered.reduce((acc, c) => acc + c.total_recebido_centavos, 0),
        cobradores: filtered.length,
        pendentes: filtered.filter(c => c.status === 'pendente').length,
        totalBaixas: filtered.reduce((acc, c) => acc + c.baixas.length, 0),
    }), [filtered]);

    const totaisPorMetodo = useMemo(() => {
        const mapa = new Map<string, { recebido_centavos: number; comissao_centavos: number }>();
        filtered.forEach((c) => {
            c.por_metodo.forEach((m) => {
                const atual = mapa.get(m.metodo) || { recebido_centavos: 0, comissao_centavos: 0 };
                atual.recebido_centavos += m.recebido_centavos;
                atual.comissao_centavos += m.comissao_centavos;
                mapa.set(m.metodo, atual);
            });
        });
        return Array.from(mapa.entries()).map(([metodo, valores]) => ({ metodo, ...valores }));
    }, [filtered]);

    const exportarCsv = () => {
        const linhas: string[] = [];
        linhas.push('Cobrador,Mes,Status,Metodo,Recebido,Taxa,TipoTaxa,Comissao');
        filtered.forEach((c) => {
            c.por_metodo.forEach((m) => {
                linhas.push([
                    `"${c.cobrador_nome}"`,
                    `"${c.mes_referencia}"`,
                    `"${c.status}"`,
                    `"${m.metodo}"`,
                    (m.recebido_centavos / 100).toFixed(2),
                    m.percentual.toFixed(2),
                    m.tipo === 'fixo' ? '"Fixo"' : '"Percentual"',
                    (m.comissao_centavos / 100).toFixed(2),
                ].join(','));
            });
        });

        const blob = new Blob([`\uFEFF${linhas.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comissoes-cobradores-${dataInicio}-a-${dataFim}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportarPdf = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(16);
        doc.text(`COMISSÕES POR COBRADOR — ${dataInicio} A ${dataFim}`.toUpperCase(), 14, 18);
        doc.setFontSize(10);
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, 14, 24);

        const body: string[][] = [];
        filtered.forEach((c) => {
            c.por_metodo.forEach((m) => {
                body.push([
                    c.cobrador_nome.toUpperCase(),
                    m.metodo.replace('_', ' ').toUpperCase(),
                    formatCurrency(m.recebido_centavos),
                    m.tipo === 'fixo' ? `R$ ${m.percentual.toFixed(2)} (FIXO)` : `${m.percentual.toFixed(2)}%`,
                    formatCurrency(m.comissao_centavos),
                    c.status.toUpperCase(),
                ]);
            });
        });

        autoTable(doc, {
            startY: 30,
            head: [['COBRADOR', 'MÉTODO', 'RECEBIDO', 'ALÍQUOTA/TAXA', 'COMISSÃO', 'STATUS']],
            body,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
        });

        doc.save(`comissoes-cobradores-${dataInicio}-a-${dataFim}.pdf`);
    };

    const imprimirRelatorioBaixasCobrador = async (c: ComissaoCobrador) => {
        if (c.baixas.length === 0) return;

        try {
        const cobradorCfg = cobradoresList.find((x) => x.id === c.cobrador_id);
        const percentualBase = Number(cobradorCfg?.comissao_percentual ?? c.percentual_comissao);

        const periodoTexto = dataInicio === dataFim
            ? new Date(dataInicio + 'T12:00').toLocaleDateString('pt-BR')
            : `${new Date(dataInicio + 'T12:00').toLocaleDateString('pt-BR')} A ${new Date(dataFim + 'T12:00').toLocaleDateString('pt-BR')}`;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();

        let startY = await drawRelatorioComissaoFenixHeader(doc, W, {
            subtituloModulo: 'Relatório de Baixas — Comissão de Cobrador',
            badgeTitulo: 'BAIXAS NO PERÍODO (FONTE FINANCEIRA)',
            badgeSubtitulo: periodoTexto,
            empresaLogoUrl: empresa?.logo_url,
            empresaCnpj: empresa?.cnpj || undefined,
            unidadeNome: empresaNomeAtual || empresa?.nome,
        });

        startY += 4;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
        doc.text(`COBRADOR: ${c.cobrador_nome.toUpperCase()}`, PDF_PALETTE.MX, startY);
        startY += 5;
        doc.text(`TOTAL DE BAIXAS: ${c.baixas.length}`, PDF_PALETTE.MX, startY);
        startY += 5;
        doc.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, PDF_PALETTE.MX, startY);
        startY += 6;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text(
            `RECEBIDO: ${formatCurrency(c.total_recebido_centavos)}  |  COMISSÃO: ${formatCurrency(c.valor_comissao_centavos)}  |  LÍQUIDO: ${formatCurrency(c.valor_liquido_centavos)}`,
            PDF_PALETTE.MX,
            startY,
        );
        startY += 8;

        const bodyBaixas = c.baixas
            .slice()
            .sort((a, b) => b.data.localeCompare(a.data))
            .map((r) => {
                const metodoNormalizado = (r.forma_pagamento || 'dinheiro').toLowerCase();
                const taxaMetodo = Number(cobradorCfg?.comissao_por_metodo?.[metodoNormalizado] ?? percentualBase);
                const tipoMetodo = (cobradorCfg?.comissao_por_metodo?.[`${metodoNormalizado}_tipo`] as 'percentual' | 'fixo') || 'percentual';
                const valorCentavos = Number(r.valor_centavos || 0);
                const comissaoMetodo = tipoMetodo === 'fixo'
                    ? Math.round(taxaMetodo * 100)
                    : Math.round(valorCentavos * (taxaMetodo / 100));

                return [
                    new Date(r.data + 'T12:00').toLocaleDateString('pt-BR'),
                    (r.cliente_nome || '—').toUpperCase(),
                    (r.parcela_codigo || '—').toUpperCase(),
                    (labelMetodos[metodoNormalizado] || metodoNormalizado).toUpperCase(),
                    formatCurrency(valorCentavos),
                    formatCurrency(comissaoMetodo),
                ];
            });

        autoTable(doc, {
            startY,
            head: [['DATA', 'CLIENTE', 'PARCELA', 'FORMA', 'VALOR', 'COMISSÃO']],
            body: bodyBaixas,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
            columnStyles: {
                4: { halign: 'right' },
                5: { halign: 'right' },
            },
            margin: { left: PDF_PALETTE.MX, right: PDF_PALETTE.MX },
        });

        let finalY = (doc as any).lastAutoTable?.finalY || startY + 20;

        if (c.por_metodo.length > 0) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
            doc.text('RESUMO POR FORMA DE PAGAMENTO', PDF_PALETTE.MX, finalY + 12);

            const bodyResumo = c.por_metodo.map((m) => [
                (labelMetodos[m.metodo] || m.metodo.replace('_', ' ')).toUpperCase(),
                formatCurrency(m.recebido_centavos),
                m.tipo === 'fixo' ? `R$ ${m.percentual.toFixed(2)} FIXO` : `${m.percentual.toFixed(2)}%`,
                formatCurrency(m.comissao_centavos),
            ]);

            const totalRecebido = c.por_metodo.reduce((s, m) => s + m.recebido_centavos, 0);
            const totalComissao = c.por_metodo.reduce((s, m) => s + m.comissao_centavos, 0);
            bodyResumo.push(['TOTAL', formatCurrency(totalRecebido), '', formatCurrency(totalComissao)]);

            autoTable(doc, {
                startY: finalY + 16,
                head: [['FORMA', 'TOTAL RECEBIDO', 'ALÍQUOTA', 'COMISSÃO']],
                body: bodyResumo,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [240, 240, 240], textColor: [20, 28, 45], fontStyle: 'bold' },
                columnStyles: {
                    1: { halign: 'right' },
                    3: { halign: 'right' },
                },
                margin: { left: PDF_PALETTE.MX, right: PDF_PALETTE.MX },
                didParseCell: (data) => {
                    if (data.row.index === bodyResumo.length - 1 && data.section === 'body') {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [243, 244, 246];
                    }
                },
            });

            finalY = (doc as any).lastAutoTable?.finalY || finalY + 40;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
        doc.text(`Total recebido: ${formatCurrency(c.total_recebido_centavos)}`, PDF_PALETTE.MX, finalY + 10);
        doc.text(`Total de comissão: ${formatCurrency(c.valor_comissao_centavos)}`, PDF_PALETTE.MX, finalY + 16);

        const slug = c.cobrador_nome.toLowerCase().replace(/\s+/g, '-');
        doc.save(`baixas-comissao-${slug}-${dataInicio}-a-${dataFim}.pdf`);
        } catch (err: any) {
            showToast(`Erro ao gerar PDF: ${err?.message || 'falha desconhecida'}`, 'error');
        }
    };

    const toggleBaixas = (cobradorId: string) => {
        setExpandedBaixas((prev) => {
            const next = new Set(prev);
            if (next.has(cobradorId)) next.delete(cobradorId);
            else next.add(cobradorId);
            return next;
        });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={cobradorRestrito ? 'Minhas comissões' : 'Comissões de Cobradores'}
                subtitle={
                    cobradorRestrito
                        ? 'Apenas os recebimentos vinculados ao seu cadastro de cobrador.'
                        : 'Comissão calculada sobre baixas de parcelas no financeiro, filtradas por data'
                }
                actionButton={
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {!cobradorRestrito && (
                            <Button
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={abrirAcertoManual}
                            >
                                <Receipt className="h-4 w-4 mr-2" /> Cobrança Manual
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setReloadCounter(prev => prev + 1)}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
                        </Button>
                        <Button variant="outline" onClick={exportarPdf}>
                            <Download className="h-4 w-4 mr-2" /> PDF
                        </Button>
                        <Button variant="outline" onClick={exportarCsv}>
                            <Download className="h-4 w-4 mr-2" /> CSV
                        </Button>
                    </div>
                }
            />

            <div className="flex border-b border-gray-200">
                <button
                    className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${
                        activeTab === 'consulta'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => {
                        setActiveTab('consulta');
                        setSearchTerm('');
                    }}
                >
                    <DollarSign className="h-4 w-4" />
                    Aba 1: Consulta & Cálculo de Comissões
                </button>
                {!cobradorRestrito && (
                    <button
                        className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${
                            activeTab === 'taxas'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                        onClick={() => {
                            setActiveTab('taxas');
                            setSearchTerm('');
                        }}
                    >
                        <Settings className="h-4 w-4" />
                        Aba 2: Configuração de Taxas
                    </button>
                )}
                {!cobradorRestrito && (
                    <button
                        className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${
                            activeTab === 'acerto'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                        onClick={() => {
                            setActiveTab('acerto');
                            setSearchTerm('');
                            setAcertoResultado(null);
                        }}
                    >
                        <ArrowRightLeft className="h-4 w-4" />
                        Aba 3: Acerto do Cobrador
                    </button>
                )}
            </div>

            {activeTab === 'consulta' ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Comissões</p>
                                    <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(stats.totalComissoes)}</p>
                                </div>
                                <Wallet className="h-10 w-10 text-blue-600 opacity-30" />
                            </div>
                        </Card>
                        <Card className="p-5 bg-gradient-to-br from-green-50 to-green-100/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Recebido</p>
                                    <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(stats.totalRecebido)}</p>
                                </div>
                                <TrendingUp className="h-10 w-10 text-green-600 opacity-30" />
                            </div>
                        </Card>
                        <Card className="p-5 bg-gradient-to-br from-purple-50 to-purple-100/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cobradores Ativos</p>
                                    <p className="text-3xl font-bold text-purple-700 mt-1">{stats.cobradores}</p>
                                </div>
                                <User className="h-10 w-10 text-purple-600 opacity-30" />
                            </div>
                        </Card>
                        <Card className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Baixas no período</p>
                                    <p className="text-3xl font-bold text-amber-700 mt-1">{stats.totalBaixas}</p>
                                </div>
                                <CheckCircle2 className="h-10 w-10 text-amber-600 opacity-30" />
                            </div>
                        </Card>
                        <Card className="p-5 bg-gradient-to-br from-slate-50 to-slate-100/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pendentes</p>
                                    <p className="text-3xl font-bold text-slate-700 mt-1">{stats.pendentes}</p>
                                </div>
                                <Clock className="h-10 w-10 text-slate-600 opacity-30" />
                            </div>
                        </Card>
                    </div>

                    {totaisPorMetodo.length > 0 && (
                        <Card className="p-5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                Totais por método — {new Date(dataInicio + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(dataFim + 'T12:00').toLocaleDateString('pt-BR')}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {totaisPorMetodo.map((m) => (
                                    <div key={m.metodo} className="border rounded-lg p-3 bg-gray-50">
                                        <p className="text-sm font-semibold capitalize text-gray-800">
                                            {m.metodo.replace('_', ' ')}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Recebido: {formatCurrency(m.recebido_centavos)}
                                        </p>
                                        <p className="text-sm font-bold text-blue-700 mt-1">
                                            Comissão: {formatCurrency(m.comissao_centavos)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white p-4 rounded-xl shadow-sm border">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mês rápido</label>
                            <Select
                                value={mesFilter}
                                onChange={e => {
                                    const val = e.target.value;
                                    setMesFilter(val);
                                    const p = periodoDoMes(val);
                                    setDataInicio(p.inicio);
                                    setDataFim(p.fim);
                                }}
                            >
                                {mesesDisponiveis.map((m) => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data início</label>
                            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data fim</label>
                            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cobrador</label>
                            <Select value={cobradorFilter} onChange={e => setCobradorFilter(e.target.value)}>
                                <option value="">Todos os Cobradores</option>
                                {cobradoresList.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="">Todos os Status</option>
                                <option value="pendente">Pendente</option>
                                <option value="aprovada">Aprovada</option>
                                <option value="paga">Paga</option>
                            </Select>
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Buscar Nome</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <Input placeholder="Buscar..." className="pl-9"
                                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex items-end">
                            <Button
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2 h-10 shadow-sm transition-all"
                                onClick={() => {
                                    setReloadCounter(prev => prev + 1);
                                    showToast("Dados atualizados!", "success");
                                }}
                                loading={loading}
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Puxar Dados
                            </Button>
                        </div>
                    </div>

                    {cobradorFilter && (
                        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between shadow-sm animate-in slide-in-from-top-1 duration-200">
                            <div>
                                Exibindo dados de comissão para: <strong>{cobradoresList.find(c => c.id === cobradorFilter)?.nome || 'Cobrador'}</strong>.
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setCobradorFilter('')}>
                                Ver Todos
                            </Button>
                        </div>
                    )}

                    <div className="space-y-4">
                        {loading && (
                            <Card className="p-6 text-center text-gray-500">Calculando comissões...</Card>
                        )}
                        {!loading && filtered.length === 0 && (
                            <Card className="p-8 text-center text-gray-500 border-dashed border-2">
                                Nenhuma baixa de parcela encontrada para o período selecionado com cobrador identificado.
                            </Card>
                        )}
                        {!loading && filtered.map(c => {
                            const eficiencia = c.total_cobrado_centavos > 0
                                ? ((c.total_recebido_centavos / c.total_cobrado_centavos) * 100)
                                : 0;
                            const baixasExpandidas = expandedBaixas.has(c.cobrador_id);

                            return (
                                <Card key={c.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`h-1 ${c.status === 'paga' ? 'bg-green-500' : c.status === 'aprovada' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                                    <div className="p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-11 w-11 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-lg">
                                                    {c.cobrador_nome.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-lg">{c.cobrador_nome}</p>
                                                    <p className="text-xs text-gray-500">
                                                        Período: {new Date(dataInicio + 'T12:00').toLocaleDateString('pt-BR')} — {new Date(dataFim + 'T12:00').toLocaleDateString('pt-BR')}
                                                        {' · '}{c.baixas.length} baixa(s)
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!cobradorRestrito && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            const cobCfg = cobradoresList.find(x => x.id === c.cobrador_id);
                                                            setEditingCobrador({
                                                                id: c.cobrador_id,
                                                                nome: c.cobrador_nome,
                                                                comissao_percentual: cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                comissao_por_metodo: {
                                                                    dinheiro: cobCfg?.comissao_por_metodo?.dinheiro ?? cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                    dinheiro_tipo: (cobCfg?.comissao_por_metodo?.dinheiro_tipo as any) ?? 'percentual',
                                                                    pix: cobCfg?.comissao_por_metodo?.pix ?? cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                    pix_tipo: (cobCfg?.comissao_por_metodo?.pix_tipo as any) ?? 'percentual',
                                                                    cartao: cobCfg?.comissao_por_metodo?.cartao ?? cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                    cartao_tipo: (cobCfg?.comissao_por_metodo?.cartao_tipo as any) ?? 'percentual',
                                                                    boleto: cobCfg?.comissao_por_metodo?.boleto ?? cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                    boleto_tipo: (cobCfg?.comissao_por_metodo?.boleto_tipo as any) ?? 'percentual',
                                                                    transferencia: cobCfg?.comissao_por_metodo?.transferencia ?? cobCfg?.comissao_percentual ?? c.percentual_comissao,
                                                                    transferencia_tipo: (cobCfg?.comissao_por_metodo?.transferencia_tipo as any) ?? 'percentual',
                                                                }
                                                            });
                                                        }}
                                                    >
                                                        <Settings className="h-4 w-4 mr-1 text-slate-500" /> Taxas
                                                    </Button>
                                                )}
                                                <StatusBadge status={c.status} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 bg-gray-50 rounded-xl p-4">
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">A Cobrar</p>
                                                <p className="text-sm font-bold text-gray-900">{formatCurrency(c.total_cobrado_centavos)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Recebido</p>
                                                <p className="text-sm font-bold text-green-700">{formatCurrency(c.total_recebido_centavos)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Comissão</p>
                                                <p className="text-sm font-bold text-blue-700">{formatCurrency(c.valor_comissao_centavos)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bônus</p>
                                                <p className="text-sm font-bold text-emerald-700">{formatCurrency(c.bonus_centavos)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Descontos</p>
                                                <p className="text-sm font-bold text-red-600">
                                                    {c.descontos_centavos > 0 ? `-${formatCurrency(c.descontos_centavos)}` : 'R$ 0,00'}
                                                </p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 border-2 border-blue-100">
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Líquido</p>
                                                <p className="text-lg font-bold text-blue-700">{formatCurrency(c.valor_liquido_centavos)}</p>
                                            </div>
                                        </div>

                                        {c.por_metodo.length > 0 && (
                                            <div className="mt-4 border rounded-xl overflow-hidden">
                                                <div className="px-4 py-2 bg-gray-50 border-b">
                                                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Comissão por método de pagamento
                                                    </p>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-left text-xs text-gray-500 uppercase border-b bg-white">
                                                                <th className="px-4 py-2">Forma</th>
                                                                <th className="px-4 py-2 text-right">Recebido</th>
                                                                <th className="px-4 py-2 text-right">Alíquota</th>
                                                                <th className="px-4 py-2 text-right">Comissão</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {c.por_metodo.map((m) => (
                                                                <tr key={`${c.id}-${m.metodo}`} className="border-b last:border-0 hover:bg-gray-50/80">
                                                                    <td className="px-4 py-2 capitalize text-gray-700">{m.metodo.replace('_', ' ')}</td>
                                                                    <td className="px-4 py-2 text-right font-medium text-gray-800">
                                                                        {formatCurrency(m.recebido_centavos)}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right text-gray-600">
                                                                        {m.tipo === 'fixo'
                                                                            ? `R$ ${m.percentual.toFixed(2)} fixo`
                                                                            : `${m.percentual.toFixed(2)}%`}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right font-semibold text-blue-700">
                                                                        {formatCurrency(m.comissao_centavos)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                                                                <td className="px-4 py-2 text-gray-800">Total</td>
                                                                <td className="px-4 py-2 text-right text-green-700">
                                                                    {formatCurrency(c.por_metodo.reduce((s, m) => s + m.recebido_centavos, 0))}
                                                                </td>
                                                                <td className="px-4 py-2" />
                                                                <td className="px-4 py-2 text-right text-blue-700">
                                                                    {formatCurrency(c.por_metodo.reduce((s, m) => s + m.comissao_centavos, 0))}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {c.baixas.length > 0 && (
                                            <div className="mt-4 border border-amber-200 rounded-xl overflow-hidden shadow-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleBaixas(c.cobrador_id)}
                                                    aria-expanded={baixasExpandidas}
                                                    className={`w-full px-4 py-3.5 flex items-center justify-between gap-3 transition-all text-left group ${
                                                        baixasExpandidas
                                                            ? 'bg-amber-100/80 border-b border-amber-200'
                                                            : 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                                            baixasExpandidas
                                                                ? 'bg-amber-500 text-white shadow-sm'
                                                                : 'bg-amber-200 text-amber-800 group-hover:bg-amber-300'
                                                        }`}>
                                                            <Receipt className="h-5 w-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-gray-800">
                                                                    Baixas no período
                                                                </p>
                                                                <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                                                                    {c.baixas.length} baixa{c.baixas.length !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                Fonte financeira
                                                                {!baixasExpandidas && (
                                                                    <span className="text-gray-600">
                                                                        {' · '}
                                                                        {formatCurrency(c.por_metodo.reduce((s, m) => s + m.recebido_centavos, 0))} recebido
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                imprimirRelatorioBaixasCobrador(c);
                                                            }}
                                                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold bg-white text-amber-800 border border-amber-300 shadow-sm hover:bg-amber-50 transition-colors"
                                                            title="Imprimir relatório de baixas"
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                            <span className="hidden sm:inline">Imprimir</span>
                                                        </button>
                                                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                                            baixasExpandidas
                                                                ? 'bg-white text-amber-800 border border-amber-300 shadow-sm'
                                                                : 'bg-amber-500 text-white group-hover:bg-amber-600 shadow-sm'
                                                        }`}>
                                                            <span className="hidden sm:inline">
                                                                {baixasExpandidas ? 'Ocultar detalhes' : 'Ver detalhes'}
                                                            </span>
                                                            {baixasExpandidas ? (
                                                                <ChevronUp className="h-5 w-5" />
                                                            ) : (
                                                                <ChevronDown className="h-5 w-5" />
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                                {baixasExpandidas && (
                                                <>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-left text-xs text-gray-500 uppercase border-b bg-white">
                                                                <th className="px-4 py-2">Data</th>
                                                                <th className="px-4 py-2">Cliente</th>
                                                                <th className="px-4 py-2">Parcela</th>
                                                                <th className="px-4 py-2">Forma</th>
                                                                <th className="px-4 py-2 text-right">Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {c.baixas
                                                                .slice()
                                                                .sort((a, b) => b.data.localeCompare(a.data))
                                                                .map((b) => (
                                                                    <tr key={b.id} className="border-b hover:bg-gray-50/80">
                                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                                            {new Date(b.data + 'T12:00').toLocaleDateString('pt-BR')}
                                                                        </td>
                                                                        <td className="px-4 py-2">{b.cliente_nome}</td>
                                                                        <td className="px-4 py-2 text-gray-500">{b.parcela_codigo || '—'}</td>
                                                                        <td className="px-4 py-2 capitalize">{b.forma_pagamento.replace('_', ' ')}</td>
                                                                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(b.valor_centavos)}</td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {c.por_metodo.length > 0 && (
                                                    <div className="border-t bg-gray-50 overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                                    <th className="px-4 py-2">Forma</th>
                                                                    <th className="px-4 py-2 text-right">Total recebido</th>
                                                                    <th className="px-4 py-2 text-right">Comissão</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {c.por_metodo.map((m) => (
                                                                    <tr key={`resumo-${c.id}-${m.metodo}`} className="border-b border-gray-100">
                                                                        <td className="px-4 py-2 capitalize text-gray-700">{m.metodo.replace('_', ' ')}</td>
                                                                        <td className="px-4 py-2 text-right font-medium text-gray-800">
                                                                            {formatCurrency(m.recebido_centavos)}
                                                                        </td>
                                                                        <td className="px-4 py-2 text-right font-semibold text-blue-700">
                                                                            {formatCurrency(m.comissao_centavos)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr className="bg-gray-100 font-semibold border-t-2 border-gray-200">
                                                                    <td className="px-4 py-2 text-gray-800">Total</td>
                                                                    <td className="px-4 py-2 text-right text-green-700">
                                                                        {formatCurrency(c.por_metodo.reduce((s, m) => s + m.recebido_centavos, 0))}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right text-blue-700">
                                                                        {formatCurrency(c.por_metodo.reduce((s, m) => s + m.comissao_centavos, 0))}
                                                                    </td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                )}
                                                </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </>
            ) : activeTab === 'taxas' ? (
                <div className="space-y-4">
                    <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-extrabold text-slate-800 text-lg">Alíquotas de Comissionamento dos Cobradores</h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    Defina as taxas padrão e taxas por método de pagamento de cada cobrador ativo no sistema.
                                </p>
                            </div>
                            <div className="w-full md:w-72 relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <Input 
                                    placeholder="Buscar cobrador por nome..." 
                                    className="pl-9 h-10 border-slate-200 focus:border-blue-500 rounded-xl"
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                />
                            </div>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 gap-4">
                        {cobradoresList
                            .filter(c => !searchTerm || c.nome.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map(c => (
                                <Card key={c.id} className="p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 border border-slate-100 bg-white/90 backdrop-blur-sm rounded-2xl">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-md shadow-blue-500/20 shrink-0">
                                                {c.nome.charAt(0)}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
                                                    <h4 className="font-bold text-slate-800 text-base lg:text-lg leading-tight">{c.nome}</h4>
                                                </div>
                                                <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                                                    Taxa Geral Padrão: {c.comissao_percentual}%
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex flex-wrap gap-2 items-center justify-start lg:justify-center">
                                            {(['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia'] as const).map(metodo => {
                                                const label = metodo === 'pix' ? 'PIX' : metodo === 'cartao' ? 'Cartão' : metodo === 'transferencia' ? 'Transf.' : metodo.charAt(0).toUpperCase() + metodo.slice(1);
                                                const tipo = c.comissao_por_metodo?.[`${metodo}_tipo`] || 'percentual';
                                                const val = c.comissao_por_metodo?.[metodo] ?? c.comissao_percentual ?? 5;
                                                
                                                const styles = {
                                                    dinheiro: 'bg-emerald-50 text-emerald-800 border-emerald-100/60',
                                                    pix: 'bg-indigo-50 text-indigo-800 border-indigo-100/60',
                                                    cartao: 'bg-blue-50 text-blue-800 border-blue-100/60',
                                                    boleto: 'bg-amber-50 text-amber-800 border-amber-100/60',
                                                    transferencia: 'bg-slate-50 text-slate-800 border-slate-100/60',
                                                }[metodo];

                                                return (
                                                    <div key={metodo} className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-sm text-xs font-semibold ${styles}`}>
                                                        <span className="opacity-70">{label}:</span>
                                                        <span className="font-extrabold">{tipo === 'fixo' ? `R$ ${Number(val).toFixed(2)}` : `${val}%`}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="shrink-0 flex justify-end">
                                            <Button
                                                variant="outline"
                                                className="border-slate-200 hover:border-blue-500 hover:text-blue-600 transition-all font-semibold rounded-xl text-sm flex items-center gap-2 h-10 px-4 group"
                                                onClick={() => {
                                                    setEditingCobrador({
                                                        id: c.id,
                                                        nome: c.nome,
                                                        comissao_percentual: c.comissao_percentual ?? 5,
                                                        comissao_por_metodo: {
                                                            dinheiro: c.comissao_por_metodo?.dinheiro ?? c.comissao_percentual ?? 5,
                                                            dinheiro_tipo: (c.comissao_por_metodo?.dinheiro_tipo as any) ?? 'percentual',
                                                            pix: c.comissao_por_metodo?.pix ?? c.comissao_percentual ?? 5,
                                                            pix_tipo: (c.comissao_por_metodo?.pix_tipo as any) ?? 'percentual',
                                                            cartao: c.comissao_por_metodo?.cartao ?? c.comissao_percentual ?? 5,
                                                            cartao_tipo: (c.comissao_por_metodo?.cartao_tipo as any) ?? 'percentual',
                                                            boleto: c.comissao_por_metodo?.boleto ?? c.comissao_percentual ?? 5,
                                                            boleto_tipo: (c.comissao_por_metodo?.boleto_tipo as any) ?? 'percentual',
                                                            transferencia: c.comissao_por_metodo?.transferencia ?? c.comissao_percentual ?? 5,
                                                            transferencia_tipo: (c.comissao_por_metodo?.transferencia_tipo as any) ?? 'percentual',
                                                        }
                                                    });
                                                }}
                                            >
                                                <Settings className="h-4 w-4 text-slate-400 group-hover:text-blue-500 group-hover:rotate-45 transition-all duration-300" />
                                                Configurar Taxas
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                    </div>
                </div>
            ) : activeTab === 'acerto' ? (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <Card className="p-8 bg-white border border-slate-100 shadow-sm rounded-3xl max-w-2xl mx-auto text-center space-y-6 mt-4">
                        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <ArrowRightLeft className="h-8 w-8 text-white" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Acerto Financeiro de Cobrador</h3>
                            <p className="text-sm text-slate-500 max-w-md mx-auto">
                                Transfira os saldos arrecadados em campo pelos cobradores para as contas principais da empresa e realize o fechamento seguro de caixas abertos, ou faça o acerto avulso e gere os recibos correspondentes manualmente.
                            </p>
                        </div>

                        <div className="pt-4 flex flex-col sm:flex-row justify-center gap-4">
                            <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 h-12 shadow-md hover:shadow-emerald-600/10 transition-all rounded-xl w-full sm:w-auto flex items-center justify-center gap-2"
                                onClick={() => {
                                    setAcertoStep(1);
                                    setAcertoResultado(null);
                                    setIsAcertoModalOpen(true);
                                }}
                            >
                                Iniciar Novo Acerto <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            
                            <Button
                                variant="outline"
                                className="border-blue-200 hover:bg-blue-50/50 text-blue-700 font-bold px-8 h-12 transition-all rounded-xl w-full sm:w-auto flex items-center justify-center gap-2"
                                onClick={abrirAcertoManual}
                            >
                                Cobrança Manual <Receipt className="h-4 w-4" />
                            </Button>
                        </div>
                    </Card>

                    {/* Histórico de Cobranças Manuais */}
                    {(acertosManuaisSalvos.length > 0 || carregandoAcertosManuais) && (
                        <Card className="p-6 bg-white border border-slate-100 shadow-sm rounded-3xl max-w-4xl mx-auto mt-6">
                            <div className="flex items-center gap-2 mb-4 border-b pb-3">
                                <History className="h-5 w-5 text-indigo-650" />
                                <h4 className="font-extrabold text-slate-800 text-base">Histórico de Cobranças Manuais</h4>
                            </div>

                            {carregandoAcertosManuais ? (
                                <p className="text-sm text-slate-500 py-4 text-center">Carregando histórico...</p>
                            ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b text-slate-500 font-bold uppercase text-[9px] tracking-wider">
                                            <th className="py-2.5 px-3">Data</th>
                                            <th className="py-2.5 px-3">Cobrador</th>
                                            <th className="py-2.5 px-3">Referência</th>
                                            <th className="py-2.5 px-3 text-right">Total Arrecadado</th>
                                            <th className="py-2.5 px-3 text-right">Comissão Líquida</th>
                                            <th className="py-2.5 px-3 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y text-slate-700">
                                        {acertosManuaisSalvos.map((acerto) => (
                                            <tr key={acerto.id} className="hover:bg-slate-50/40">
                                                <td className="py-2.5 px-3 font-semibold text-slate-900">
                                                    {new Date(acerto.data + 'T12:00').toLocaleDateString('pt-BR')}
                                                </td>
                                                <td className="py-2.5 px-3 font-medium">
                                                    {acerto.cobrador_nome}
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-500 italic">
                                                    {acerto.periodo_info || 'Avulso'}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-semibold">
                                                    {formatCurrency(acerto.total_arrecadado_centavos)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                                                    {formatCurrency(acerto.liquido_centavos)}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <div className="flex justify-center items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => imprimirDocumentoAcertoManual(acerto)}
                                                            className="p-1.5 rounded-lg border border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                                                            title="Imprimir Relatório de Acerto"
                                                        >
                                                            <Printer className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => imprimirReciboComissaoManual(acerto)}
                                                            className="p-1.5 rounded-lg border border-indigo-200 text-indigo-650 hover:bg-indigo-50 hover:text-indigo-900 transition-colors cursor-pointer"
                                                            title="Imprimir Recibo de Comissão"
                                                        >
                                                            <Receipt className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (window.confirm(`Deseja realmente excluir a cobrança manual de ${acerto.cobrador_nome}?`)) {
                                                                    void excluirAcertoManual(acerto.id);
                                                                }
                                                            }}
                                                            className="p-1.5 rounded-lg border border-rose-200 text-rose-650 hover:bg-rose-50 hover:text-rose-900 transition-colors cursor-pointer"
                                                            title="Remover do Histórico"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            )}
                        </Card>
                    )}

                    {acertoResultado && (
                        <Card className="p-6 border border-emerald-100 bg-emerald-50/30 rounded-2xl max-w-2xl mx-auto animate-in slide-in-from-bottom-2 duration-300">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                                    <div>
                                        <p className="font-bold text-emerald-800 text-base">Último acerto concluído com sucesso!</p>
                                        <p className="text-xs text-emerald-700 font-medium mt-0.5">
                                            {acertoResultado.cobrador_nome} · {
                                                acertoResultado.data_inicio === acertoResultado.data_fim
                                                    ? new Date(acertoResultado.data_inicio + 'T12:00').toLocaleDateString('pt-BR')
                                                    : `${new Date(acertoResultado.data_inicio + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(acertoResultado.data_fim + 'T12:00').toLocaleDateString('pt-BR')}`
                                            }
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-100/50 w-full sm:w-auto font-semibold rounded-xl text-xs"
                                    onClick={() => imprimirRelatorioAcerto(acertoResultado)}
                                >
                                    <Printer className="h-4 w-4 mr-2" /> Re-imprimir Relatório
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            ) : null}

            {editingCobrador && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-white p-6 space-y-6 shadow-xl animate-in fade-in duration-200">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Ajuste de Comissões</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Defina as taxas da comissão do cobrador <strong>{editingCobrador.nome}</strong>.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Input
                                    label="Comissão Geral Padrão (%)"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={editingCobrador.comissao_percentual}
                                    onChange={(e) => {
                                        const val = Number(e.target.value) || 0;
                                        setEditingCobrador(prev => {
                                            if (!prev) return null;
                                            return {
                                                ...prev,
                                                comissao_percentual: val,
                                                comissao_por_metodo: {
                                                    dinheiro: val,
                                                    dinheiro_tipo: 'percentual',
                                                    pix: val,
                                                    pix_tipo: 'percentual',
                                                    cartao: val,
                                                    cartao_tipo: 'percentual',
                                                    boleto: val,
                                                    boleto_tipo: 'percentual',
                                                    transferencia: val,
                                                    transferencia_tipo: 'percentual',
                                                }
                                            };
                                        });
                                    }}
                                />
                                <span className="text-[10px] text-gray-500 mt-1 block leading-snug">
                                    Nota: Ajustar a comissão geral atualizará automaticamente todos os métodos abaixo para este mesmo percentual (%).
                                </span>
                            </div>

                            <div className="border-t pt-4">
                                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wider">
                                    Taxas por Meio de Pagamento
                                </p>
                                <div className="space-y-3">
                                    {(['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia'] as const).map((metodo) => {
                                        const label = metodo === 'pix' ? 'PIX' : metodo === 'cartao' ? 'Cartão' : metodo === 'transferencia' ? 'Transf.' : metodo.charAt(0).toUpperCase() + metodo.slice(1);
                                        return (
                                            <div key={metodo} className="grid grid-cols-12 gap-2 items-end border-b pb-2 last:border-0 last:pb-0">
                                                <div className="col-span-4 text-sm font-semibold text-slate-700 pb-2">
                                                    {label}
                                                </div>
                                                <div className="col-span-4">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={editingCobrador.comissao_por_metodo[metodo]}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value) || 0;
                                                            setEditingCobrador(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    comissao_por_metodo: {
                                                                        ...prev.comissao_por_metodo,
                                                                        [metodo]: val
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                    />
                                                </div>
                                                <div className="col-span-4">
                                                    <Select
                                                        value={editingCobrador.comissao_por_metodo[`${metodo}_tipo` as any]}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setEditingCobrador(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    comissao_por_metodo: {
                                                                        ...prev.comissao_por_metodo,
                                                                        [`${metodo}_tipo`]: val
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                    >
                                                        <option value="percentual">Percentual (%)</option>
                                                        <option value="fixo">Fixo (R$)</option>
                                                    </Select>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t">
                            <Button variant="outline" onClick={() => setEditingCobrador(null)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSaveRates}>
                                Salvar Taxas
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {isAcertoModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                    <Card className={`w-full overflow-visible ${acertoStep === 2 ? 'max-w-6xl' : 'max-w-5xl'} bg-white p-6 sm:p-8 space-y-6 shadow-xl transition-all duration-300 animate-in fade-in zoom-in-95 rounded-3xl`}>
                        
                        {/* Stepper Header */}
                        <div className="flex items-center justify-between border-b pb-4">
                            {[{ number: 1, name: 'Parâmetros' }, { number: 2, name: 'Conferência' }, { number: 3, name: 'Fechamento' }, { number: 4, name: 'Conclusão' }].map((s, idx, arr) => (
                                <React.Fragment key={s.number}>
                                    <div className="flex items-center gap-2">
                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                                            acertoStep === s.number
                                                ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                                                : acertoStep > s.number
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-gray-100 text-gray-400'
                                        }`}>
                                            {acertoStep > s.number ? '✓' : s.number}
                                        </div>
                                        <span className={`text-xs font-bold uppercase tracking-wider hidden sm:inline ${
                                            acertoStep === s.number ? 'text-blue-600' : acertoStep > s.number ? 'text-emerald-600' : 'text-gray-400'
                                        }`}>
                                            {s.name}
                                        </span>
                                    </div>
                                    {idx < arr.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-2 transition-all duration-500 ${
                                            acertoStep > s.number ? 'bg-emerald-500' : 'bg-gray-200'
                                        }`} />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Step 1: Parâmetros */}
                        {acertoStep === 1 && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                <div>
                                    <h4 className="font-extrabold text-slate-800 text-base">Configurar Parâmetros de Acerto</h4>
                                    <p className="text-xs text-slate-400 mt-0.5">Selecione o cobrador e o período no qual deseja consultar os caixas.</p>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                                    <div className="lg:col-span-12 min-w-0">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cobrador</label>
                                        <Select
                                            value={acertoCobrador}
                                            onChange={(e) => setAcertoCobrador(e.target.value)}
                                        >
                                            <option value="">Selecione o cobrador...</option>
                                            {cobradoresList.map((c) => (
                                                <option key={c.id} value={c.id}>{c.nome}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="lg:col-span-6 min-w-0">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data Inicial</label>
                                        <Input
                                            type="date"
                                            value={acertoDataInicio}
                                            onChange={(e) => setAcertoDataInicio(e.target.value)}
                                        />
                                    </div>
                                    <div className="lg:col-span-6 min-w-0">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data Final</label>
                                        <Input
                                            type="date"
                                            value={acertoDataFim}
                                            onChange={(e) => setAcertoDataFim(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t">
                                    <Button variant="outline" onClick={resetAcertoWizard} disabled={loadingAcerto}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                        onClick={carregarSessoesAcerto}
                                        disabled={!acertoCobrador || loadingAcerto}
                                        loading={loadingAcerto}
                                    >
                                        Buscar Caixas
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Conferência de Caixas */}
                        {acertoStep === 2 && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                {loadingAcerto ? (
                                    <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                                        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
                                        <p className="font-semibold text-sm">Consultando caixas abertos em campo...</p>
                                    </div>
                                ) : acertoSessoes.length === 0 ? (
                                    <div className="py-8 text-center space-y-4">
                                        <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-600">
                                            <AlertTriangle className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-base">Nenhum Caixa Aberto Encontrado</h4>
                                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                                Não identificamos caixas abertos para o cobrador <strong>{cobradoresList.find(c => c.id === acertoCobrador)?.nome}</strong> no período de {new Date(acertoDataInicio + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(acertoDataFim + 'T12:00').toLocaleDateString('pt-BR')}.
                                            </p>
                                        </div>
                                        <div className="flex justify-center gap-3 pt-4">
                                            <Button variant="outline" onClick={() => setAcertoStep(1)}>
                                                Voltar e Ajustar
                                            </Button>
                                            <Button variant="ghost" onClick={resetAcertoWizard}>
                                                Fechar
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="border-b pb-2">
                                            <h4 className="font-extrabold text-slate-800 text-base">Conferência de Caixas e Recebimentos</h4>
                                            <p className="text-xs text-slate-405 mt-0.5">Valide o que o cobrador recebeu, as taxas aplicadas, as comissões devidas e informe a conta de destino.</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                            {/* Coluna da Esquerda: Caixas e Conta Bancária */}
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sessões Ativas</p>
                                                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                                        <div className="divide-y max-h-48 overflow-y-auto">
                                                            {acertoResolvido.efetivas.map((s) => (
                                                                <div key={s.sessao_id} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/40">
                                                                    <div>
                                                                        <p className="font-bold text-slate-800">{s.conta_nome}</p>
                                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                                            Sessão {s.sessao_id.slice(0, 8)}… · Abertura: {new Date(s.data_abertura).toLocaleDateString('pt-BR')}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-[10px] text-slate-400 uppercase">Saldo</p>
                                                                        <p className="font-bold text-emerald-600">{formatCurrency(s.saldo_sistema_centavos)}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {acertoResolvido.obsoletas.length > 0 && (
                                                            <div className="px-4 py-2 bg-amber-50/50 border-t border-amber-100 text-[10px] text-amber-800 font-medium">
                                                                Nota: {acertoResolvido.obsoletas.length} caixa(s) inativo(s) será(ão) fechado(s) automaticamente (saldo zerado).
                                                            </div>
                                                        )}
                                                        <div className="px-4 py-2.5 bg-emerald-50 border-t flex items-center justify-between">
                                                            <span className="text-xs font-bold text-slate-700">Total a Transferir</span>
                                                            <span className="text-sm font-black text-emerald-700">{formatCurrency(acertoTotalCentavos)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase">Transferir para a Conta</label>
                                                    <Select
                                                        value={acertoContaDestinoId}
                                                        onChange={(e) => setAcertoContaDestinoId(e.target.value)}
                                                        disabled={acertoContasDestino.length === 0}
                                                    >
                                                        {acertoContasDestino.length === 0
                                                            ? <option value="">Sem contas de destino disponíveis...</option>
                                                            : acertoContasDestino.map((c) => (
                                                                <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>
                                                            ))
                                                        }
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* Coluna da Direita: Recebimentos e Comissões */}
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2 select-none py-1">
                                                            <span 
                                                                className={`text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                                                                    acertoFiltroResumo === 'formato' ? 'text-blue-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
                                                                }`}
                                                                onClick={() => setAcertoFiltroResumo('formato')}
                                                            >
                                                                Por Formato
                                                            </span>
                                                            <label className="switch">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={acertoFiltroResumo === 'dia'}
                                                                    onChange={(e) => setAcertoFiltroResumo(e.target.checked ? 'dia' : 'formato')}
                                                                />
                                                                <span className="slider"></span>
                                                            </label>
                                                            <span 
                                                                className={`text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                                                                    acertoFiltroResumo === 'dia' ? 'text-blue-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
                                                                }`}
                                                                onClick={() => setAcertoFiltroResumo('dia')}
                                                            >
                                                                Por Dia
                                                            </span>
                                                        </div>
                                                        {acertoBaixas.length > 0 && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 px-2.5 text-[11px] border-blue-200 text-blue-750 hover:bg-blue-50 font-semibold rounded-lg flex items-center gap-1 shadow-sm"
                                                                onClick={imprimirDetalhamentoRecebidos}
                                                            >
                                                                <Printer className="h-3 w-3" /> Imprimir Detalhado
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                                                        {acertoFiltroResumo === 'formato' ? (
                                                            <table className="w-full text-left text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                                        <th className="px-3 py-2">Formato</th>
                                                                        <th className="px-2 py-2 text-center">Qtd</th>
                                                                        <th className="px-2 py-2 text-right">Recebido</th>
                                                                        <th className="px-2 py-2 text-center">Taxa</th>
                                                                        <th className="px-3 py-2 text-right">Comissão</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y text-slate-750">
                                                                    {acertoRecebimentos.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={5} className="px-3 py-6 text-center text-slate-400 italic">
                                                                                Nenhum recebimento no período.
                                                                            </td>
                                                                        </tr>
                                                                    ) : (
                                                                        acertoRecebimentos.map((item) => (
                                                                            <tr key={item.metodo} className="hover:bg-slate-50/40">
                                                                                <td className="px-3 py-2 font-semibold text-slate-800">
                                                                                    {labelMetodos[item.metodo] || item.metodo.toUpperCase()}
                                                                                </td>
                                                                                <td className="px-2 py-2 text-center font-medium text-slate-600">
                                                                                    {item.quantidade}
                                                                                </td>
                                                                                <td className="px-2 py-2 text-right font-medium text-slate-900">
                                                                                    {formatCurrency(item.recebido_centavos)}
                                                                                </td>
                                                                                <td className="px-2 py-2 text-center">
                                                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50/50 rounded px-1.5 py-0.5">
                                                                                        {item.taxa_exibicao}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-bold text-emerald-600">
                                                                                    {formatCurrency(item.comissao_centavos)}
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div className="max-h-64 overflow-y-auto">
                                                                <table className="w-full text-left text-xs">
                                                                    <thead>
                                                                        <tr className="bg-slate-50 border-b text-[10px] text-slate-500 font-bold uppercase tracking-wider sticky top-0 z-10">
                                                                            <th className="px-3 py-2 bg-slate-50">Dia</th>
                                                                            <th className="px-2 py-2 text-center bg-slate-50">Qtd</th>
                                                                            <th className="px-2 py-2 text-right bg-slate-50">Recebido</th>
                                                                            <th className="px-3 py-2 text-right bg-slate-50">Comissão</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y text-slate-750">
                                                                        {acertoPorDia.length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">
                                                                                    Nenhum recebimento no período.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            acertoPorDia.map((item) => (
                                                                                <tr key={item.data} className="hover:bg-slate-50/40">
                                                                                    <td className="px-3 py-2 font-semibold text-slate-800">
                                                                                        {new Date(item.data + 'T12:00').toLocaleDateString('pt-BR')}
                                                                                    </td>
                                                                                    <td className="px-2 py-2 text-center font-medium text-slate-600">
                                                                                        {item.quantidade}
                                                                                    </td>
                                                                                    <td className="px-2 py-2 text-right font-medium text-slate-900">
                                                                                        {formatCurrency(item.recebido_centavos)}
                                                                                    </td>
                                                                                    <td className="px-3 py-2 text-right font-bold text-emerald-600">
                                                                                        {formatCurrency(item.comissao_centavos)}
                                                                                    </td>
                                                                                </tr>
                                                                            ))
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {/* Totais Gerais do Resumo */}
                                                        <div className="px-3 py-2 bg-blue-50/50 border-t flex flex-col gap-1">
                                                            <div className="flex justify-between text-[11px] text-slate-500">
                                                                <span>Total Lançamentos:</span>
                                                                <span className="font-semibold text-slate-750">{acertoQuantidadeTotal} item(ns)</span>
                                                            </div>
                                                            <div className="flex justify-between text-[11px] text-slate-500">
                                                                <span>Total Recebido:</span>
                                                                <span className="font-semibold text-slate-750">
                                                                    {formatCurrency(acertoRecebimentos.reduce((sum, i) => sum + i.recebido_centavos, 0))}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-xs font-bold text-blue-800 pt-1 border-t border-blue-100">
                                                                <span>Comissão Total:</span>
                                                                <span className="font-black text-blue-900">
                                                                    {formatCurrency(acertoRecebimentos.reduce((sum, i) => sum + i.comissao_centavos, 0))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-between gap-3 pt-4 border-t">
                                            <Button variant="outline" onClick={() => setAcertoStep(1)}>
                                                Voltar
                                            </Button>
                                            <Button
                                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                                onClick={() => setAcertoStep(3)}
                                                disabled={!acertoContaDestinoId || acertoTotalCentavos <= 0}
                                            >
                                                Avançar
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Step 3: Confirmação e Fechamento */}
                        {acertoStep === 3 && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                <div>
                                    <h4 className="font-extrabold text-slate-800 text-base">Revisar e Confirmar Acerto</h4>
                                    <p className="text-xs text-slate-400 mt-0.5">Certifique-se de que os dados e valores estão corretos antes de executar.</p>
                                </div>

                                <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 divide-y space-y-3">
                                    <div className="flex items-center justify-between text-sm pb-3">
                                        <span className="text-slate-500 font-medium">Cobrador:</span>
                                        <span className="font-bold text-slate-800">{cobradoresList.find(c => c.id === acertoCobrador)?.nome}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm py-3">
                                        <span className="text-slate-500 font-medium">Período:</span>
                                        <span className="font-bold text-slate-800">
                                            {new Date(acertoDataInicio + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(acertoDataFim + 'T12:00').toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm py-3">
                                        <span className="text-slate-500 font-medium">Transferir Para:</span>
                                        <span className="font-bold text-slate-800">
                                            {acertoContasDestino.find(c => c.id === acertoContaDestinoId)?.nome}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm py-3">
                                        <span className="text-slate-500 font-medium">Comissão Total Estimada:</span>
                                        <span className="font-extrabold text-blue-600">
                                            {formatCurrency(acertoRecebimentos.reduce((sum, item) => sum + item.comissao_centavos, 0))}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm pt-3">
                                        <span className="text-slate-700 font-extrabold text-base">Total do Acerto:</span>
                                        <span className="font-black text-emerald-600 text-lg">{formatCurrency(acertoTotalCentavos)}</span>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 font-semibold leading-relaxed">
                                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <strong>AVISO IMPORTANTE:</strong> Esta operação fará a sangria eletrônica do saldo arrecadado para a conta destino e realizará o **fechamento definitivo** dos caixas abertos deste cobrador. Verifique se o dinheiro físico foi efetivamente conferido e está em sua posse.
                                    </div>
                                </div>

                                <div className="flex justify-between gap-3 pt-4 border-t">
                                    <Button variant="outline" onClick={() => setAcertoStep(2)} disabled={loadingAcerto}>
                                        Voltar
                                    </Button>
                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                        onClick={executarAcerto}
                                        loading={loadingAcerto}
                                        disabled={loadingAcerto}
                                    >
                                        Confirmar e Fechar Caixas
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Conclusão */}
                        {acertoStep === 4 && acertoResultado && (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300 text-center py-4">
                                <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 ring-8 ring-emerald-50">
                                    <CheckCircle2 className="h-10 w-10 animate-bounce" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-black text-slate-850 text-xl tracking-tight">Acerto Concluído com Sucesso!</h4>
                                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                        As sangrias foram efetuadas e as sessões de caixa foram fechadas definitivamente no sistema.
                                    </p>
                                </div>

                                <div className="border border-slate-100 rounded-2xl p-4 max-w-sm mx-auto bg-slate-50/50 text-left space-y-2 text-xs">
                                    <div className="flex justify-between"><span className="text-slate-400">Cobrador:</span><span className="font-bold text-slate-700">{acertoResultado.cobrador_nome}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Valor Acertado:</span><span className="font-bold text-emerald-600">{formatCurrency(acertoResultado.total_centavos)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Comissão Devida:</span><span className="font-bold text-blue-600">{formatCurrency(acertoRecebimentos.reduce((sum, item) => sum + item.comissao_centavos, 0))}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Destino:</span><span className="font-bold text-slate-700">{acertoResultado.conta_destino_nome}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Caixas Fechados:</span><span className="font-bold text-slate-700">{acertoResultado.sessoes.length} caixa(s)</span></div>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4 border-t">
                                    <Button
                                        variant="outline"
                                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-xl"
                                        onClick={() => imprimirRelatorioAcerto(acertoResultado)}
                                    >
                                        <Printer className="h-4 w-4 mr-2" /> Imprimir Relatório
                                    </Button>
                                    <Button
                                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
                                        onClick={resetAcertoWizard}
                                    >
                                        Finalizar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {isManualAcertoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
                    <Card className="w-full max-w-4xl bg-white p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 rounded-3xl my-8">
                        <div className="flex items-center justify-between border-b pb-4">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Cobrança Manual de Cobrador</h3>
                            </div>
                            <button onClick={resetManualAcerto} className="text-slate-450 hover:text-slate-650 font-bold text-lg select-none cursor-pointer border-none bg-transparent">&times;</button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Lado Esquerdo: Parâmetros e Arrecadação */}
                            <div className="lg:col-span-7 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cobrador</label>
                                        <Select
                                            value={manualCobradorId}
                                            onChange={(e) => {
                                                setManualCobradorId(e.target.value);
                                                setManualComissaoAjustada('');
                                            }}
                                        >
                                            <option value="">Selecione o cobrador...</option>
                                            {cobradoresList.map((c) => (
                                                <option key={c.id} value={c.id}>{c.nome}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data do Acerto</label>
                                        <Input
                                            type="date"
                                            value={manualData}
                                            onChange={(e) => setManualData(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Período / Referência</label>
                                    <Input
                                        placeholder="Ex: Junho/2026, Semana 24, etc."
                                        value={manualPeriodoInfo}
                                        onChange={(e) => setManualPeriodoInfo(e.target.value)}
                                    />
                                </div>

                                <div className="border-t pt-4">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Valores Arrecadados por Meio</h4>
                                    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                        {(['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia'] as const).map((metodo) => {
                                            const label = labelMetodos[metodo] || metodo.toUpperCase();
                                            const taxa = obterTaxaMetodo(metodo);
                                            const tipo = obterTipoMetodo(metodo);
                                            const taxaTexto = tipo === 'fixo' ? `Taxa Fixa R$ ${taxa.toFixed(2)}` : `Comissão ${taxa}%`;

                                            return (
                                                <div key={metodo} className="grid grid-cols-12 gap-3 items-center">
                                                    <div className="col-span-5 text-xs font-semibold text-slate-700">
                                                        {label}
                                                    </div>
                                                    <div className="col-span-4 relative">
                                                        <span className="absolute left-3 top-2.5 text-xs text-slate-400">R$</span>
                                                        <Input
                                                            type="text"
                                                            placeholder="0,00"
                                                            className="pl-8 text-right font-medium text-xs h-9 bg-white"
                                                            value={manualValores[metodo]}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setManualValores(prev => ({
                                                                    ...prev,
                                                                    [metodo]: val
                                                                }));
                                                                setManualComissaoAjustada('');
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-3 text-[10px] text-slate-400 font-semibold italic text-right">
                                                        {taxaTexto}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Lado Direito: Resumo e Ajustes */}
                            <div className="lg:col-span-5 bg-blue-50/20 border border-blue-100/50 p-5 rounded-3xl space-y-4">
                                <h4 className="font-extrabold text-slate-800 text-sm border-b pb-2">Resumo Financeiro</h4>
                                
                                <div className="space-y-3 divide-y divide-slate-100 text-xs">
                                    <div className="flex justify-between pb-2">
                                        <span className="text-slate-500">Total Arrecadado:</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(manualTotalArrecadadoCentavos)}</span>
                                    </div>
                                    
                                    <div className="flex justify-between py-2">
                                        <span className="text-slate-500">Comissão Calculada:</span>
                                        <span className="font-bold text-blue-600">{formatCurrency(manualTotalComissaoCalculadaCentavos)}</span>
                                    </div>

                                    <div className="py-2 space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 font-semibold">Ajustar Comissão Paga:</span>
                                            <span className="text-[10px] text-slate-400">(opcional)</span>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-xs text-slate-400">R$</span>
                                            <Input
                                                type="text"
                                                placeholder={manualTotalComissaoCalculadaCentavos > 0 ? (manualTotalComissaoCalculadaCentavos / 100).toFixed(2) : "0,00"}
                                                className="pl-8 text-right font-bold text-xs h-9 bg-white"
                                                value={manualComissaoAjustada}
                                                onChange={(e) => setManualComissaoAjustada(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 py-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Bônus (+ R$)</label>
                                            <Input
                                                type="text"
                                                placeholder="0,00"
                                                className="text-right text-xs h-9 bg-white"
                                                value={manualBonus}
                                                onChange={(e) => setManualBonus(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Descontos (- R$)</label>
                                            <Input
                                                type="text"
                                                placeholder="0,00"
                                                className="text-right text-xs h-9 bg-white"
                                                value={manualDesconto}
                                                onChange={(e) => setManualDesconto(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-3 font-extrabold text-slate-800 text-sm">
                                        <span>Comissão Líquida:</span>
                                        <span className="text-base text-emerald-600 font-black">{formatCurrency(manualValorLiquidoCentavos)}</span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase">Observações do Acerto</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Digite aqui anotações ou justificativas..."
                                        className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                                        value={manualObservacoes}
                                        onChange={(e) => setManualObservacoes(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button variant="outline" onClick={resetManualAcerto}>
                                Cancelar
                            </Button>
                            <Button
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                onClick={() => void salvarAcertoManual()}
                                disabled={!manualCobradorId || manualTotalArrecadadoCentavos <= 0 || salvandoAcertoManual}
                            >
                                {salvandoAcertoManual ? 'Salvando...' : 'Concluir Acerto e Gerar Recibo'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
