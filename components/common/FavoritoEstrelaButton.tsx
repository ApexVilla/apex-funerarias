import React from 'react';
import { Star } from 'lucide-react';

type Props = {
  ativo: boolean;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md';
};

export const FavoritoEstrelaButton: React.FC<Props> = ({
  ativo,
  onToggle,
  className = '',
  size = 'sm',
}) => {
  const iconClass = size === 'md' ? 'h-4.5 w-4.5' : 'h-4 w-4';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-amber-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${className}`}
      title={ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-label={ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-pressed={ativo}
    >
      <Star
        className={`${iconClass} transition-colors ${
          ativo ? 'fill-amber-400 text-amber-400' : 'text-slate-400 hover:text-amber-300'
        }`}
      />
    </button>
  );
};
