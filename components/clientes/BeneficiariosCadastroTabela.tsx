import React, { useMemo } from 'react';
import { ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import type { PlanoCompleto as Plano } from '../../lib/PlanosStore';
import {
  CARENCIA_DEPENDENTE_PADRAO_DIAS,
  calcularStatusCarenciaContrato,
  calcularStatusCarenciaDependente,
  diasCarenciaDependenteDoPlano,
  formatarResumoCarenciaContrato,
} from '../../lib/beneficiarioCarencia';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { labelParentescoDependente } from '../../lib/parentescoDependente';

export type BeneficiarioCadastroLinha = {
  id?: string;
  nome: string;
  parentesco?: string;
  data_inclusao?: string;
};

type Props = {
  beneficiarios: BeneficiarioCadastroLinha[];
  plano?: Plano | null;
  dataInicioContrato?: string;
  titulo?: string;
  vazio?: string;
};

export function BeneficiariosCadastroTabela({
  beneficiarios,
  plano,
  dataInicioContrato,
  titulo = 'Lista de dependentes e carência',
  vazio = 'Nenhum dependente na lista. Use o botão acima para adicionar.',
}: Props) {
  const linhas = useMemo(
    () => beneficiarios.filter((b) => (b.nome || '').trim()),
    [beneficiarios],
  );

  const diasCarenciaCtr = plano?.carencia_dias ?? 0;
  const diasCarenciaDep = diasCarenciaDependenteDoPlano(plano?.carencia_beneficiario_adicional_dias ?? undefined);
  const dataCtr = (dataInicioContrato || new Date().toISOString()).slice(0, 10);
  const statusContrato = plano
    ? calcularStatusCarenciaContrato(dataCtr, diasCarenciaCtr)
    : null;

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="bg-indigo-50/80 dark:bg-indigo-950/40 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/50">
        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
          <Users className="h-4 w-4" />
          {titulo}
        </h4>
        {plano ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-700 dark:text-slate-300">
            <p>
              <strong>Plano:</strong> {plano.nome} — carência do contrato: <strong>{diasCarenciaCtr}d</strong>
              {statusContrato && (
                <span className="ml-1">
                  ({statusContrato.emCarencia ? 'contrato em carência' : 'contrato liberado'})
                </span>
              )}
            </p>
            <p>
              <strong>Dependentes:</strong> {diasCarenciaDep}d após a <strong>data de filiação</strong>
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
            Selecione o plano na etapa de contrato para ver as carências exatas do plano. Enquanto isso, usa-se{' '}
            <strong>{CARENCIA_DEPENDENTE_PADRAO_DIAS} dias</strong> para dependentes.
          </p>
        )}
      </div>

      {linhas.length === 0 ? (
        <p className="text-center text-sm text-gray-500 dark:text-slate-400 py-6 px-4">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-800 dark:text-slate-200">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 uppercase text-[10px] font-black tracking-wider">
                <th className="px-3 py-2.5 text-left">#</th>
                <th className="px-3 py-2.5 text-left">Dependente</th>
                <th className="px-3 py-2.5 text-left">Data filiação</th>
                <th className="px-3 py-2.5 text-left">Carência ({diasCarenciaDep}d)</th>
                <th className="px-3 py-2.5 text-left">Fim carência</th>
                <th className="px-3 py-2.5 text-left">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {linhas.map((b, idx) => {
                const df = (b.data_inclusao || new Date().toISOString()).slice(0, 10);
                const st = calcularStatusCarenciaDependente(df, diasCarenciaDep);
                const Icon = st?.emCarencia ? ShieldAlert : ShieldCheck;
                return (
                  <tr key={b.id || `row-${idx}`} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20">
                    <td className="px-3 py-2.5 text-gray-400 dark:text-slate-500 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-slate-100">
                      {b.nome.trim()}
                      {b.parentesco ? (
                        <span
                          className="block text-[10px] font-semibold text-gray-500 dark:text-slate-400"
                          title={labelParentescoDependente(b.parentesco, 'completo')}
                        >
                          {labelParentescoDependente(b.parentesco, 'abrev')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatarDataIsoPtBr(df)}</td>
                    <td className="px-3 py-2.5">
                      {st
                        ? st.emCarencia
                          ? `Dia ${st.diasDecorridos + 1} — faltam ${st.diasRestantes}`
                          : 'Encerrada'
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {st ? formatarDataIsoPtBr(st.dataFimCarencia) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {st && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            st.emCarencia
                              ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200'
                              : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200'
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {st.emCarencia ? 'Em carência' : 'Cobertura ativa'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {plano && linhas.length > 0 && (
        <p className="text-[10px] text-gray-500 dark:text-slate-400 px-4 py-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
          {formatarResumoCarenciaContrato(dataCtr, diasCarenciaCtr)}
        </p>
      )}
    </div>
  );
}
