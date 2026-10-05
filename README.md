# Fraga Sucatas 2.0.0

Sistema de clientes, compras, notas e validacao por QR Code.

Site: https://fragasucatas.vercel.app/

## Dados compartilhados

Supabase Auth e PostgreSQL substituem o armazenamento isolado do navegador.
Inclusoes, alteracoes e exclusoes sao salvas no banco central. As telas consultam
o banco ao abrir e ao voltar para a janela. Uma falha de conexao nao e apresentada
como uma gravacao bem-sucedida. Nao ha gravacao offline.

Administradores gerenciam os registros. Clientes consultam apenas as proprias
notas, com controle de acesso no banco (RLS). A impressao autenticada mostra nome,
CPF/CNPJ e endereco completos. A consulta publica por QR Code nao retorna CPF
ou endereco e mantem o nome mascarado.

Registros que existiam apenas no navegador podem ser enviados pelo administrador
em **Notas > Importar dados deste aparelho**, no aparelho e navegador originais.
A importacao preserva os QR Codes, evita duplicar notas ja importadas e informa
quando precisa renumerar uma nota. Os dados locais nao sao apagados.

## Desenvolvimento

Requisitos: Node.js 22+, pnpm e Python 3 para a visualizacao local.

```sh
cd latyot
pnpm install --frozen-lockfile
pnpm test
pnpm build
python -m http.server 8001 --bind 127.0.0.1 --directory dist
```

Abrir http://127.0.0.1:8001/. O ambiente local usa o banco compartilhado real:
nao use dados reais em testes destrutivos. O arquivo iniciar_sistema.bat abre
diretamente o site publicado, sem iniciar o antigo banco SQLite.

## Publicacao

O projeto Vercel usa a pasta raiz `latyot`, instala as dependencias do lockfile,
executa `npm run build` e publica apenas `dist`. Atualizacoes em `main` no GitHub
acionam a integracao de publicacao do Vercel.

`assets/js/supabase-config.js` contem somente URL e chave publicavel. Chaves
secretas nunca devem ser colocadas no frontend. A funcao `fraga-api` usa a chave
de servico fornecida pelo ambiente do Supabase e verifica usuario e perfil nas
operacoes administrativas. Login e validacao publica possuem tratamento proprio.

Para recriar o banco, aplicar nesta ordem:

1. `supabase/schema.sql`
2. `supabase/import-browser.sql`
3. `supabase/tighten-policies.sql`
4. `supabase/legacy-auth-reservation.sql`

Publicar tambem `supabase/functions/fraga-api/index.ts`. A migracao das contas
antigas ocorre no primeiro login, com verificacao da senha existente no servidor.
Os registros legados privados nao fazem parte do repositorio.

Configurar em Supabase Auth a URL do site e os redirecionamentos de confirmacao
para `https://fragasucatas.vercel.app/`. Manter confirmacao de email habilitada.
Administradores podem trocar a senha pelo botao **Alterar senha**.

O verificador de seguranca informa que a protecao contra senhas vazadas esta
desabilitada: esse recurso requer plano Pro, e o projeto permanece no gratuito.
Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Arquivos SQLite, uploads locais, senhas e arquivos de ambiente nao devem ser
publicados. Backups locais antigos devem ser guardados em lugar privado. Senhas
que ja apareceram em versoes anteriores do codigo precisam ser substituidas.

Cloudflare DNS exige um dominio proprio. O dominio `vercel.app` e administrado
pelo Vercel e nao pode ser transferido para uma zona Cloudflare do usuario.

## Testes

`pnpm test` executa os testes locais. `tests/cloud-check.cjs` testa sessoes
independentes, permissoes, privacidade do QR, transacoes e exclusoes no banco real.
Exige autorizacao e credenciais em `FRAGA_TEST_USERNAME` e `FRAGA_TEST_PASSWORD`.
Cria dados temporarios; ao finalizar, informa IDs das contas de teste para a
limpeza administrativa. Nunca gravar essas credenciais no repositorio.
