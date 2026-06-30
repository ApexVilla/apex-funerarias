import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Edit,
  Filter,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import { Button, Card, Select } from '../ui/Components';
import { ContratoResumoHeader } from './ContratoResumoHeader';
import {
  GRUPO_PENDENCIA_LABEL,
  listarLinhasPendenciasCadastro,
  prepararLinhasPendenciasParaExibicao,
  rotuloPendenciasCadastro,
  type GrupoCampoCadastro,
  type ResumoCompletudeCadastro,
} from '../../lib/clienteCompletudeCadastro';

type Props = {
  cliente: ClienteSB;
  assinaturas: AssinaturaSB[];
  assinaturaId: string;
  onAssinaturaIdChange: (id: string) => void;
  resumo: ResumoCompletudeCadastro;
  onCompletarCadastro: () => void;
  onRevisarDependentes?: () => void;
  onVerContratos?: () => void;
};

const GRUPO_FILTRO_OPCOES: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todos os grupos' },
  ...Object.entries(GRUPO_PENDENCIA_LABEL).map(([value, label]) => ({ value, label })),
];

export const PendenciasCadastroContratoView: React.FC<Props> = ({
  cliente,
  assinaturas,
  assinaturaId,
  onAssinaturaIdChange,
  resumo,
  onCompletarCadastro,
  onRevisarDependentes,
  onVerContratos,
}) => {
  const [filtroGrupo, setFiltroGrupo] = useState<string>('todos');

  const assinatura =
    assinaturaId === 'todos'
      ? assinaturas.find((a) => (a.status || '').toLowerCase() === 'ativo') || assinaturas[0] || null
      : assinaturas.find((a) => a.id === assinaturaId) || null;

  const linhas = useMemo(
    () => listarLinhasPendenciasCadastro(resumo, cliente.nome),
    [resumo, cliente.nome],
  );

  const linhasFiltradas = useMemo(() => {
    if (filtroGrupo === 'todos') return linhas;
    return linhas.filter((l) => l.grupo === filtroGrupo);
  }, [linhas, filtroGrupo]);

  const linhasExibicao = useMemo(
    () => prepararLinhasPendenciasParaExibicao(linhasFiltradas),
    [linhasFiltradas],
  );

  const completo = resumo.pendentes === 0;

  return (
    <div className="space-y-4">
      {assinaturas.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">Contrato de referência</label>
          <Select
            value={assinaturaId}
            onChange={(e) => onAssinaturaIdChange(e.target.value)}
            className="h-9 w-full max-w-md text-xs font-semibold"
          >
            <option value="todos">Contrato ativo / principal</option>
            {assinaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo || a.id.slice(0, 8)} — {a.plano_nome || 'Plano'}
              </option>
            ))}
          </Select>
        </div>
      )}

      <ContratoResumoHeader cliente={cliente} assinatura={assinatura} />

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Dados pendentes</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Itens do cadastro que ainda precisam ser preenchidos ou corrigidos para finalizar o contrato.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`rounded-lg border px-4 py-2 text-center min-w-[120px] ${
              completo ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <p className="text-[10px] font-bold uppercase text-slate-500">Pendentes</p>
            <p
              className={`text-xl font-black tabular-nums ${
                completo ? 'text-emerald-800' : 'text-amber-900'
              }`}
            >
              {resumo.pendentes}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-center min-w-[120px]">
            <p className="text-[10px] font-bold uppercase text-slate-500">Completude</p>
            <p className="text-xl font-black text-slate-900 tabular-nums">{resumo.percentual}%</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-3">
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={onCompletarCadastro}>
          <Edit className="h-4 w-4 mr-1.5" />
          Completar cadastro
        </Button>
        {onRevisarDependentes && (
          <Button size="sm" variant="outline" onClick={onRevisarDependentes}>
            <Plus className="h-4 w-4 mr-1.5" />
            Revisar dependentes
          </Button>
        )}
        {onVerContratos && (
          <Button size="sm" variant="outline" onClick={onVerContratos}>
            <Shield className="h-4 w-4 mr-1.5" />
            Ver contratos
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo(e.target.value)}
            className="h-9 w-44 text-xs"
          >
            {GRUPO_FILTRO_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => setFiltroGrupo('todos')}
            title="Limpar filtros"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden border-slate-300 shadow-md">
        <div className="px-4 py-2 bg-slate-700 text-slate-300 text-[11px] italic border-b border-slate-600">
          {completo ? (
            <span className="flex items-center gap-2 not-italic font-semibold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {rotuloPendenciasCadastro(resumo)} — nenhum item em aberto
            </span>
          ) : (
            <>
              <ClipboardList className="h-3.5 w-3.5 inline mr-1.5 opacity-70" />
              {linhasExibicao.length} de {resumo.pendentes} pendência(s) exibida(s)
              {filtroGrupo !== 'todos'
                ? ` · filtro: ${GRUPO_PENDENCIA_LABEL[filtroGrupo as GrupoCampoCadastro] || filtroGrupo}`
                : ''}
            </>
          )}
        </div>

        <div className="overflow-x-auto max-h-[min(520px,60vh)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white uppercase text-[10px] font-black tracking-wider">
                <th className="px-3 py-2.5 text-left w-10">#</th>
                <th className="px-3 py-2.5 text-left">Grupo</th>
                <th className="px-3 py-2.5 text-left">Campo pendente</th>
                <th className="px-3 py-2.5 text-left">Titular / dependente</th>
                <th className="px-3 py-2.5 text-left">Situação</th>
                <th className="px-3 py-2.5 text-right w-28">Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhasExibicao.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 bg-slate-50">
                    {completo
                      ? 'Cadastro completo para os campos rastreados.'
                      : 'Nenhum item neste filtro.'}
                  </td>
                </tr>
              ) : (
                linhasExibicao.map((linha, i) => (
                  <tr
                    key={linha.id}
                    className={`border-b border-slate-200 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    } hover:bg-amber-50/50`}
                  >
                    <td className="px-3 py-2.5 font-mono text-slate-500">{linha.numero}</td>
                    {linha.rowspanGrupo > 0 ? (
                      <td
                        rowSpan={linha.rowspanGrupo}
                        className="px-3 py-2.5 font-semibold text-slate-800 align-top border-r border-slate-100"
                      >
                        {linha.grupoLabel}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-slate-900">{linha.campo}</td>
                    {linha.rowspanPessoa > 0 ? (
                      <td
                        rowSpan={linha.rowspanPessoa}
                        className="px-3 py-2.5 text-slate-700 font-medium align-top border-r border-slate-100"
                      >
                        {linha.pessoa}
                        {linha.rowspanPessoa > 1 && (
                          <span className="block text-[10px] font-normal text-slate-500 mt-1">
                            {linha.rowspanPessoa} campos pendentes
                          </span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-bold uppercase">
                        <AlertCircle className="h-3 w-3" />
                        Pendente
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={onCompletarCadastro}
                        className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[10px]"
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 text-[10px] text-slate-600 flex justify-between">
          <span>
            {resumo.preenchidos} de {resumo.totalRastreados} campos conferidos
          </span>
          <span className="font-semibold">{rotuloPendenciasCadastro(resumo)}</span>
        </div>
      </Card>
    </div>
  );
};
