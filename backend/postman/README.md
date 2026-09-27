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
