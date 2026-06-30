import React, { useMemo } from 'react';
import { Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '../ui/Components';
import {
  calcularStatusCarenciaDependente,
  formatarResumoCarenciaDependente,
  type StatusCarenciaDependente,
} from '../../lib/beneficiarioCarencia';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';

type Props = {
  dataInclusao: string;
  diasCarencia: number;
  dataFimCarencia?: string | null;
  carenciaAtiva?: boolean | null;
  compacto?: boolean;
  className?: string;
};

export function BeneficiarioCarenciaInfo({
  dataInclusao,
  diasCarencia,
  dataFimCarencia,
  carenciaAtiva,
  compacto = false,
  className = '',
}: Props) {
  const status = useMemo((): StatusCarenciaDependente | null => {
    const calc = calcularStatusCarenciaDependente(dataInclusao, diasCarencia);
    if (!calc) return null;
    if (dataFimCarencia) {
      const hoje = new Date().toISOString().slice(0, 10);
      const emCarencia =
        carenciaAtiva ?? (hoje >= calc.dataInclusao && hoje <= dataFimCarencia.slice(0, 10));
      return { ...calc, dataFimCarencia: dataFimCarencia.slice(0, 10), emCarencia };
    }
    return calc;
  }, [dataInclusao, diasCarencia, dataFimCarencia, carenciaAtiva]);

  if (!status) return null;

  const emCarencia = status.emCarencia;
  const Icon = emCarencia ? ShieldAlert : ShieldCheck;

  if (compacto) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        <Badge
          variant="default"
          className={
            emCarencia
              ? 'bg-amber-50 text-amber-800 border-amber-200 text-[10px]'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]'
          }
        >
          <Icon className="h-3 w-3 mr-1 inline" />
          {emCarencia ? `Carência (${status.diasRestantes}d)` : 'Cobertura ativa'}
        </Badge>
        <span className="text-[10px] text-gray-500">
          Filiação {formatarDataIsoPtBr(status.dataInclusao)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-xs ${
        emCarencia ? 'bg-amber-50/80 border-amber-200' : 'bg-emerald-50/80 border-emerald-200'
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${emCarencia ? 'text-amber-600' : 'text-emerald-600'}`} />
        <div className="min-w-0 space-y-1">
          <p className="font-bold text-gray-800 flex flex-wrap items-center gap-2">
            <span>Data de filiação: {formatarDataIsoPtBr(status.dataInclusao)}</span>
            <Badge
              variant="default"
              className={
                emCarencia
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }
            >
              {emCarencia ? 'Em carência' : 'Fora da carência'}
            </Badge>
          </p>
          <p className="text-gray-700 leading-relaxed">{formatarResumoCarenciaDependente(status)}</p>
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Carência do plano: {status.diasCarencia} dias • Dia {status.diasDecorridos + 1} de {status.diasCarencia}
            {emCarencia ? ` • Restam ${status.diasRestantes} dia(s)` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Pré-visualização ao informar data de inclusão de um novo dependente. */
export function BeneficiarioCarenciaPreview({
  dataInclusao,
  diasCarencia,
  nome,
}: {
  dataInclusao: string;
  diasCarencia: number;
  nome?: string;
}) {
  const status = useMemo(
    () => calcularStatusCarenciaDependente(dataInclusao, diasCarencia),
    [dataInclusao, diasCarencia],
  );

  if (!status) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Informe a data de filiação para calcular a carência do dependente.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
        Carência do dependente{nome?.trim() ? `: ${nome.trim()}` : ''}
      </p>
      <BeneficiarioCarenciaInfo
        dataInclusao={status.dataInclusao}
        diasCarencia={status.diasCarencia}
        dataFimCarencia={status.dataFimCarencia}
        carenciaAtiva={status.emCarencia}
      />
    </div>
  );
}
