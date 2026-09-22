# IMOBILET - homologacao local do Supabase

Este ambiente existe para validar migrations e regras de acesso sem conectar ao
Supabase de producao. Nao importe backups nem dados reais de clientes.

## Requisitos

- Docker Desktop iniciado;
- Node.js e npm instalados;
- projeto acessado pela unidade `I:` enquanto permanecer dentro de uma pasta
  cujo caminho contenha `#`.

## Fluxo local

Na pasta do projeto:

```powershell
npm.cmd run supabase:start
npm.cmd run supabase:reset
npm.cmd run test:database
npm.cmd run lint:database
npm.cmd run audit:database
```

O painel local fica disponível em `http://127.0.0.1:54323`.

Para encerrar os servicos:

```powershell
npm.cmd run supabase:stop
```

## Estrutura

- `supabase/migrations/*_local_existing_schema_baseline.sql`: cria uma base
  minima apenas quando `properties` e `buyers` ainda nao existem;
- `supabase/migrations/*_receivables_module.sql`: cria contratos, parcelas,
  pagamentos, auditoria, funcoes, grants e policies RLS;
- `supabase/migrations/*_payment_receipts_storage.sql`: cria o bucket privado e
  policies de comprovantes;
- `supabase/tests/receivables_test.sql`: executa testes pgTAP com dados ficticios.

## Regras de seguranca

- nunca usar `service_role` no frontend;
- nunca copiar chaves locais para producao;
- nunca importar o backup de producao neste ambiente;
- manter RLS ativo e grants anonimos revogados nas tabelas financeiras;
- executar reset, testes, lint e advisors antes de promover uma migration;
- nao vincular o CLI ao projeto de producao durante a homologacao local.

## Promocao futura

O SQL so deve seguir para um projeto Supabase de homologacao remoto depois que:

1. o preflight confirmar os tipos e vinculos reais;
2. os testes locais estiverem aprovados;
3. o ambiente remoto estiver vazio ou contiver apenas dados ficticios;
4. houver um plano de rollback revisado.

Aplicacao em producao exige autorizacao separada e backup validado.
