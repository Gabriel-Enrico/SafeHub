# Testar o CRUD de clientes no Postman

A coleção autentica uma vez pelo Supabase e guarda o access token no ambiente Postman ativo. Não é necessário fazer login pelo frontend nem copiar o token manualmente.

## Preparação

1. Inicie o backend na pasta `backend` com `npm run dev`.
2. No Postman, importe os arquivos `SafeHub - CRUD de Clientes.postman_collection.json` e `SafeHub Local.postman_environment.json` desta pasta.
3. Selecione o ambiente **SafeHub Local**.
4. No ambiente, preencha os valores locais de `email` e `password` com as credenciais de uma conta já criada no Supabase Auth. Mantenha esses valores somente no Postman e não exporte nem compartilhe o ambiente preenchido.

## Executar todos os testes

Use o botão de execução da coleção (Collection Runner) e rode os requests na ordem listada:

1. Login Supabase
2. Listar clientes
3. Criar cliente de teste
4. Consultar o cliente criado
5. Atualizar cliente
6. Excluir cliente criado

A resposta do login salva automaticamente `accessToken`; a criação salva o `clientId`. O último request apaga fisicamente o cliente de teste.

Também é possível executar os requests manualmente na mesma ordem. Faça o login primeiro; depois, os requests do CRUD reutilizam o token e o ID do ambiente.

Os endpoints continuam protegidos: sem credenciais válidas, a API responde `401`. O login automatizado no Postman substitui a necessidade de uma tela de login, mas não remove a autenticação exigida pela API.

## Primeiro passo da conexão Outlook

1. No `backend/.env`, configure `MICROSOFT_REDIRECT_URI=http://localhost:3000/api/v1/integracoes/outlook/callback` junto com os três valores do aplicativo Microsoft. Nunca compartilhe `MICROSOFT_CLIENT_SECRET`.
2. Reinicie o backend com `npm run dev` para carregar o `.env` atualizado.
3. Execute primeiro **1. Login Supabase (automático)** e, em seguida, **Outlook 1. Iniciar conexão (gera URL Microsoft)**.
4. A resposta contém `authorizationUrl`. Abra esse link no navegador, entre na conta Outlook e aceite `Calendars.ReadWrite`. Para teste local, essa etapa só confirma que conseguimos construir o início do fluxo.

O retorno OAuth ainda não foi implementado: após o consentimento, o callback poderá responder 404 até concluirmos a próxima etapa. Esta fase demonstra o início do fluxo; não persiste tokens nem conecta a agenda por completo.
