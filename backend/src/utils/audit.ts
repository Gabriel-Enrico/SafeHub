import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function recordAudit(
  queryable: Queryable,
  usuarioId: number | null,
  entidade: string,
  entidadeId: string | number,
  acao: string,
  alteracoes: Record<string, unknown> = {}
) {
  await queryable.query(
    `insert into public.auditoria_eventos (usuario_id,entidade,entidade_id,acao,alteracoes)
     values ($1,$2,$3,$4,$5::jsonb)`,
    [usuarioId, entidade, String(entidadeId), acao, JSON.stringify(alteracoes)]
  );
}
