import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
  /** Mostra botão de voltar para a rota informada */
  backTo?: string;
  /** Label do botão de voltar. Padrão: 'Voltar' */
  backLabel?: string;
  /** Ícone decorativo opcional para exibir no header */
  icon?: React.ReactNode;
  /** Cor de acento para a barra lateral (hex). Padrão: var(--accent-color, #1e40af) */
  accentColor?: string;
  /** Badges ou chips extras ao lado do título */
  badges?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actionButton,
  backTo,
  backLabel = 'Voltar',
  icon,
  accentColor,
  badges,
}) => {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      {/* Botão de voltar */}
      {backTo && (
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 uppercase tracking-wider mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </button>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Barra vertical de acento */}
          <div
            className="hidden sm:block flex-shrink-0 w-1 h-10 rounded-full"
            style={{
              background: accentColor
                ? `linear-gradient(to bottom, ${accentColor}, ${accentColor}60)`
                : 'linear-gradient(to bottom, var(--accent-color, #1e40af), rgba(30,64,175,0.4))',
            }}
          />

          {/* Ícone opcional */}
          {icon && (
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
              {icon}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight truncate">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actionButton && (
          <div className="flex-shrink-0">
            {actionButton}
          </div>
        )}
      </div>

      {/* Linha separadora sutil */}
      <div className="mt-5 h-px bg-gradient-to-r from-slate-200 via-slate-100 to-transparent dark:from-slate-700 dark:via-slate-800 dark:to-transparent" />
    </div>
  );
};