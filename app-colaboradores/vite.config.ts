import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    'process.env.VITE_APP_MODE': JSON.stringify('colaboradores'),
  },
  build: {
    target: 'es2018',
    cssMinify: 'lightningcss',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — estável, fica em cache mesmo após updates do app
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          // Router
          if (
            id.includes('/node_modules/react-router') ||
            id.includes('/node_modules/@remix-run/')
          ) {
            return 'vendor-router';
          }
          // Supabase — grande e estável
          if (id.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          // Animações — framer-motion é pesado (~130KB)
          if (id.includes('/node_modules/framer-motion/')) {
            return 'vendor-framer';
          }
          // Gráficos — recharts só é usado em PontoEspelho
          if (
            id.includes('/node_modules/recharts/') ||
            id.includes('/node_modules/d3-') ||
            id.includes('/node_modules/victory-')
          ) {
            return 'vendor-charts';
          }
          // PDF — jspdf + html2canvas são muito pesados, carregam só quando necessário
          if (
            id.includes('/node_modules/jspdf') ||
            id.includes('/node_modules/html2canvas')
          ) {
            return 'vendor-pdf';
          }
          // Planilhas — xlsx é grande, usado só em exports
          if (id.includes('/node_modules/xlsx/')) {
            return 'vendor-xlsx';
          }
          // Ícones
          if (id.includes('/node_modules/lucide-react/')) {
            return 'vendor-lucide';
          }
          // Date utilities
          if (id.includes('/node_modules/date-fns/')) {
            return 'vendor-datefns';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
      'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
    },
  },
});
