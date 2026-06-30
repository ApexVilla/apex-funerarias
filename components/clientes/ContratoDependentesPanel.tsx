import React, { useMemo } from 'react';
import { Users, Plus, UserPlus, ShieldAlert, ShieldCheck, Crown, Trash2, Cross } from 'lucide-react';
import { Button, Badge } from '../ui/Components';
import { beneficiarioEstaFalecido, labelFalecimentoBeneficiario, separarBeneficiariosAtivosEFalecidos } from '../../lib/beneficiarioFalecimento';
import type { AssinaturaSB, BeneficiarioSB } from '../../lib/ClienteStore';
import {
  CARENCIA_DEPENDENTE_PADRAO_DIAS,
  calcularStatusCarenciaContrato,
  calcularStatusCarenciaDependente,
  formatarResumoCarenciaContrato,
} from '../../lib/beneficiarioCarencia';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { labelParentescoDependente } from '../../lib/parentescoDependente';

export function filtrarBeneficiariosDoContrato(
  beneficiarios: BeneficiarioSB[],
  assinatura: AssinaturaSB,
  contratoAtivoId?: string | null,
): BeneficiarioSB[] {
  const vinculados = beneficiarios.filter((b) => b.assinatura_id === assinatura.id);
  if (vinculados.length > 0) return vinculados;
  if (assinatura.id === contratoAtivoId || assinatura.status === 'ativo') {
    return beneficiarios.filter((b) => !b.assinatura_id);
  }
  return [];
}

type Props = {
  assinatura: AssinaturaSB;
  beneficiarios: BeneficiarioSB[];
  contratoAtivoId?: string | null;
  /** resumo = só contagem e link (aba Contratos); completo = tabela e ações (aba Beneficiários). */
  variant?: 'resumo' | 'completo';
  onIrBeneficiarios?: () => void;
  onAdicionarDependente?: () => void;
  onEditarDependente?: (b: BeneficiarioSB) => void;
  onPromoverTitular?: (b: BeneficiarioSB) => void;
  onRemoverDependente?: (b: BeneficiarioSB) => void;
  onRegistrarObito?: (b: BeneficiarioSB) => void;
  dependentePodeVirarTitular?: (b: BeneficiarioSB) => boolean;
  somenteLeitura?: boolean;
};

export function ContratoDependentesPanel({
  assinatura,
  beneficiarios,
  contratoAtivoId,
  variant = 'completo',
  onIrBeneficiarios,
  onAdicionarDependente,
  onEditarDependente,
  onPromoverTitular,
  onRemoverDependente,
  onRegistrarObito,
  dependentePodeVirarTitular,
  somenteLeitura = false,
}: Props) {
  const diasCarenciaDep = assinatura.plano_carencia_dependente_dias ?? CARENCIA_DEPENDENTE_PADRAO_DIAS;
  const diasCarenciaCtr = assinatura.plano_carencia_dias ?? 0;
  const dataContrato = (assinatura.data_contratacao || assinatura.created_at || '').slice(0, 10);

  const statusContrato = useMemo(
    () => calcularStatusCarenciaContrato(dataContrato, diasCarenciaCtr),
    [dataContrato, diasCarenciaCtr],
  );

  const depsVinculados = useMemo(() => {
    const vinculados = beneficiarios.filter((b) => b.assinatura_id === assinatura.id);
    if (vinculados.length > 0) return vinculados;
    if (assinatura.id === contratoAtivoId || assinatura.status === 'ativo') {
      return beneficiarios.filter((b) => !b.assinatura_id);
    }
    return [];
  }, [beneficiarios, assinatura, contratoAtivoId]);

  const { ativos: deps, falecidos: depsFalecidos } = useMemo(
    () => separarBeneficiariosAtivosEFalecidos(depsVinculados),
    [depsVinculados],
  );

  const dataFiliacao = (b: BeneficiarioSB) =>
    (b.data_inclusao || b.created_at || '').slice(0, 10);

  const podeIncluir = assinatura.status === 'ativo' && !somenteLeitura;
  const emCarencia = deps.filter((b) => {
    const st = calcularStatusCarenciaDependente(dataFiliacao(b), diasCarenciaDep);
    return st?.emCarencia;
  }).length;

  const tabelaFalecidos =
    depsFalecidos.length > 0 ? (
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 overflow-hidden">
        <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 border-b border-gray-200">
          Falecidos / baixa no plano ({depsFalecidos.length})
        </p>
        <ul className="divide-y divide-gray-100">
          {depsFalecidos.map((b) => (
            <li key={b.id} className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-gray-700 line-through decoration-gray-400">{b.nome}</span>
                <span
                  className="block text-[10px] font-semibold text-gray-500"
                  title={labelParentescoDependente(b.parentesco, 'completo')}
                >
                  {labelParentescoDependente(b.parentesco, 'abrev') || 'Dep.'}
                </span>
              </div>
              <Badge variant="default" className="bg-gray-200 text-gray-800 border-gray-300 text-[10px]">
                <Cross className="h-3 w-3 mr-1 inline" />
                {labelFalecimentoBeneficiario(b) || 'Falecido'}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  if (variant === 'resumo') {
    return (
      <div className="px-6 py-3 border-b border-gray-100 bg-slate-50/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
            <Users className="h-4 w-4 text-indigo-600 shrink-0" />
            <span className="font-semibold text-gray-900">
              {deps.length} dependente{deps.length === 1 ? '' : 's'} neste contrato
            </span>
            {deps.length > 0 && emCarencia > 0 && (
              <span className="text-amber-700 font-medium">· {emCarencia} em carência</span>
            )}
          </div>
          {onIrBeneficiarios && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-indigo-700 hover:bg-indigo-50"
              onClick={onIrBeneficiarios}
            >
              Ver e gerenciar em Beneficiários
            </Button>
          )}
        </div>
        {deps.length > 0 && (
          <p className="mt-2 text-[11px] text-gray-500 line-clamp-2">
            {deps
              .slice(0, 8)
              .map((b) =>
                `${b.nome}${b.parentesco ? ` (${labelParentescoDependente(b.parentesco, 'abrev')})` : ''}`,
              )
              .join(' · ')}
            {deps.length > 8 ? ` · +${deps.length - 8}…` : ''}
          </p>
        )}
        {depsFalecidos.length > 0 && (
          <p className="mt-1 text-[11px] text-gray-500">
            {depsFalecidos.length} falecido(s) com baixa — veja em Beneficiários.
          </p>
        )}
        {deps.length === 0 && podeIncluir && onAdicionarDependente && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-8 border-indigo-200 text-indigo-700"
            onClick={onAdicionarDependente}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Incluir dependente
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-b from-slate-50/80 to-white">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h5 className="text-xs font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            Dependentes do contrato ({deps.length}{depsFalecidos.length > 0 ? ` · ${depsFalecidos.length} falecido(s)` : ''})
          </h5>
          <p className="text-[10px] text-gray-500 mt-1 max-w-xl">
            A <strong>data de filiação</strong> inicia a carência de <strong>{diasCarenciaDep} dias</strong> para cada
            dependente incluído depois do contrato.
          </p>
        </div>
        {podeIncluir && onAdicionarDependente && (
          <Button type="button" size="sm" variant="outline" className="h-8 border-indigo-200 text-indigo-700" onClick={onAdicionarDependente}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Incluir dependente
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-xs">
          <p className="font-black uppercase text-[10px] text-indigo-700 tracking-wider mb-1">Carência do contrato (plano)</p>
          <p className="text-gray-800">
            <strong>{diasCarenciaCtr} dias</strong> a partir da contratação ({formatarDataIsoPtBr(dataContrato)})
          </p>
          <p className="text-gray-600 mt-1">{formatarResumoCarenciaContrato(dataContrato, diasCarenciaCtr)}</p>
          {statusContrato && (
            <Badge
              variant="default"
              className={`mt-2 text-[10px] ${
                statusContrato.emCarencia
                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-200'
              }`}
            >
              {statusContrato.emCarencia ? 'Contrato em carência' : 'Contrato fora da carência'}
            </Badge>
          )}
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5 text-xs">
          <p className="font-black uppercase text-[10px] text-violet-700 tracking-wider mb-1">Carência de dependentes (plano)</p>
          <p className="text-gray-800">
            Cada novo dependente: <strong>{diasCarenciaDep} dias</strong> a partir da <strong>data de filiação</strong>.
          </p>
          <p className="text-gray-600 mt-1">
            Quem foi filiado recentemente permanece em carência até completar o prazo; depois a cobertura fica ativa.
          </p>
        </div>
      </div>

      {deps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
          <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          Nenhum dependente neste contrato.
          {podeIncluir && onAdicionarDependente && (
            <Button type="button" size="sm" className="mt-3 bg-indigo-600" onClick={onAdicionarDependente}>
              <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro dependente
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600 uppercase text-[10px] font-black tracking-wider">
                <th className="px-3 py-2.5 text-left">Dependente</th>
                <th className="px-3 py-2.5 text-left">Data filiação</th>
                <th className="px-3 py-2.5 text-left">Carência ({diasCarenciaDep}d)</th>
                <th className="px-3 py-2.5 text-left">Fim carência</th>
                <th className="px-3 py-2.5 text-left">Situação</th>
                {!somenteLeitura && (onEditarDependente || onPromoverTitular || onRemoverDependente || onRegistrarObito) && (
                  <th className="px-3 py-2.5 text-right">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deps.map((b) => {
                const df = dataFiliacao(b);
                const st = calcularStatusCarenciaDependente(df, diasCarenciaDep);
                const Icon = st?.emCarencia ? ShieldAlert : ShieldCheck;
                return (
                  <tr key={b.id} className="hover:bg-indigo-50/20">
                    <td className="px-3 py-2.5 font-semibold text-gray-900">
                      {b.nome}
                      <span
                        className="block text-[10px] font-semibold text-gray-500"
                        title={labelParentescoDependente(b.parentesco, 'completo')}
                      >
                        {labelParentescoDependente(b.parentesco, 'abrev') || 'Dep.'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                      {df ? formatarDataIsoPtBr(df) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {st
                        ? st.emCarencia
                          ? `Dia ${st.diasDecorridos + 1} — faltam ${st.diasRestantes}`
                          : 'Encerrada'
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                      {st ? formatarDataIsoPtBr(st.dataFimCarencia) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {st && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            st.emCarencia
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {st.emCarencia ? 'Em carência' : 'Cobertura ativa'}
                        </span>
                      )}
                    </td>
                    {!somenteLeitura && (onEditarDependente || onPromoverTitular || onRemoverDependente || onRegistrarObito) && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {onRegistrarObito && !beneficiarioEstaFalecido(b) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-gray-700"
                              onClick={() => onRegistrarObito(b)}
                              title="Registrar óbito e dar baixa no plano"
                            >
                              <Cross className="h-3.5 w-3.5 mr-1" />
                              Óbito
                            </Button>
                          )}
                          {onPromoverTitular &&
                            (!dependentePodeVirarTitular || dependentePodeVirarTitular(b)) &&
                            !beneficiarioEstaFalecido(b) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-amber-700"
                                onClick={() => onPromoverTitular(b)}
                                title="Dependente passa a ser titular do cadastro"
                              >
                                <Crown className="h-3.5 w-3.5 mr-1" />
                                Titular
                              </Button>
                            )}
                          {onEditarDependente && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-indigo-600"
                              onClick={() => onEditarDependente(b)}
                            >
                              Editar
                            </Button>
                          )}
                          {onRemoverDependente && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-rose-600"
                              onClick={() => onRemoverDependente(b)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Remover
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tabelaFalecidos}
    </div>
  );
}
