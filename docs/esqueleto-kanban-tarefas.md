# Esqueleto: Kanban de tarefas de clientes e projetos

## Objetivo

Estender o Kanban existente para incluir tarefas criadas a partir de interacoes com clientes, sem remover nem migrar imediatamente as tabelas atuais.

## Estado atual

- Tarefas de projeto ficam em `public.tarefas` e usam `coluna_kanban` (`a_fazer`, `em_andamento`, `concluida`). Responsaveis ficam em `public.tarefa_responsavel`.
- Tarefas de interacao ficam em `public.cliente_tarefas`, relacionadas a `cliente_id` e opcionalmente a `interacao_id`. Essa tabela ja aceita `a_fazer`, `em_andamento`, `bloqueada`, `em_revisao` e `concluida`.
- Os IDs das duas tabelas podem coincidir. Toda tarefa retornada pelo novo quadro precisa incluir `origem` para identificar a tabela correta.

## Escopo sugerido para a primeira versao

1. Listar tarefas das duas origens num quadro compartilhado.
2. Filtrar por cliente, projeto, responsavel e status.
3. Alterar o status sem quebrar os fluxos existentes.
4. Mostrar no cartao se a tarefa veio de um projeto ou de uma interacao e abrir o registro relacionado.

Comentarios, anexos especificos da tarefa, historico completo e confirmacao/auditoria de conclusao podem ser uma segunda etapa. Antes de suportar esses recursos, decidir se cada tabela tera as mesmas estruturas ou se sera feita a unificacao das tarefas.

## Estado da implementacao

- [x] Quadro geral combina tarefas de projeto e de interacao, mantendo as tabelas atuais.
- [x] Filtros por cliente, projeto, equipe, responsavel, status e origem, com paginacao.
- [x] Alteracao de status por origem, com permissao de equipe/relacionamento.
- [x] Cinco status no quadro; a tela de projeto tambem apresenta os novos status.
- [x] Confirmacao ao concluir e registro de autor, horario e historico de status.
- [ ] Comentarios e anexos vinculados diretamente a tarefa.
- [ ] Visoes especificas de tarefas atrasadas e aguardando resposta, e alertas de atribuicao para ambos os tipos.

Antes de iniciar o servidor com a nova API, aplique `database/013_tarefas_quadro_conclusao.sql` no banco do ambiente.

## Contrato de dados comum

Criar um tipo em `backend/src/type/tarefasQuadro.ts` para normalizar as duas fontes:

```ts
export type TarefaOrigem = 'projeto' | 'interacao';

export type StatusTarefa =
  | 'a_fazer'
  | 'em_andamento'
  | 'bloqueada'
  | 'em_revisao'
  | 'concluida';

export interface TarefaQuadro {
  id: number;
  origem: TarefaOrigem;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  prazo: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  projeto_id: number | null;
  projeto_nome: string | null;
  interacao_id: number | null;
  responsaveis_ids: number[];
  responsaveis_nomes: string[];
}
```

Ajuste os campos aos tipos e nomes retornados pelo banco. Para tarefas de projeto, mapeie `coluna_kanban` para `status`. Para tarefas de interacao, use `cliente_tarefas.status`.

## Contratos de API propostos

Registrar as rotas em `backend/src/routes/projetosRoutes.ts` ou criar `tarefasRoutes.ts` e registra-lo em `backend/src/index.ts`.

### Listar o quadro

`GET /api/v1/tarefas/quadro`

Filtros opcionais: `cliente_id`, `projeto_id`, `equipe_id`, `responsavel_id`, `status` e `origem`.

Resposta esperada:

```json
{
  "data": [
    {
      "id": 18,
      "origem": "interacao",
      "titulo": "Investigar falha no carregamento",
      "descricao": "Relato feito durante a reuniao",
      "status": "a_fazer",
      "prioridade": "alta",
      "prazo": "2026-11-10",
      "cliente_id": 21,
      "cliente_nome": "Empresa Exemplo",
      "projeto_id": null,
      "projeto_nome": null,
      "interacao_id": 101,
      "responsaveis_ids": [4],
      "responsaveis_nomes": ["Marcos"]
    }
  ]
}
```

### Alterar status

`PATCH /api/v1/tarefas/:origem/:id/status`

Corpo:

```json
{ "status": "em_andamento" }
```

`origem` aceita somente `projeto` ou `interacao`. O controlador deve validar o status, encontrar a tarefa na tabela correspondente, checar permissao sobre o projeto/cliente e atualizar apenas essa tarefa. Registre a rota estatica `/tarefas/quadro` antes das rotas parametrizadas para facilitar a leitura e evitar ambiguidades.

## Arquivos a implementar

- `backend/src/type/tarefasQuadro.ts`: tipos do contrato normalizado, origem e status.
- `backend/src/controllers/tarefasQuadroController.ts`: `listTarefasQuadro` e `updateTarefaStatus`.
- `backend/src/routes/projetosRoutes.ts` (ou nova `tarefasRoutes.ts`): validacao de query, parametros e corpo.
- `frontend/src/components/TasksBoard.tsx`: colunas, cartoes, filtros e estado de carregamento/erro.
- `frontend/src/screens/ProjectsScreen.tsx`: adicionar uma aba/visao para o quadro compartilhado, mantendo as visoes atuais por projeto e equipe.
- `database/013_tarefas_kanban_compartilhado.sql`: somente se for necessario alterar restricoes ou campos. Primeiro inspecione as constraints atuais de `public.tarefas`; nao assuma que sao iguais as de `cliente_tarefas`.

## TODOs do controlador

### `listTarefasQuadro`

- [x] Resolver o usuario autenticado e seu perfil SafeHub.
- [x] Validar filtros e aplicar paginacao.
- [x] Consultar tarefas de projeto com cliente/projeto/responsaveis.
- [x] Consultar tarefas de interacao com cliente/interacao/responsavel.
- [x] Normalizar as duas consultas para `TarefaQuadro`.
- [x] Aplicar os filtros de autorizacao antes de retornar dados.
- [x] Unir, ordenar e retornar `{ data, pagination }`.

### `updateTarefaStatus`

- [x] Validar `origem`, `id` e `status`.
- [x] Buscar a tarefa e verificar acesso ao projeto ou cliente relacionado.
- [x] Atualizar a coluna correta: `coluna_kanban` ou `cliente_tarefas.status`.
- [x] Se o status for `concluida`, definir `concluido_em` e `concluido_por`.
- [x] Registrar transicoes e autor no historico.
- [x] Expor a consulta do historico por tarefa.

## TODOs de interface

- [x] Renderizar colunas para os cinco status acordados.
- [x] Exibir origem, cliente, projeto, prazo, prioridade e responsaveis no cartao.
- [x] Permitir mudar status por seletor acessivel.
- [x] Adicionar filtros e mensagem de lista vazia.
- [x] Exibir erro sem atualizar a interface se a API rejeitar a mudanca.
- [x] Pedir confirmacao antes de concluir.
- [x] Exibir o historico de status no cartao.

## Casos minimos de teste

- [x] Os filtros usam parametros SQL; testes unitarios cobrem filtros, origem, status e IDs invalidos.
- [ ] Executar testes de integracao com PostgreSQL para permissoes, paginação, atualizacao e historico nas duas origens.
- [ ] Validar manualmente os fluxos completos com a migration aplicada em um banco de desenvolvimento.
- [x] Os fluxos existentes de tarefas por projeto continuam compilando e passam pelos builds.
