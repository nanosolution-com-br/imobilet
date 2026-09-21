# Plano de privacidade para documentos existentes

## Situacao encontrada

Os fluxos antigos usam `getPublicUrl` nos buckets `property_documents`, `broker_documents` e `payable_documents`. O bucket de imoveis mistura fotos destinadas a exibicao com contratos, documentos de compradores, certidoes e recibos.

Nao e seguro tornar esse bucket inteiro privado sem antes separar as fotos publicas e atualizar os registros existentes. Tambem nao e seguro apenas trocar URLs por caminhos, pois os campos atuais podem conter URLs ja salvas.

## Estrutura recomendada

- `property-media`: fotos publicas do imovel, sem documentos pessoais.
- `property-private-documents`: contratos, certidoes, IPTU, recibos e documentos de compradores.
- `broker-private-documents`: RG, CPF, comprovantes e CRECI.
- `payable-private-documents`: comprovantes e documentos de contas a pagar.
- `payment-receipts`: comprovantes privados do modulo de recebiveis.

Todos os buckets de documentos devem ser privados, com RLS por proprietario ou por uma futura regra de equipe. O banco deve guardar apenas o caminho interno do objeto; a interface deve usar download autenticado ou URL assinada curta.

## Migracao segura

1. Inventariar apenas metadados: bucket, quantidade, tamanho e formato dos campos, sem exportar arquivos ou dados pessoais.
2. Confirmar o modelo de autorizacao: por criador ou por equipe financeira/administrativa.
3. Criar os novos buckets privados e testar as policies em homologacao.
4. Atualizar a interface para aceitar caminhos internos e, temporariamente, ler registros legados.
5. Copiar os objetos por uma rotina administrativa controlada e atualizar os registros em transacao.
6. Validar downloads com usuario permitido e negado.
7. Remover URLs publicas e desativar acesso publico somente depois da conferencia e de um backup.

Esta migracao nao deve ser executada diretamente em producao nem com `service_role` no navegador.
