# Backend PHP - Apex Funeraria

Backend HTTP em PHP para estruturar, filtrar e servir dados do frontend.

## Requisitos

- PHP 8.2+
- Extensao `pdo_pgsql`

## Configuracao

1. Copie `.env.example` para `.env`:
   - Linux/macOS: `cp .env.example .env`
2. Preencha credenciais do Postgres/Supabase.

Voce pode usar uma string unica via `DB_URL` (recomendado para evitar erro de host/porta/usuario):

```env
DB_URL=postgresql://usuario:senha@host:porta/postgres
DB_SSLMODE=require
```

Quando `DB_URL` estiver preenchido, ela tem prioridade sobre `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD`.

### Dica para erro de conexao IPv6 no Supabase

Se aparecer `SQLSTATE[08006]` com `db.<project-ref>.supabase.co` (porta `5432`), configure fallback para o pooler IPv4:

```env
DB_FALLBACK_HOST=aws-0-sa-east-1.pooler.supabase.com
DB_FALLBACK_PORT=6543
```

No painel do Supabase, copie exatamente o host/porta do "Connection pooling" da sua regiao.

## Executar local

Na raiz do projeto (recomendado — usa router para todas as rotas):

```bash
npm run dev:php
```

Ou manualmente:

```bash
cd backend-php
php -S 0.0.0.0:8080 -t public public/index.php
```

Em outro terminal: `npm run dev` (Vite na porta 3000 faz proxy de `/cobranca`, `/cobradores`, etc.).

Configure no `backend-php/.env`:

- `DB_URL` — connection string do Postgres (Supabase)
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` — mesmos do `.env` do frontend

Teste: `curl http://127.0.0.1:8080/health` → JSON `{"success":true,...}`

## Produção (nginx no mesmo domínio do app)

Encaminhe estas rotas para o PHP (porta 8080 ou php-fpm):

- `/health`, `/auth`, `/dashboard`, `/cobranca`, `/cobradores`, `/frota`

Exemplo em `deploy/nginx-api-php.conf.example`.

Se a API ficar em outro host, defina no build do frontend:

```env
VITE_BACKEND_PHP_URL=https://api.suaempresa.com.br
```

## Endpoints principais

- `GET /health`
- `POST /auth/login` (501 — login é via Supabase no frontend)
- `GET /dashboard/resumo`
- `GET /cobranca/pendentes`
- `POST /cobranca/acoes`
- `POST /cobranca/recebimentos`
- `GET /cobranca/recebimentos/{id}`
- `PUT /cobranca/recebimentos/{id}`
- `GET /cobradores/lista`
- `GET /cobradores/recebimentos`
- `GET /frota/veiculos`
- `GET /frota/motoristas`
- `GET /frota/abastecimentos`
- `GET /frota/manutencoes`
- `GET /frota/viagens`
- `GET /frota/gastos`

## Limpeza de dados para producao

Script seguro com dry-run por padrao:

```bash
php scripts/cleanup_for_production.php
```

Executar limpeza real:

```bash
php scripts/cleanup_for_production.php --confirm
```

Opcional: zerar tambem tabelas operacionais dos modulos novos nas empresas reais:

```bash
php scripts/cleanup_for_production.php --confirm --wipe-modules
```
