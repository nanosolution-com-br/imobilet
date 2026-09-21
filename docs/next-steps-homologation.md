# IMOBILET - Proximos passos de homologacao

Este roteiro parte do estado ja mesclado na branch `main`.

## 1. Ambiente local

1. Atualizar a branch local:

```bash
git checkout main
git pull origin main
```

2. Configurar as variaveis locais a partir de `.env.example`, sem versionar `.env.local`.
3. Validar o projeto:

```bash
npm run validate:receivables
npm run validate:supabase-config
npm run validate:bb-boleto
npm run lint
npm run build
```

## 2. Supabase em ambiente de teste

Antes de aplicar qualquer SQL em producao:

0. Rodar `docs/supabase-receivables-preflight.sql` no SQL Editor do projeto de teste e salvar apenas os achados tecnicos, sem exportar dados de clientes.
1. Conferir se as tabelas existentes possuem os nomes esperados:
   - `properties`
   - `buyers`
   - `customers`, se usada no projeto real
2. Conferir os tipos reais das colunas `properties.id`, `buyers.id` e eventuais colunas de vinculo como `buyers.property_id`.
3. Revisar `docs/supabase-receivables-schema.sql` linha a linha no SQL Editor de um projeto de teste.
4. Confirmar que todas as novas tabelas tem RLS ativo.
5. Confirmar que as policies usam `TO authenticated` com predicados de ownership, e nao `service_role` no front-end.
6. Confirmar que `payments` so permite inserir pagamentos em parcelas pertencentes a contratos do usuario autenticado.
7. Confirmar que funcoes publicas tem `EXECUTE` revogado de `public`/`anon` e liberado apenas quando necessario.
8. Criar no Storage o bucket privado `payment-receipts` com limite de 10 MB e MIME types PDF/JPEG/PNG/WEBP.
9. Aplicar `docs/supabase-payment-receipts-storage.sql` e confirmar que upload, leitura e exclusao exigem ownership.
10. Confirmar que as novas tabelas e as RPCs necessarias estao expostas para a Data API apenas com `GRANT` adequado para `authenticated`.
11. Testar com usuario comum autenticado:
   - criar contrato e parcelas pela RPC transacional `create_sales_contract_with_installments`;
   - listar contas a receber;
   - registrar pagamento parcial;
   - registrar quitacao;
   - anexar e baixar um comprovante privado;
   - validar historico de pagamentos.
12. Rodar `docs/supabase-receivables-postflight.sql` para conferir tabelas, colunas, RLS, grants, policies, funcoes, bucket e FKs criadas.

## 3. Banco do Brasil

Nesta fase, ainda nao emitir boleto real.

Dados a obter do Banco do Brasil / Lotes & Terrenos:

- convenio;
- agencia sem DV;
- conta/codigo beneficiario no formato contratado;
- carteira/modalidade;
- regra de sequencial do nosso numero;
- ambiente e credenciais de homologacao da API, quando a integracao real for autorizada;
- confirmacao se sera boleto registrado, BolePix ou API Cobranca.

Validacoes antes de producao:

1. Gerar boletos apenas com dados de homologacao.
2. Conferir codigo de barras e linha digitavel com o validador/homologador do BB.
3. Confirmar layout visual do boleto com o banco.
4. Definir armazenamento seguro de comprovantes/boletos com RLS ou URLs assinadas.
5. So ativar emissao real depois de aceite formal.

## 4. Producao

Nao fazer deploy na Hostinger nem aplicar migracao Supabase em producao sem autorizacao explicita.

Antes do deploy:

- backup validado do schema;
- teste do fluxo completo em homologacao;
- revisao de dados pessoais expostos nas telas antigas;
- revisao de variaveis de ambiente na Hostinger;
- plano de rollback.
