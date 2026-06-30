import React, { useMemo, useState } from 'react';
import { Save, Info } from 'lucide-react';
import { Button, Card, Input } from '../ui/Components';
import type { CargoComissaoOperacional } from '../../lib/comissaoCalculo';
import type { ModoCalculoComissao } from '../../lib/comissaoAtendenteService';
import {
  formatarValorServicoComissao,
  labelModoCalculo,
  salvarComissaoOperacionalServico,
  type ComissaoOperacionalServicoDto,
} from '../../lib/comissaoOperacionalServico';

const fmt = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

interface Props {
  empresaId: string;
  cargo: CargoComissaoOperacional;
  titulo: string;
  descricao: string;
  corAccent: string;
  servicos: ComissaoOperacionalServicoDto[];
  modoCalculo: ModoCalculoComissao;
  onModoChange: (modo: ModoCalculoComissao) => void;
  onSaved: () => void;
  showToast: (msg: string, tipo: 'success' | 'error') => void;
}

export const ComissaoServicosCargoPanel: React.FC<Props> = ({
  empresaId,
  cargo,
  titulo,
  descricao,
  corAccent,
  servicos,
  modoCalculo,
  onModoChange,
  onSaved,
  showToast,
}) => {
  const lista = useMemo(
    () => servicos.filter((s) => s.cargo === cargo).sort((a, b) => a.ordem - b.ordem),
    [servicos, cargo],
  );

  const [editando, setEditando] = useState<Record<string, { valor: string; percentual: string }>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const valorEdit = (s: ComissaoOperacionalServicoDto) => {
    if (editando[s.id]) return editando[s.id].valor;
    return s.tipo_calculo === 'fixo' ? (s.valor_fixo_centavos / 100).toFixed(2) : '';
  };

  const pctEdit = (s: ComissaoOperacionalServicoDto) => {
    if (editando[s.id]) return editando[s.id].percentual;
    return s.tipo_calculo === 'percentual' ? s.percentual.toFixed(2) : '';
  };

  const salvarItem = async (s: ComissaoOperacionalServicoDto) => {
    const ed = editando[s.id];
    const valorReais = ed ? Number(ed.valor.replace(',', '.')) : s.valor_fixo_centavos / 100;
    const pct = ed ? Number(ed.percentual.replace(',', '.')) : s.percentual;

    if (s.tipo_calculo === 'fixo' && (Number.isNaN(valorReais) || valorReais < 0)) {
      showToast(`Valor inválido para ${s.nome}.`, 'error');
      return;
    }
    if (s.tipo_calculo === 'percentual' && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
      showToast(`Percentual inválido para ${s.nome}.`, 'error');
      return;
    }

    setSalvando(s.id);
    const ok = await salvarComissaoOperacionalServico(empresaId, cargo, {
      codigo: s.codigo,
      nome: s.nome,
      descricao: s.descricao,
      tipo_calculo: s.tipo_calculo,
      valor_fixo_centavos: s.tipo_calculo === 'fixo' ? Math.round(valorReais * 100) : 0,
      percentual: s.tipo_calculo === 'percentual' ? pct : 0,
      palavras_chave: s.palavras_chave,
      ordem: s.ordem,
      ativo: s.ativo,
    });
    setSalvando(null);

    if (ok) {
      showToast(`${s.nome} atualizado.`, 'success');
      setEditando((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
      onSaved();
    } else {
      showToast(`Erro ao salvar ${s.nome}.`, 'error');
    }
  };

  return (
    <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
            <span className={`h-4 w-1 ${corAccent} rounded-full inline-block`} />
            {titulo}
          </h4>
          <p className="text-xs text-gray-500 mt-1">{descricao}</p>
        </div>
        <select
          value={modoCalculo}
          onChange={(e) => onModoChange(e.target.value as ModoCalculoComissao)}
          className="border rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shrink-0"
        >
          <option value="por_servico">{labelModoCalculo('por_servico')}</option>
          <option value="percentual_os">{labelModoCalculo('percentual_os')}</option>
        </select>
      </div>

      {modoCalculo === 'por_servico' ? (
        <>
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              O sistema identifica automaticamente cada serviço na OS (itens, plano, preparação Fênix/Ônix,
              formulário técnico) e soma a comissão fixa ou percentual de cada coluna — igual à planilha de controle.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Serviço</th>
                  <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Como detecta</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Comissão</th>
                  <th className="px-4 py-2.5 text-right font-semibold w-24">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Nenhum serviço configurado. Execute a migration ou recarregue a página.
                    </td>
                  </tr>
                ) : (
                  lista.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{s.nome}</p>
                        {s.codigo === 'fenix' && (
                          <p className="text-[10px] text-amber-700 mt-0.5">Preparação completa Plano Fênix</p>
                        )}
                        {s.codigo === 'onix' && (
                          <p className="text-[10px] text-slate-600 mt-0.5">Preparação completa Plano Ônix</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {s.codigo === 'particular'
                            ? 'OS marcada como particular (sem plano)'
                            : s.descricao || s.palavras_chave.slice(0, 4).join(', ')}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.tipo_calculo === 'percentual' ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              className="w-20 text-right !py-1 !text-sm"
                              value={pctEdit(s)}
                              onChange={(e) =>
                                setEditando((p) => ({
                                  ...p,
                                  [s.id]: { valor: '', percentual: e.target.value },
                                }))
                              }
                            />
                            <span className="text-gray-500 text-xs">%</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-gray-400 text-xs">R$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 text-right !py-1 !text-sm"
                              value={valorEdit(s)}
                              onChange={(e) =>
                                setEditando((p) => ({
                                  ...p,
                                  [s.id]: { valor: e.target.value, percentual: '' },
                                }))
                              }
                            />
                          </div>
                        )}
                        {!editando[s.id] && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatarValorServicoComissao(s)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          loading={salvando === s.id}
                          disabled={!editando[s.id]}
                          onClick={() => salvarItem(s)}
                          className="!px-2"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {lista.length > 0 && (
                <tfoot className="bg-amber-50 border-t border-amber-100">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-amber-900">
                      Total por OS = soma das colunas detectadas
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right text-xs text-amber-800">
                      Ex.: {lista.filter((s) => s.tipo_calculo === 'fixo').slice(0, 2).map((s) => `${s.nome} ${fmt(s.valor_fixo_centavos)}`).join(' + ')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 bg-white border rounded-lg p-3">
          Modo legado: usa percentual + valor fixo sobre o faturamento total da OS (campos abaixo).
        </p>
      )}
    </div>
  );
};
