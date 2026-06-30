import React from 'react';
import {
  extrairCodigoContratoNumerico,
  obterConfigStatusContrato,
  type ContratoStatusExibicao,
} from '../../lib/contratoStatusUi';

type Props = {
  status: ContratoStatusExibicao;
  codigoContrato?: string | null;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
};

export const ContratoStatusIndicador: React.FC<Props> = ({
  status,
  codigoContrato,
  className = '',
  onClick,
}) => {
  const config = obterConfigStatusContrato(status);
  const Icon = config.Icon;
  const codigo = extrairCodigoContratoNumerico(codigoContrato);
  const interativo = Boolean(onClick);

  const conteudo = (
    <>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${config.cls} ${
          interativo ? 'hover:brightness-95 transition' : ''
        }`}
        title={config.label}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${config.iconCls}`} aria-hidden />
        {config.label}
      </span>
      {codigo !== '—' && (
        <span className="text-[10px] font-mono text-gray-500 tabular-nums">{codigo}</span>
      )}
    </>
  );

  if (interativo) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex flex-col items-start gap-0.5 text-left ${className}`}
      >
        {conteudo}
      </button>
    );
  }

  return <div className={`inline-flex flex-col items-start gap-0.5 ${className}`}>{conteudo}</div>;
};
