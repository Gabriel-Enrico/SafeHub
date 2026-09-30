# Planejamento da API REST — SafeHub

Base URL: `/api/v1`. Todas as respostas usam JSON. Salvo os endpoints de autenticação, todos exigem um token Bearer válido.

## Módulos

- Auth e usuários
- Dashboard
- Clientes, interações e oportunidades
- Projetos, tarefas e equipes
- Documentos e pesquisa
- Chat, canais e salas
- Integrações
- Inteligência artificial

## Convenções

Listagens usam `?limit=20&offset=0`; `limit` máximo é 100. Erros usam o formato:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": { "campo": "motivo" }
}
```

## Endpoints

| Método | Endpoint                                         | Finalidade                                           | Autenticação                |
| ------ | ------------------------------------------------ | ---------------------------------------------------- | --------------------------- |
| POST   | `/auth/register`                                 | Criar conta de usuário                               | Não                         |
| POST   | `/auth/login`                                    | Autenticar usuário                                   | Não                         |
| POST   | `/auth/password-recovery`                        | Solicitar recuperação de senha                       | Não                         |
| POST   | `/auth/password-reset`                           | Definir nova senha com token                         | Token de recuperação        |
| GET    | `/me`                                            | Perfil e permissões do usuário atual                 | Sim                         |
| PATCH  | `/me`                                            | Atualizar perfil próprio                             | Sim                         |
| GET    | `/usuarios`                                      | Listar usuários autorizados                          | Sim, permissão              |
| POST   | `/usuarios`                                      | Cadastrar usuário                                    | Sim, administrador          |
| GET    | `/usuarios/:id`                                  | Consultar usuário                                    | Sim, permissão              |
| PATCH  | `/usuarios/:id`                                  | Atualizar usuário/cargo/equipe                       | Sim, administrador          |
| GET    | `/dashboard`                                     | Indicadores do dashboard                             | Sim                         |
| POST   | `/dashboard/ai-summary`                          | Gerar resumo executivo de IA                         | Sim                         |
| GET    | `/clientes`                                      | Listar e filtrar clientes                            | Sim                         |
| POST   | `/clientes`                                      | Cadastrar cliente                                    | Sim                         |
| GET    | `/clientes/:id`                                  | Consultar cliente                                    | Sim                         |
| PATCH  | `/clientes/:id`                                  | Atualizar cliente                                    | Sim                         |
| DELETE | `/clientes/:id`                                  | Excluir/arquivar cliente                             | Sim, permissão              |
| GET    | `/clientes/:id/interacoes`                       | Listar interações do cliente                         | Sim                         |
| POST   | `/clientes/:id/interacoes`                       | Registrar interação                                  | Sim                         |
| GET    | `/clientes/:id/oportunidades`                    | Listar oportunidades do cliente                      | Sim                         |
| POST   | `/clientes/:id/oportunidades`                    | Criar oportunidade                                   | Sim                         |
| PATCH  | `/oportunidades/:id`                             | Atualizar estágio, valor ou responsável              | Sim                         |
| POST   | `/clientes/:id/meeting-minutes/draft`            | Gerar minuta de IA para revisão                      | Sim                         |
| POST   | `/clientes/:id/meeting-minutes/:draftId/confirm` | Confirmar minuta revisada                            | Sim                         |
| GET    | `/projetos`                                      | Listar e filtrar projetos                            | Sim                         |
| POST   | `/projetos`                                      | Criar projeto                                        | Sim                         |
| GET    | `/projetos/:id`                                  | Consultar projeto                                    | Sim                         |
| PATCH  | `/projetos/:id`                                  | Atualizar projeto                                    | Sim                         |
| GET    | `/projetos/:id/tarefas`                          | Listar tarefas do projeto                            | Sim                         |
| POST   | `/projetos/:id/tarefas`                          | Criar tarefa                                         | Sim                         |
| GET    | `/tarefas/:id`                                   | Consultar tarefa                                     | Sim                         |
| PATCH  | `/tarefas/:id`                                   | Atualizar título, prazo, prioridade ou coluna Kanban | Sim                         |
| PATCH  | `/tarefas/:id/responsaveis`                      | Substituir responsáveis da tarefa                    | Sim                         |
| GET    | `/projetos/:id/kanban`                           | Agrupar tarefas por coluna Kanban                    | Sim                         |
| POST   | `/projetos/:id/ai-risk-analysis`                 | Gerar risco de atraso e priorização                  | Sim                         |
| GET    | `/documentos`                                    | Listar, filtrar e buscar por palavra-chave           | Sim                         |
| POST   | `/documentos`                                    | Enviar arquivo PDF/DOCX e salvar metadados           | Sim                         |
| GET    | `/documentos/:id`                                | Consultar metadados e link autorizado                | Sim                         |
| DELETE | `/documentos/:id`                                | Excluir documento                                    | Sim, permissão              |
| GET    | `/documentos/search`                             | Busca tradicional por texto                          | Sim                         |
| POST   | `/documentos/semantic-search`                    | Busca semântica                                      | Sim                         |
| POST   | `/documentos/:id/ai-summary`                     | Gerar resumo revisável                               | Sim                         |
| POST   | `/ai-results/:id/feedback`                       | Registrar feedback sobre conteúdo de IA              | Sim                         |
| GET    | `/canais`                                        | Listar canais permitidos                             | Sim                         |
| POST   | `/canais`                                        | Criar canal                                          | Sim                         |
| GET    | `/canais/:id/membros`                            | Listar membros do canal                              | Sim, membro                 |
| PATCH  | `/canais/:id/membros`                            | Adicionar/remover membros                            | Sim, administrador do canal |
| GET    | `/canais/:id/mensagens`                          | Listar mensagens do canal                            | Sim, membro                 |
| POST   | `/canais/:id/mensagens`                          | Enviar mensagem                                      | Sim, membro                 |
| GET    | `/salas`                                         | Listar salas virtuais                                | Sim                         |
| POST   | `/salas`                                         | Criar sala virtual                                   | Sim, permissão              |
| GET    | `/salas/:id`                                     | Consultar sala e capacidade                          | Sim                         |
| POST   | `/salas/:id/presencas`                           | Registrar entrada em sala                            | Sim                         |
| PATCH  | `/presencas/:id/saida`                           | Registrar saída em sala                              | Sim                         |
| GET    | `/integracoes`                                   | Listar integrações disponíveis e status              | Sim                         |
| POST   | `/integracoes/google-drive/connect`              | Iniciar OAuth do Google Drive                        | Sim                         |
| GET    | `/integracoes/google-drive/callback`             | Receber retorno OAuth                                | Sessão OAuth                |
| GET    | `/integracoes/google-drive/status`               | Consultar conexão do Drive                           | Sim                         |
| POST   | `/integracoes/:provider/disconnect`              | Revogar conexão externa                              | Sim                         |
| POST   | `/integracoes/outlook/connect`                   | Iniciar autorização delegada do Outlook              | Sim                         |
| GET    | `/integracoes/outlook/callback`                  | Receber retorno OAuth e salvar cache MSAL cifrado    | Sessão OAuth (`state`)      |
| GET    | `/integracoes/outlook/status`                    | Consultar conexão Outlook do usuário atual            | Sim                         |
| DELETE | `/integracoes/outlook/connect`                   | Remover conexão Outlook do usuário atual             | Sim                         |
| GET    | `/integracoes/outlook/events`                     | Listar eventos num intervalo da própria agenda       | Sim                         |
| POST   | `/integracoes/outlook/events`                     | Criar evento na própria agenda                       | Sim                         |
| PATCH  | `/integracoes/outlook/events/:eventId`            | Atualizar evento da própria agenda                   | Sim                         |
| DELETE | `/integracoes/outlook/events/:eventId`            | Excluir evento da própria agenda                     | Sim                         |

## Requisições e respostas principais

### Clientes

```json
POST /clientes
{ "nome": "Empresa Exemplo", "setor": "Tecnologia", "responsavel_id": 4 }
```

```json
201 Created
{ "id": 21, "nome": "Empresa Exemplo", "setor": "Tecnologia", "status_pipeline": "novo", "responsavel_id": 4 }
```

### Interações

```json
POST /clientes/21/interacoes
{ "tipo": "reuniao", "descricao": "Definição dos próximos passos" }
```

O `usuario_id` vem do token autenticado e `data_interacao` é definida pelo servidor, salvo decisão contrária.

### Projetos e tarefas

```json
POST /projetos
{ "cliente_id": 21, "equipe_id": 2, "nome": "Implantação", "data_inicio": "2026-09-26" }
```

```json
POST /projetos/7/tarefas
{ "titulo": "Mapear requisitos", "prioridade": "alta", "prazo": "2026-10-10", "coluna_kanban": "a_fazer", "responsaveis_ids": [4, 9] }
```

```json
PATCH /tarefas/12
{ "coluna_kanban": "em_andamento", "prioridade": "urgente" }
```

### Documentos

`POST /documentos` recebe `multipart/form-data`, com `arquivo`, `categoria`, `cliente_id` e/ou `projeto_id`. A resposta não expõe o arquivo diretamente; retorna metadados e uma URL temporária autorizada.

```json
201 Created
{ "id": 30, "nome": "contrato.pdf", "categoria": "contrato", "cliente_id": 21 }
```

### Chat e salas

```json
POST /canais
{ "nome": "Projeto Implantação", "tipo": "projeto", "membros_ids": [4, 9] }
```

```json
POST /canais/3/mensagens
{ "texto": "Reunião confirmada para amanhã." }
```

```json
POST /salas
{ "nome": "Sala de planejamento", "capacidade": 12 }
```

### IA

```json
POST /clientes/21/meeting-minutes/draft
{ "interacoes_ids": [101, 104] }
```

```json
200 OK
{ "id": "draft_abc", "status": "aguardando_revisao", "conteudo": "...", "generated_by": "ai" }
```

O endpoint de confirmação recebe o conteúdo final editado pelo humano. A IA nunca registra uma minuta definitivamente sem essa confirmação.

## Códigos HTTP

| Código | Uso no SafeHub                                           |
| ------ | -------------------------------------------------------- |
| 200    | Consulta ou alteração concluída                          |
| 201    | Recurso criado                                           |
| 204    | Exclusão concluída sem corpo                             |
| 400    | Corpo, filtro ou ID inválido                             |
| 401    | Token ausente, inválido ou expirado                      |
| 403    | Usuário autenticado sem permissão                        |
| 404    | Recurso não encontrado ou inacessível                    |
| 409    | E-mail duplicado, conflito de estado ou vínculo repetido |
| 429    | Limite de chamadas, especialmente IA e integrações       |
| 500    | Falha inesperada do SafeHub                              |
| 503    | IA, Storage ou integração externa indisponível           |

## Fluxos

### Listar tarefas de um projeto

`Frontend → Bearer token → API → autenticação → autorização no projeto → validação do id → consulta tarefas + responsáveis → JSON → Frontend`.

### Gerar minuta por IA

`Frontend → token → API → autorização no cliente → consulta das interações permitidas → serviço de IA → resultado como rascunho/auditoria → JSON para revisão humana`.

### Upload de documento

`Frontend → token + multipart → API → validação de PDF/DOCX/tamanho/permissão → Supabase Storage → metadados em documentos → JSON`.

## Decisões pendentes antes da implementação

1. Autenticação será Supabase Auth ou outro provedor? A tabela `usuarios` precisa de uma referência ao usuário autenticado (`auth_user_id`).
2. Qual é a unidade de isolamento de dados: conta, organização ou equipe? O backlog exige que a IA veja somente dados da conta.
3. Quais papéis e permissões existem (administrador, gestor, colaborador etc.)?
4. A exclusão de clientes, projetos e documentos é física ou por arquivamento/soft delete?
5. Em quais tabelas serão persistidos rascunhos, auditoria e feedback dos resultados de IA?
6. Onde ficará a URL/chave do arquivo no Storage? A tabela `documentos` atual ainda não possui esse campo.
