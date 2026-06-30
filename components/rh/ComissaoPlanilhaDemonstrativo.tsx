import React, { useMemo } from 'react';
import type { AtendimentoComissaoDto } from '../../lib/comissaoAtendenteService';
import type { ComissaoOperacionalServicoDto } from '../../lib/comissaoOperacionalServico';
import type { DetalheComissaoServico } from '../../lib/comissaoOperacionalServicoCalculo';

const fmt = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const fmtData = (iso: string) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

interface LinhaPlanilha {
  atd: AtendimentoComissaoDto;
  total: number;
  porCodigo: Record<string, number>;
}

interface Props {
  atendimentos: AtendimentoComissaoDto[];
  servicos: ComissaoOperacionalServicoDto[];
  calcularDetalhes: (atd: AtendimentoComissaoDto) => DetalheComissaoServico[];
  tituloColaborador: string;
}

export const ComissaoPlanilhaDemonstrativo: React.FC<Props> = ({
  atendimentos,
  servicos,
  calcularDetalhes,
  tituloColaborador,
}) => {
  const colunas = useMemo(
    () => [...servicos].sort((a, b) => a.ordem - b.ordem),
    [servicos],
  );

  const linhas: LinhaPlanilha[] = useMemo(
    () =>
      atendimentos.map((atd) => {
        const detalhes = calcularDetalhes(atd);
        const porCodigo: Record<string, number> = {};
        let total = 0;
        detalhes.forEach((d) => {
          if (d.detectado && d.valor_centavos > 0) {
            porCodigo[d.codigo] = d.valor_centavos;
            total += d.valor_centavos;
          }
        });
        return { atd, total, porCodigo };
      }),
    [atendimentos, calcularDetalhes],
  );

  const totaisColuna = useMemo(() => {
    const acc: Record<string, number> = {};
    linhas.forEach((l) => {
      Object.entries(l.porCodigo).forEach(([cod, val]) => {
        acc[cod] = (acc[cod] || 0) + val;
      });
    });
    return acc;
  }, [linhas]);

  const totalGeral = linhas.reduce((s, l) => s + l.total, 0);
  const totalParticularBase = linhas
    .filter((l) => l.atd.tipo_atendimento === 'particular')
    .reduce((s, l) => s + l.atd.valor_total_centavos, 0);

  if (colunas.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-gray-900 text-sm">
          Controle de Comissão — {tituloColaborador}
        </h4>
        <span className="text-xs text-gray-500">{linhas.length} OS no período</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-gray-800 z-10">Data</th>
              <th className="px-2 py-2 text-left font-semibold">O.S.</th>
              <th className="px-2 py-2 text-left font-semibold min-w-[120px]">Óbito</th>
              {colunas.map((c) => (
                <th key={c.codigo} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                  <div>{c.nome}</div>
                  <div className="text-[10px] font-normal opacity-80 mt-0.5">
                    {c.tipo_calculo === 'percentual'
                      ? `${c.percentual.toFixed(2).replace('.', ',')}%`
                      : fmt(c.valor_fixo_centavos)}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold bg-amber-500 text-amber-950">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={colunas.length + 4} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma OS no período.
                </td>
              </tr>
            ) : (
              linhas.map(({ atd, total, porCodigo }) => (
                <tr key={atd.id} className="hover:bg-teal-50/30">
                  <td className="px-2 py-2 whitespace-nowrap sticky left-0 bg-white z-[1]">{fmtData(atd.data_servico)}</td>
                  <td className="px-2 py-2 font-mono">{atd.codigo}</td>
                  <td className="px-2 py-2">{atd.falecido_nome}</td>
                  {colunas.map((c) => {
                    const val = porCodigo[c.codigo];
                    const isPct = c.codigo === 'particular' && c.tipo_calculo === 'percentual';
                    return (
                      <td key={c.codigo} className="px-2 py-2 text-center tabular-nums">
                        {val ? (
                          isPct ? (
                            <span title={`Base: ${fmt(atd.valor_total_centavos)}`}>{fmt(val)}</span>
                          ) : (
                            fmt(val)
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right font-bold text-teal-800 bg-amber-50 tabular-nums">
                    {total > 0 ? fmt(total) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-semibold">
                <td colSpan={3} className="px-2 py-2 text-right text-gray-700">
                  Subtotais
                </td>
                {colunas.map((c) => (
                  <td key={c.codigo} className="px-2 py-2 text-center tabular-nums text-gray-800">
                    {totaisColuna[c.codigo] ? fmt(totaisColuna[c.codigo]) : '—'}
                  </td>
                ))}
                <td className="px-2 py-2 text-right bg-amber-200 text-amber-950 tabular-nums">{fmt(totalGeral)}</td>
              </tr>
              {totaisColuna.particular != null && totalParticularBase > 0 && (
                <tr className="bg-amber-50">
                  <td colSpan={colunas.length + 3} className="px-2 py-1.5 text-right text-[10px] text-amber-800">
                    Base particular: {fmt(totalParticularBase)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-amber-900 bg-amber-100">
                    {fmt(totaisColuna.particular || 0)}
                  </td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
