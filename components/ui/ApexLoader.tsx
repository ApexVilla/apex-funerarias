import React from 'react';

const DEFAULT_WORDS = ['Planos', 'Clientes', 'Financeiro', 'Contratos', 'Planos'];

export type ApexLoaderProps = {
  words?: string[];
  className?: string;
  subtitle?: string;
};

/** Spinner com 3 anéis coloridos + texto “Carregando” com palavras em ciclo (padrão do sistema). */
export const ApexLoader: React.FC<ApexLoaderProps> = ({
  words = DEFAULT_WORDS,
  className = '',
  subtitle,
}) => (
  <div
    className={`flex flex-col items-center justify-center gap-4 ${className}`}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="apex-spinner-container">
      <div className="apex-spinner" />
      <div className="apex-loader">
        <span>Carregando</span>
        <div className="apex-loader-words">
          {words.map((word, i) => (
            <span key={`${word}-${i}`} className="apex-loader-word">
              {word}
            </span>
          ))}
        </div>
      </div>
    </div>
    {subtitle ? (
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
    ) : null}
  </div>
);
