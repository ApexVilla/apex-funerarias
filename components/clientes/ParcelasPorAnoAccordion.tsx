import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Components';
import { StatusBadge } from '../common/StatusBadge';
import { parcelaEstaVencida } from '../../lib/contratoDatas';

export interface ParcelaAccordionItem {
    id: string;
    data_vencimento: string;
    data_competencia?: string | null;
    valor_original_centavos?: number;
    valor_total_centavos?: number;
    valor_pago_centavos?: number;
    data_pagamento?: string | null;
    metodo_pagamento?: string | null;
    status?: string | null;
    plano_nome?: string | null;
    codigo?: string | null;
    estorno_em?: string | null;
    estorno_por?: string | null;
    estorno_motivo?: string | null;
}

interface ParcelasPorAnoAccordionProps {
    parcelas: ParcelaAccordionItem[];
    planoFallback?: string;
    selectedId?: string | null;
    onRowClick?: (parcela: ParcelaAccordionItem, event: React.MouseEvent) => void;
    onRowContextMenu?: (parcela: ParcelaAccordionItem, event: React.MouseEvent) => void;
    showPlano?: boolean;
    showPagamento?: boolean;
    compact?: boolean;
}

function anoDaParcela(p: ParcelaAccordionItem): number {
    const iso = (p.data_vencimento || p.data_competencia || '').slice(0, 10);
    const y = parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
}

export const ParcelasPorAnoAccordion: React.FC<ParcelasPorAnoAccordionProps> = ({
    parcelas,
    planoFallback,
    selectedId,
    onRowClick,
    onRowContextMenu,
    showPlano = true,
    showPagamento = true,
    compact = false,
}) => {
    const anoAtual = new Date().getFullYear();

    const porAno = useMemo(() => {
        const map = new Map<number, ParcelaAccordionItem[]>();
        for (const p of parcelas) {
            const y = anoDaParcela(p);
            const arr = map.get(y) || [];
            arr.push(p);
            map.set(y, arr);
        }
        return [...map.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([ano, itens]) => ({
                ano,
                itens: [...itens].sort(
                    (a, b) =>
                        new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime(),
                ),
            }));
    }, [parcelas]);

    const [anosAbertos, setAnosAbertos] = useState<Set<number>>(() => new Set([anoAtual]));

    const toggleAno = (ano: number) => {
        setAnosAbertos((prev) => {
            const next = new Set(prev);
            if (next.has(ano)) next.delete(ano);
            else next.add(ano);
            return next;
        });
    };

    if (parcelas.length === 0) {
        return <p className="text-sm text-gray-500 italic py-4">Nenhuma parcela neste filtro.</p>;
    }

    const py = compact ? 'py-2' : 'py-4';
    const px = compact ? 'px-4' : 'px-6';

    return (
        <div className="divide-y border rounded-lg bg-white overflow-hidden">
            {porAno.map(({ ano, itens }) => {
                const aberto = anosAbertos.has(ano);
                const estornadas = itens.filter((p) => !!p.estorno_em).length;
                const pagas = itens.filter(
                    (p) => (p.status || '').toLowerCase() === 'pago' && !p.estorno_em,
                ).length;
                const vencidas = itens.filter(
                    (p) => !p.estorno_em && parcelaEstaVencida(p.data_vencimento, p.status),
                ).length;
                const pendentes = itens.length - pagas - vencidas - estornadas;

                return (
                    <div key={ano}>
                        <button
                            type="button"
                            onClick={() => toggleAno(ano)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                            <span className="flex items-center gap-2 font-black text-gray-800">
                                {aberto ? (
                                    <ChevronDown className="h-4 w-4 text-indigo-600" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                                {ano}
                                <span className="text-xs font-bold text-gray-500 normal-case">
                                    ({itens.length} parcela{itens.length !== 1 ? 's' : ''})
                                </span>
                            </span>
                            <span className="flex flex-wrap gap-1.5 justify-end">
                                {pagas > 0 && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                        {pagas} pagas
                                    </span>
                                )}
                                {pendentes > 0 && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                        {pendentes} pend.
                                    </span>
                                )}
                                {vencidas > 0 && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                                        {vencidas} venc.
                                    </span>
                                )}
                                {estornadas > 0 && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                        {estornadas} estorn.
                                    </span>
                                )}
                            </span>
                        </button>
                        {aberto && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-white text-gray-500 border-b uppercase text-[10px] font-black tracking-widest">
                                            <th className={`${px} ${py} text-left`}>Mês</th>
                                            <th className={`${px} ${py} text-left`}>Vencimento</th>
                                            {showPlano && (
                                                <th className={`${px} ${py} text-left`}>Plano</th>
                                            )}
                                            <th className={`${px} ${py} text-left`}>Valor</th>
                                            {showPagamento && (
                                                <th className={`${px} ${py} text-left`}>Pagamento</th>
                                            )}
                                            <th className={`${px} ${py} text-left`}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {itens.map((m) => {
                                            const temEstorno = !!m.estorno_em;
                                            const isOverdue =
                                                !temEstorno &&
                                                parcelaEstaVencida(m.data_vencimento, m.status);
                                            const mesRef = m.data_competencia
                                                ? new Date(`${m.data_competencia.slice(0, 10)}T12:00:00`).toLocaleString(
                                                      'pt-BR',
                                                      { month: 'short' },
                                                  )
                                                : new Date(`${m.data_vencimento.slice(0, 10)}T12:00:00`).toLocaleString(
                                                      'pt-BR',
                                                      { month: 'short' },
                                                  );
                                            const isSelected = selectedId === m.id;
                                            const valor =
                                                (m.valor_original_centavos || m.valor_total_centavos || 0) / 100;

                                            return (
                                                <tr
                                                    key={m.id}
                                                    className={`transition-all ${
                                                        onRowClick ? 'cursor-pointer' : ''
                                                    } ${
                                                        isSelected
                                                            ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                                            : 'hover:bg-gray-50'
                                                    }`}
                                                    onClick={
                                                        onRowClick
                                                            ? (e) => onRowClick(m, e)
                                                            : undefined
                                                    }
                                                    onContextMenu={
                                                        onRowContextMenu
                                                            ? (e) => onRowContextMenu(m, e)
                                                            : undefined
                                                    }
                                                >
                                                    <td
                                                        className={`${px} ${py} font-medium text-gray-500 uppercase text-xs`}
                                                    >
                                                        {mesRef}
                                                    </td>
                                                    <td className={`${px} ${py} font-bold text-gray-900`}>
                                                        {new Date(
                                                            `${m.data_vencimento.slice(0, 10)}T12:00:00`,
                                                        ).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    {showPlano && (
                                                        <td className={`${px} ${py} text-gray-600`}>
                                                            {m.plano_nome || planoFallback || '—'}
                                                        </td>
                                                    )}
                                                    <td className={`${px} ${py} font-black text-gray-900`}>
                                                        R$ {valor.toFixed(2)}
                                                    </td>
                                                    {showPagamento && (
                                                        <td className={`${px} ${py}`}>
                                                            {temEstorno ? (
                                                                <div className="flex flex-col">
                                                                    <span className="text-gray-900 font-medium">
                                                                        {new Date(m.estorno_em!).toLocaleString('pt-BR')}
                                                                    </span>
                                                                    <span className="text-[10px] text-amber-700 font-bold uppercase">
                                                                        Estornado por {m.estorno_por || '—'}
                                                                    </span>
                                                                    {m.estorno_motivo ? (
                                                                        <span
                                                                            className="text-[10px] text-amber-600/90 mt-0.5 line-clamp-2"
                                                                            title={m.estorno_motivo}
                                                                        >
                                                                            {m.estorno_motivo}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : m.data_pagamento ? (
                                                                <div className="flex flex-col">
                                                                    <span className="text-gray-900 font-medium">
                                                                        {new Date(
                                                                            `${String(m.data_pagamento).slice(0, 10)}T12:00:00`,
                                                                        ).toLocaleDateString('pt-BR')}
                                                                    </span>
                                                                    <span className="text-[10px] text-emerald-600 font-bold uppercase">
                                                                        {m.metodo_pagamento || '—'}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                '—'
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className={`${px} ${py}`}>
                                                        {temEstorno ? (
                                                            <Badge variant="warning">Estornada</Badge>
                                                        ) : isOverdue ? (
                                                            <Badge variant="danger">Vencida</Badge>
                                                        ) : (
                                                            <StatusBadge status={m.status} />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
