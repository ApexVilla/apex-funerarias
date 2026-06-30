import React, { type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw, WifiOff, AlertCircle } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null; retried: boolean };

const isChunkError = (err: Error) =>
  err.message.includes('Failed to fetch dynamically imported module') ||
  err.message.includes('Importing a module script failed') ||
  err.message.includes('Loading chunk') ||
  err.message.includes('Loading CSS chunk') ||
  err.name === 'ChunkLoadError';

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, retried: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, retried: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[RouteErrorBoundary]', error, info.componentStack);
    }
  }

  retry = () => this.setState({ error: null, retried: true });

  render() {
    const { error, retried } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);

    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 gap-5 text-center animate-in fade-in duration-300">
        <div className="rounded-full bg-amber-50 dark:bg-amber-950/40 p-4">
          {chunk ? (
            <RefreshCw className="h-8 w-8 text-amber-500" />
          ) : (
            <WifiOff className="h-8 w-8 text-amber-500" />
          )}
        </div>

        <div className="space-y-2 max-w-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-100 text-base">
            {chunk
              ? 'Sistema foi atualizado'
              : 'Não foi possível carregar esta página'}
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
            {chunk
              ? 'Uma nova versão do sistema está disponível. Recarregue para continuar usando normalmente.'
              : 'Verifique sua conexão com a internet e tente novamente. Se o problema persistir, recarregue a página.'}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          {!chunk && !retried && (
            <button
              type="button"
              onClick={this.retry}
              className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <AlertCircle className="h-4 w-4" />
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
