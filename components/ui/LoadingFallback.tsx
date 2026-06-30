import React, { useEffect, useState } from 'react';
import { ApexLoader } from './ApexLoader';

export const LoadingFallback: React.FC = () => {
  const [slowConnection, setSlowConnection] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlowConnection(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 px-6">
      <ApexLoader />
      {slowConnection && (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm leading-relaxed">
          A conexão está demorando mais que o normal. Aguarde alguns segundos ou{' '}
          <button
            type="button"
            className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
            onClick={() => window.location.reload()}
          >
            recarregar a página
          </button>
          .
        </p>
      )}
    </div>
  );
};
