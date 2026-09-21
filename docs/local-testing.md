# Teste local do IMOBILET no Windows

## 1. Configurar a conexão com o Supabase

No painel do Supabase, abra o projeto correto e use o botão **Connect**. Copie somente:

- **Project URL**;
- **Publishable key** (recomendada) ou a chave pública **anon** legada.

Crie ou atualize o arquivo `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://REFERENCIA-DO-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_CHAVE_PUBLICA
```

Nunca coloque uma `secret key` ou chave `service_role` nesse arquivo. O `.env.local` é ignorado pelo Git e não deve ser compartilhado.

## 2. Validar e iniciar

No PowerShell, dentro da pasta do projeto:

```powershell
npm.cmd run validate:supabase-config
npm.cmd run dev
```

Abra `http://localhost:3000/login`. Sempre reinicie o servidor depois de alterar o `.env.local`, pois o Vite lê essas variáveis na inicialização.

## 3. Diagnóstico do login

- **Configuração ausente/inválida:** o próprio formulário informa qual item do `.env.local` precisa ser revisto.
- **Email ou senha incorretos:** a conexão está funcionando, mas as credenciais do usuário não foram aceitas.
- **Falha de conexão:** confirme o Project URL, a chave pública, a internet e se o projeto Supabase está ativo.

O cadastro e o login dependem das configurações de Auth do projeto. Para um ambiente administrativo, confirme também se o cadastro público deve permanecer habilitado antes de usar essa tela em produção.
