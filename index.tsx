import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Recarrega uma vez se um chunk dinâmico falhar (rede instável após deploy ou Wi‑Fi fraco).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'apex_chunk_reload';
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.setTimeout(() => window.location.reload(), 800);
  }
});

// Antecipa conexão com o Supabase (auth e dados).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
if (supabaseUrl) {
  try {
    const origin = new URL(supabaseUrl).origin;
    for (const rel of ['dns-prefetch', 'preconnect'] as const) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    /* URL inválida no .env */
  }
}

// Intercepta redirect de recovery do Supabase (fallback caso venha por email).
// Transforma #access_token=XXX&type=recovery para #/redefinir-senha?access_token=XXX
(function interceptRecoveryRedirect() {
  const raw = window.location.hash;
  if (!raw || !raw.includes('access_token=') || !raw.includes('type=recovery')) return;
  // Só intercepta se NÃO está já numa rota do HashRouter (ex: #/redefinir-senha)
  if (raw.startsWith('#/')) return;

  const params = raw.substring(1);
  window.location.replace(`${window.location.pathname}#/redefinir-senha?${params}`);
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);