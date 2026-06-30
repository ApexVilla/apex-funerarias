# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (Vite dev server on :3000)
npm run dev

# Backend PHP (server on :3000 that proxies to :8080)
npm run dev:php          # inicia o PHP em :8080 (rodar em terminal separado do npm run dev)

# Build de produção
npm run build

# Checar tipos TypeScript (sem emitir arquivos)
npx tsc --noEmit

# Lint de sintaxe PHP (rodar do diretório backend-php/)
php -l src/Controllers/NomeController.php

# Limpeza de dados para produção (dry-run por padrão)
php backend-php/scripts/cleanup_for_production.php [--confirm] [--wipe-modules]

# Playwright (e2e)
npx playwright test
```

## Arquitetura

### Visão geral

Sistema de gestão para funerárias multi-tenant (Apex). Dois servidores independentes:

1. **Frontend** — React 19 + TypeScript + Vite + Tailwind CSS 4. Usa `HashRouter` (não `BrowserRouter`) — todas as rotas do app ficam depois de `#`.
2. **Backend PHP** — `backend-php/` — API HTTP em PHP 8.2+ sem framework. Roteador manual em `backend-php/public/index.php`. Padrão Controllers → Repositories com PDO/PostgreSQL.
3. **Supabase** — fonte primária de dados para a maioria dos módulos. Auth do Supabase valida tokens JWT no frontend e no backend PHP.
4. **PDF Python** — `pdf_service_fenix/api.py` gera relatórios do caixa via `CaixaController` (Flask, porta 5050). A maioria dos outros PDFs é gerada no navegador via `jsPDF` (`lib/caixaRelatorioPdf.ts`, etc.).

### Multi-tenancy

O isolamento de dados é feito por `empresa_id` (UUID). No PHP, `empresa_id` só é aceito via header `X-Empresa-Id` — nunca query string ou body. No frontend, `lib/FilialContext.tsx` e `lib/EmpresaContextoAtivo.tsx` controlam qual empresa/filial está ativa e expõem os IDs para as queries Supabase e chamadas PHP.

### Frontend — estrutura

- **`App.tsx`** — define todas as rotas via `lazy()`. Toda nova page precisa ser registrada aqui.
- **`lib/AuthContext.tsx`** — sessão do usuário, perfil, empresa. Hook: `useAuth()`.
- **`lib/FilialContext.tsx`** — filial ativa (`filialId`/`filialNome`). Hook: `useFilial()`.
- **`lib/EmpresaContextoAtivo.tsx`** — empresa efetiva (para grupos multi-empresa). Hook: `useEmpresaContextoAtivo()`.
- **`lib/backendApi.ts`** — todas as chamadas ao backend PHP. Liga/desliga via `VITE_BACKEND_PHP_ENABLED=true`. Injeta automaticamente `Authorization: Bearer` e `X-Empresa-Id`.
- **`lib/supabase.ts`** — cliente Supabase singleton. Usa `localStorage`, `detectSessionInUrl: false` (HashRouter incompatível com detecção por URL).
- **`components/ui/Components.tsx`** — biblioteca interna de componentes base: `Button`, `Input`, `Select`, `Badge`, `Card`, `Textarea`, `DropdownMenu`. Usar esses antes de criar novos.
- **`components/common/PageHeader.tsx`** — cabeçalho padrão de página. Prop `backTo` para botão de voltar.
- **`types/index.ts`** — tipos TypeScript centrais do domínio.
- **`@`** — alias para a raiz do projeto (configurado em `tsconfig.json` e `vite.config.ts`).

Todas as pages em `pages/` são carregadas com `React.lazy()`. Para criar uma nova page, adicionar o `lazy()` e a `<Route>` em `App.tsx`.

### Backend PHP — estrutura

```
backend-php/
  public/index.php          ← entry point: autoloader, CORS, headers, roteador manual
  src/
    Controllers/            ← recebem request, validam entrada, chamam repositories
    Repositories/           ← queries SQL parametrizadas (PDO)
    Support/
      ApiAuth.php           ← valida Bearer token via Supabase REST; cache por request
      ApiContext.php        ← extrai e valida X-Empresa-Id (só via header)
      Database.php          ← singleton PDO com fallback host
      JsonResponse.php      ← ok($data, $meta, $statusCode) / fail($errors, $code)
      Pagination.php        ← fromQuery(): page/per_page/offset
      Request.php           ← query(), body() (limite 1 MB), header()
      Env.php               ← carrega .env
```

**Padrões obrigatórios no PHP:**
- Queries paginadas usam `count(*) over()` (window function) — nunca `COUNT(*)` em query separada.
- Operações multi-step (insert + update) usam `beginTransaction()` / `commit()` / `rollBack()`.
- Parâmetros ILIKE escapam `%` e `_` com `escapeLike()` (existe em `CobrancaRepository` e `FrotaRepository`).
- PDO com parâmetros nomeados: se o mesmo parâmetro aparecer mais de uma vez na query, usar nomes distintos (`:e1`, `:e2`, …) — o driver pgsql tem comportamento indefinido para nomes repetidos.
- `JsonResponse::ok()` aceita terceiro parâmetro `$statusCode` (ex.: `201` para criações).

### Banco de dados

- PostgreSQL via Supabase. Migrations em `supabase/migrations/` (ordem por timestamp no nome do arquivo).
- Tabelas principais: `clientes`, `fin_contas_receber`, `cob_cobrancas_pendentes`, `cob_recebimentos_campo`, `frota_veiculos`, `frota_viagens`, `fin_caixa_sessoes`, `users`, `empresas`, `cobradores`.
- RLS (Row Level Security) ativo no Supabase. Queries no frontend devem sempre filtrar por `empresa_id` ou confiar no RLS.

### Variáveis de ambiente

**Frontend (`.env`):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_BACKEND_PHP_ENABLED=true        # ativa módulo de cobrança de campo
VITE_BACKEND_PHP_URL=                # vazio = mesmo host via proxy nginx/Vite
```

**Backend PHP (`backend-php/.env`):**
```
DB_URL=postgresql://user:pass@host:port/db
SUPABASE_URL=
SUPABASE_ANON_KEY=
ALLOWED_ORIGIN=https://app.suaempresa.com.br   # não usar * em produção
APP_DEBUG=false
APP_SKIP_AUTH=false                             # nunca true em produção
```

### Proxy Vite (dev)

Com `VITE_BACKEND_PHP_ENABLED=true`, o Vite proxia `/health`, `/auth`, `/cobranca`, `/cobradores`, `/dashboard/resumo` para `http://127.0.0.1:8080`. Rotas que conflitam com o React (ex.: `/frota`) não são proxiadas — usar `VITE_BACKEND_PHP_URL` explícito se necessário.

### MCP Supabase

Configurado em `.cursor/mcp.json`. Para executar SQL direto: prefira `read_only=true` em consultas; revise `execute_sql` e `apply_migration` antes de confirmar.
