import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, ArrowUpCircle, ArrowDownCircle, Coins, ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import {
    useFinanceiro,
    formatCentavos,
    signedMovimentoCentavos,
    isMovimentoEntrada,
    isMovimentoSaida,
} from '../../lib/FinanceiroStore';
import { EmptyFinanceiro, FinanceiroLoading, MoneyDisplay } from '../../components/financeiro/FinanceiroComponents';
import { useFilial } from '../../lib/FilialContext';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { supabase } from '../../lib/supabase';

const tipoIcons: Record<string, React.ReactNode> = {
    receita: <ArrowDownCircle className="h-4 w-4 text-green-500" />,
    despesa: <ArrowUpCircle className="h-4 w-4 text-red-500" />,
    transferencia_entrada: <ArrowRightLeft className="h-4 w-4 text-blue-500" />,
    transferencia_saida: <ArrowRightLeft className="h-4 w-4 text-purple-500" />,
    ajuste_credito: <ArrowDownCircle className="h-4 w-4 text-sky-500" />,
    ajuste_debito: <ArrowUpCircle className="h-4 w-4 text-amber-500" />,
    estorno: <ArrowRightLeft className="h-4 w-4 text-gray-500" />,
};

const tipoLabels: Record<string, string> = {
    receita: 'Receita',
    despesa: 'Despesa',
    transferencia_entrada: 'Transf. Entrada',
    transferencia_saida: 'Transf. Saída',
    ajuste_credito: 'Ajuste Crédito',
    ajuste_debito: 'Ajuste Débito',
    estorno: 'Estorno',
    aplicacao: 'Aplicação',
    resgate: 'Resgate',
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

const PAGE_SIZE_OPTIONS = [20, 50, 100, 1000, 5000] as const;

export const FluxoCaixa: React.FC = () => {
    const { movimentacoes, loadMovimentacoes, contasBancarias, loadContasBancarias, loading } = useFinanceiro();
    const { empresaIdEfetivo } = useEmpresaContextoAtivo();
    const { filialId, filialNome, isTodasFiliais, dataRevision } = useFilial();
    const filialAtiva = Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais);

    const [saldosPeriodo, setSaldosPeriodo] = useState<{ saldoInicio: number; saldoFim: number } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [contaFilter, setContaFilter] = useState('');
    const [dataInicio, setDataInicio] = useState(primeiroDiaMes());
    const [dataFim, setDataFim] = useState(ultimoDiaMes());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const recarregar = useCallback(() => {
        const filters: Record<string, string> = {};
        if (tipoFilter) filters.tipo = tipoFilter;
        if (contaFilter) filters.conta_bancaria_id = contaFilter;
        if (dataInicio) filters.data_inicio = dataInicio;
        if (dataFim) filters.data_fim = dataFim;
        loadMovimentacoes(filters);
        loadContasBancarias();
    }, [loadMovimentacoes, loadContasBancarias, tipoFilter, contaFilter, dataInicio, dataFim, dataRevision]);

    useEffect(() => {
        recarregar();
    }, [recarregar]);

    useEffect(() => {
        const empresaId = (empresaIdEfetivo || '').trim();
        if (!empresaId || !dataInicio || !dataFim) {
            setSaldosPeriodo(null);
            return;
        }

        let cancelled = false;
        (async () => {
            const { data, error } = await supabase.rpc('fin_resumo_saldo_periodo', {
                p_empresa_id: empresaId,
                p_data_inicio: dataInicio,
                p_data_fim: dataFim,
                p_conta_bancaria_id: contaFilter || null,
                p_filial_id: filialAtiva ? filialId : null,
            });
            if (cancelled) return;
            if (error) {
                console.error('[FluxoCaixa] fin_resumo_saldo_periodo', error.message);
                setSaldosPeriodo(null);
                return;
            }
            const row = data as { saldo_inicial_centavos?: number; saldo_final_centavos?: number } | null;
            setSaldosPeriodo({
                saldoInicio: Number(row?.saldo_inicial_centavos ?? 0),
                saldoFim: Number(row?.saldo_final_centavos ?? 0),
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [empresaIdEfetivo, dataInicio, dataFim, contaFilter, filialAtiva, filialId, dataRevision]);

    const filtered = useMemo(() => movimentacoes.filter((m) => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
            m.descricao?.toLowerCase().includes(t) ||
            m.codigo?.toLowerCase().includes(t)
        );
    }), [movimentacoes, searchTerm]);

    const totais = useMemo(() => {
        let entradas = 0;
        let saidas = 0;
        let variacao = 0;
        for (const m of filtered) {
            const delta = signedMovimentoCentavos(m.tipo, m.valor_centavos);
            variacao += delta;
            if (delta > 0) entradas += delta;
            else if (delta < 0) saidas += Math.abs(delta);
        }

        const contasNoFiltro = contaFilter
            ? contasBancarias.filter((c) => c.id === contaFilter)
            : contasBancarias;
        const saldoAtualContas = contasNoFiltro.reduce((s, c) => s + (c.saldo_atual_centavos || 0), 0);

        // Período passado: saldo via RPC (todas as mov. desde o início do período).
        // Fallback local só enquanto o RPC não respondeu (ex.: migração pendente).
        const saldoInicio = saldosPeriodo != null
            ? saldosPeriodo.saldoInicio
            : saldoAtualContas - variacao;
        const saldoFim = saldosPeriodo != null
            ? saldosPeriodo.saldoFim
            : saldoInicio + variacao;

        return { entradas, saidas, variacao, saldoInicio, saldoFim, saldoAtualContas };
    }, [filtered, contasBancarias, contaFilter, saldosPeriodo]);

    const linhasComSaldo = useMemo(() => {
        let acumulado = totais.saldoInicio;
        return filtered.map((m) => {
            const delta = signedMovimentoCentavos(m.tipo, m.valor_centavos);
            acumulado += delta;
            return { mov: m, delta, saldoApos: acumulado };
        });
    }, [filtered, totais.saldoInicio]);

    const visibleCount = linhasComSaldo.length;
    const totalPages = Math.max(1, Math.ceil(visibleCount / pageSize));

    const paginatedLinhas = useMemo(() => {
        const start = (page - 1) * pageSize;
        return linhasComSaldo.slice(start, start + pageSize);
    }, [linhasComSaldo, page, pageSize]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, tipoFilter, contaFilter, dataInicio, dataFim, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const limparFiltros = () => {
        setSearchTerm('');
        setTipoFilter('');
        setContaFilter('');
        setDataInicio(primeiroDiaMes());
        setDataFim(ultimoDiaMes());
    };

    if (loading && movimentacoes.length === 0) return <FinanceiroLoading />;

    const subtitle = filialAtiva
        ? `Movimentações da unidade ${filialNome} · período ${dataInicio} a ${dataFim}`
        : `Movimentações consolidadas · período ${dataInicio} a ${dataFim}`;

    return (
        <div className="space-y-6">
            <PageHeader title="Fluxo de Caixa" subtitle={subtitle} />

            {filialAtiva && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Saldo das contas bancárias reflete o caixa da empresa (todas as contas selecionadas).
                    As movimentações listadas estão restritas à filial <strong>{filialNome}</strong>.
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 border-l-4 border-l-slate-500">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo inicial (período)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{formatCentavos(totais.saldoInicio)}</p>
                    <p className="text-xs text-gray-400 mt-1">Antes de {dataInicio}</p>
                </Card>
                <Card className="p-4 border-l-4 border-l-green-500">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entradas no período</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{formatCentavos(totais.entradas)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                        {filtered.filter((m) => signedMovimentoCentavos(m.tipo, m.valor_centavos) > 0).length} lançamentos
                    </p>
                </Card>
                <Card className="p-4 border-l-4 border-l-red-500">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saídas no período</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{formatCentavos(totais.saidas)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                        {filtered.filter((m) => signedMovimentoCentavos(m.tipo, m.valor_centavos) < 0).length} lançamentos
                    </p>
                </Card>
                <Card className={`p-4 border-l-4 ${totais.saldoFim >= 0 ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo final (período)</p>
                    <p className={`text-2xl font-bold mt-1 ${totais.saldoFim >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {formatCentavos(totais.saldoFim)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Inicial + entradas − saídas = {formatCentavos(totais.saldoInicio + totais.entradas - totais.saidas)}
                    </p>
                </Card>
            </div>

            <div className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                        <CalendarDays className="h-4 w-4" />
                        Período
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <Input
                                label="De"
                                type="date"
                                pickerOnly
                                helperText=""
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                            />
                        </div>
                        <div>
                            <Input
                                label="Até"
                                type="date"
                                pickerOnly
                                helperText=""
                                value={dataFim}
                                onChange={(e) => setDataFim(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                            <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                                <option value="">Todos os tipos</option>
                                <option value="receita">Receita</option>
                                <option value="despesa">Despesa</option>
                                <option value="transferencia_entrada">Transf. Entrada</option>
                                <option value="transferencia_saida">Transf. Saída</option>
                                <option value="ajuste_credito">Ajuste Crédito</option>
                                <option value="ajuste_debito">Ajuste Débito</option>
                                <option value="estorno">Estorno</option>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Conta</label>
                            <Select value={contaFilter} onChange={(e) => setContaFilter(e.target.value)}>
                                <option value="">Todas as contas</option>
                                {contasBancarias.map((cb) => (
                                    <option key={cb.id} value={cb.id}>{cb.nome}</option>
                                ))}
                            </Select>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar descrição ou código..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-40">
                        <label className="text-xs text-gray-500 mb-1 block">Listagem</label>
                        <Select
                            value={String(pageSize)}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>
                                    {size.toLocaleString('pt-BR')} por página
                                </option>
                            ))}
                        </Select>
                    </div>
                    <Button variant="outline" onClick={limparFiltros}>
                        Limpar
                    </Button>
                </div>
            </div>

            {filtered.length > 0 ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Data</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Tipo</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Descrição</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Valor</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Saldo acum.</th>
                                    <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Conciliado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {paginatedLinhas.map(({ mov: m, delta, saldoApos }) => {
                                    const isDebit = isMovimentoSaida(m.tipo) || (m.tipo === 'estorno' && delta < 0);
                                    const isCred = isMovimentoEntrada(m.tipo) || (m.tipo === 'estorno' && delta > 0);
                                    return (
                                        <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors">
                                            <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                                                {new Date(m.data_movimentacao + 'T00:00').toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    {tipoIcons[m.tipo] || <Coins className="h-4 w-4 text-gray-400" />}
                                                    <span className="text-xs font-medium">{tipoLabels[m.tipo] || m.tipo}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-gray-900 dark:text-slate-100 max-w-[300px] truncate">{m.descricao}</td>
                                            <td className="py-3 px-4 text-right">
                                                <MoneyDisplay
                                                    centavos={isDebit && !isCred ? -Math.abs(m.valor_centavos) : Math.abs(m.valor_centavos)}
                                                    size="sm"
                                                    showSign
                                                />
                                            </td>
                                            <td className="py-3 px-4 text-right tabular-nums text-gray-700 font-medium">
                                                {formatCentavos(saldoApos)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {m.conciliada ? (
                                                    <span className="inline-flex h-5 w-5 rounded-full bg-green-100 items-center justify-center">
                                                        <span className="h-2 w-2 rounded-full bg-green-500" />
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex h-5 w-5 rounded-full bg-gray-100 items-center justify-center">
                                                        <span className="h-2 w-2 rounded-full bg-gray-300" />
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-800/30 px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-sm text-gray-500">
                            Mostrando{' '}
                            <span className="font-semibold text-gray-700">
                                {visibleCount === 0 ? 0 : (page - 1) * pageSize + 1}
                            </span>{' '}
                            a{' '}
                            <span className="font-semibold text-gray-700">
                                {Math.min(page * pageSize, visibleCount)}
                            </span>{' '}
                            de{' '}
                            <span className="font-semibold text-gray-700">{visibleCount}</span>{' '}
                            movimentação(ões) • Total no período:{' '}
                            <span className="font-semibold text-gray-700">{movimentacoes.length}</span>
                        </p>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Anterior
                                </Button>
                                <span className="text-xs font-medium text-gray-700 px-2">
                                    {page} / {totalPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page === totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                >
                                    Próximo
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>
            ) : (
                <EmptyFinanceiro
                    icon={<Coins className="h-8 w-8 text-gray-400" />}
                    title="Nenhuma movimentação"
                    description="Não há movimentações financeiras com os filtros selecionados."
                    action={<Button variant="outline" onClick={limparFiltros}>Limpar Filtros</Button>}
                />
            )}
        </div>
    );
};
