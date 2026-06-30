# CRM Fênix Funerária Ltda

Sistema CRM web para controle de contatos WhatsApp com segurança de dados por perfil.

## Stack
- Frontend: React + Tailwind CSS
- Backend: Node.js + Express + JWT
- Banco: SQLite

## Estrutura
```
crm-fenix/
  backend/
  frontend/
  README.md
```

## Funcionalidades implementadas
- Autenticação JWT com perfis `admin` e `vendedor`
- Controle de usuários (admin): criar, listar, desativar vendedor
- Reatribuição em lote de carteira de clientes
- Clientes:
  - CRUD (admin)
  - Busca por nome
  - Filtros por status e vendedor
  - Vendedor só vê os próprios clientes
  - Telefone mascarado para vendedor
- Contatos WhatsApp:
  - Registro com data/hora automática
  - Status do contato (`Mensagem enviada`, `Respondeu`, `Não atendeu`, `Prometeu pagar`)
  - Histórico por cliente
  - Exportação Excel (admin)
- Auditoria:
  - Log de acesso por cliente (`audit_logs`)
- Dashboard:
  - Total de clientes, inadimplentes, bloqueados
  - Contatos de hoje
  - Ranking por vendedor
  - Gráfico de status
  - Alerta de clientes sem contato há mais de 30 dias

## Rodando o backend
```bash
cd backend
npm install
cp .env.example .env
npm run seed-admin
npm run dev
```

Credencial inicial:
- Email: `admin@fenix.com`
- Senha: `123456`

## Rodando o frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5174`  
Backend: `http://localhost:4000`

## Regras de segurança aplicadas
- Vendedor nunca recebe telefone completo nas rotas de clientes
- Vendedor só acessa clientes da própria carteira
- Apenas admin pode CRUD de clientes e gestão de usuários
- Contatos ficam persistidos no servidor (SQLite)
