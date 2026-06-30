import React, { useMemo } from 'react';
import { ListTree } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Components';
import { formatCentavos } from '../../lib/FinanceiroStore';
import {
    filtrarLinhasDREDrilldown,
    type DREDrilldownContext,
    type DREDrilldownLinha,
    type DREDrilldownMovimentacao,
    type DREDrilldownPagavel,
    type DREDrilldownRecebivel,
} from '../../lib/dreDrilldown';

interface DREDrilldownModalProps {
    titulo: string;
    periodoLabel: string;
    unidadeLabel: string;
    context: DREDrilldownContext;
    recebiveis: DREDrilldownRecebivel[];
    pagaveis: DREDrilldownPagavel[];
    movimentacoes: DREDrilldownMovimentacao[];
    periodo: { inicio: string; fim: string };
    empresaIds: string[];
    onClose: () => void;
}

const fmtData = (iso?: string | null) => {
    if (!iso) return '—';
    const d = iso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
};

const origemLabel: Record<DREDrilldownLinha['origem'], string> = {
    conta_receber: 'Conta a receber',
    conta_pagar_baixa: 'Pagamento (CP)',
    movimentacao: 'Movimentação',
};

export const DREDrilldownModal: React.FC<DREDrilldownModalProps> = ({
    titulo,
    periodoLabel,
    unidadeLabel,
    context,
    recebiveis,
    pagaveis,
    movimentacoes,
    periodo,
    empresaIds,
    onClose,
}) => {
    const linhas = useMemo(
        () => filtrarLinhasDREDrilldown(context, recebiveis, pagaveis, movimentacoes, periodo, empresaIds),
        [context, recebiveis, pagaveis, movimentacoes, periodo, empresaIds],
    );

    const total = linhas.reduce((s, l) => s + l.valor_centavos, 0);

    return (
        <Modal isOpen title={titulo} onClose={onClose} size="xl">
            <div className="space-y-4 -mt-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{periodoLabel}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{unidadeLabel}</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                        {linhas.length} {linhas.length === 1 ? 'lançamento' : 'lançamentos'}
                    </span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                    Lançamentos que compõem esta linha do DRE no período selecionado.
                    {context.kind === 'receita' && (
                        <> Receitas classificadas pela natureza do título (<strong>tipo de documento</strong> ou <strong>descrição</strong>).</>
                    )}
                    {context.kind === 'despesa' && (
                        <> Pagamentos classificados pelo <strong>plano de contas</strong> do título a pagar.</>
                    )}
                </p>

                {linhas.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                        Nenhum lançamento encontrado para este filtro no período.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-800 text-white text-left">
                                    <th className="py-2.5 px-3 font-semibold">Data</th>
                                    <th className="py-2.5 px-3 font-semibold">Código</th>
                                    <th className="py-2.5 px-3 font-semibold">Referência</th>
                                    <th className="py-2.5 px-3 font-semibold">Natureza</th>
                                    <th className="py-2.5 px-3 font-semibold">Origem</th>
                                    <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {linhas.map((l) => (
                                    <tr key={`${l.origem}-${l.id}`} className="hover:bg-slate-50/80">
                                        <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">{fmtData(l.data)}</td>
                                        <td className="py-2.5 px-3 font-mono text-xs">{l.codigo}</td>
                                        <td className="py-2.5 px-3 max-w-[200px] truncate" title={l.referencia}>{l.referencia}</td>
                                        <td className="py-2.5 px-3 max-w-[180px] truncate text-slate-600" title={l.natureza}>{l.natureza}</td>
                                        <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">{origemLabel[l.origem]}</td>
                                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{formatCentavos(l.valor_centavos)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                    <td colSpan={5} className="py-3 px-3 text-right text-slate-700">Total</td>
                                    <td className="py-3 px-3 text-right tabular-nums">{formatCentavos(total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <ListTree className="h-3.5 w-3.5" aria-hidden />
                        Recebimentos de atendimento direto no caixa não entram nesta lista — apenas títulos em contas a receber.
                    </p>
                    <Button variant="outline" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
