import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const phpEnabled = ['true', '1', 'yes'].includes(
    (env.VITE_BACKEND_PHP_ENABLED ?? '').trim().toLowerCase(),
  );
  const phpBackendTarget =
    env.VITE_BACKEND_PHP_PROXY_TARGET?.trim() || 'http://127.0.0.1:8080';
  const phpProxy = phpEnabled
    ? {
        // Com `backendApi` em dev usando URL relativa (mesma origem do Vite),
        // estas rotas são encaminhadas ao PHP em 8080 — evita CORS.
        // Não incluir `/frota`: conflita com rotas React do app (F5 em /frota/*).
        '/health': { target: phpBackendTarget, changeOrigin: true },
        '/auth': { target: phpBackendTarget, changeOrigin: true },
        '/cobranca': { target: phpBackendTarget, changeOrigin: true },
        '/cobradores': { target: phpBackendTarget, changeOrigin: true },
        '/dashboard/resumo': { target: phpBackendTarget, changeOrigin: true },
        // Relatório PDF do caixa: gerado no navegador (lib/caixaRelatorioPdf.ts), sem PHP
      }
    : {};
  // Evita ENOSPC: o repo inclui crm-fenix (~12k arquivos) fora do app Vite.
  const watchIgnored = [
    '**/crm-fenix/**',
    '**/backend-php/**',
    '**/dist/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/supabase/**',
    '**/.git/**',
    '**/__pycache__/**',
  ];

  const devPort = Number(env.VITE_DEV_PORT) || 3000;
  const hmrHost = (env.VITE_DEV_HMR_HOST ?? '').trim();
  const disableHmr = ['true', '1', 'yes'].includes(
    (env.VITE_DISABLE_HMR ?? '').trim().toLowerCase(),
  );

  /** HMR: sem host fixo o Vite usa o mesmo hostname da página (localhost vs 127.0.0.1). */
  const hmrConfig = disableHmr
    ? false
    : hmrHost
      ? { protocol: 'ws' as const, host: hmrHost, port: devPort, clientPort: devPort }
      : true;

  return {
    build: {
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/react/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) {
              return 'vendor-pdf';
            }
            if (id.includes('date-fns')) return 'vendor-date-fns';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('framer-motion')) return 'vendor-motion';
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-css-before-js',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            const cssLink = html.match(/<link rel="stylesheet"[^>]*>/);
            const moduleScript = html.match(/<script type="module"[^>]*><\/script>/);
            if (!cssLink?.[0] || !moduleScript?.[0]) return html;
            let out = html.replace(cssLink[0], '').replace(moduleScript[0], '');
            out = out.replace('</head>', `  ${cssLink[0]}\n</head>`);
            out = out.replace('</body>', `  ${moduleScript[0]}\n</body>`);
            return out;
          },
        },
      },
    ],
    server: {
      port: devPort,
      host: '127.0.0.1',
      strictPort: true,
      proxy: phpProxy,
      watch: {
        ignored: watchIgnored,
      },
      // WebSocket do Vite (hot reload). Use http://127.0.0.1:3000 ou http://localhost:3000 — o mesmo host nos dois.
      // VITE_DISABLE_HMR=true desliga o WebSocket (recarregue F5 após salvar).
      hmr: hmrConfig,
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
