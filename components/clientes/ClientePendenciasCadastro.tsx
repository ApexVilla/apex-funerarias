import React from 'react';
import { AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react';
import {
  calcularCompletudeCadastroCliente,
  rotuloPendenciasCadastro,
  type ClienteCompletudeInput,
  type DependenteCompletudeInput,
  type ResumoCompletudeCadastro,
} from '../../lib/clienteCompletudeCadastro';

export type { ClienteCompletudeInput, DependenteCompletudeInput };

type Props = {
  cliente?: ClienteCompletudeInput;
  dependentes?: DependenteCompletudeInput[];
  /** Lista compacta (badge) ou painel com detalhes */
  variant?: 'badge' | 'painel' | 'barra';
  resumo?: ResumoCompletudeCadastro;
  className?: string;
};

export function ClientePendenciasCadastro({
  cliente,
  dependentes = [],
  variant = 'badge',
  resumo: resumoProp,
  className = '',
}: Props) {
  const resumo =
    resumoProp ?? (cliente ? calcularCompletudeCadastroCliente(cliente, dependentes) : null);
  if (!resumo) return null;
  const completo = resumo.pendentes === 0;

  if (variant === 'badge') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
          completo
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-900 border-amber-200'
        } ${className}`}
        title={
          completo
            ? 'Todos os dados rastreados estão preenchidos'
            : resumo.itensPendentes.map((i) => (i.dependente ? `${i.dependente}: ` : '') + i.label).join(', ')
        }
      >
        {completo ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" />
        ) : (
          <AlertCircle className="h-3 w-3 shrink-0" />
        )}
        {rotuloPendenciasCadastro(resumo)}
      </span>
    );
  }

  if (variant === 'barra') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700">Completude do cadastro</span>
          <span className={completo ? 'text-emerald-700 font-semibold' : 'text-amber-800 font-semibold'}>
            {resumo.percentual}% · {rotuloPendenciasCadastro(resumo)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${completo ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${resumo.percentual}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        completo ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/40'
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        {completo ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <ClipboardList className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">
            {completo ? 'Cadastro completo' : rotuloPendenciasCadastro(resumo)}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {resumo.preenchidos} de {resumo.totalRastreados} dados conferidos
            {resumo.dependentes.length > 0
              ? ` · ${resumo.dependentes.length} dependente(s) na lista`
              : ''}
          </p>
        </div>
        <span
          className={`text-xs font-black tabular-nums ${
            completo ? 'text-emerald-700' : 'text-amber-800'
          }`}
        >
          {resumo.percentual}%
        </span>
      </div>

      {!completo && (
        <div className="space-y-3 text-xs">
          {resumo.titular.pendentes > 0 && (
            <div>
              <p className="font-bold uppercase tracking-wider text-[10px] text-gray-500 mb-1">
                Titular ({resumo.titular.pendentes})
              </p>
              <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                {resumo.titular.itens.map((item) => (
                  <li key={`t-${item.label}`}>{item.label}</li>
                ))}
              </ul>
            </div>
          )}
          {resumo.dependentes.map((dep) => (
            <div key={dep.nome}>
              <p className="font-bold uppercase tracking-wider text-[10px] text-gray-500 mb-1">
                {dep.nome} ({dep.pendentes})
              </p>
              <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                {dep.itens.map((item) => (
                  <li key={`${dep.nome}-${item.label}`}>{item.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
