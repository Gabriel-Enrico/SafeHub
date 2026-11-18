create sequence if not exists public.mensagens_id_seq;

select setval(
  'public.mensagens_id_seq',
  greatest(coalesce(max(id), 0), 1),
  coalesce(max(id), 0) > 0
)
from public.mensagens;

alter sequence public.mensagens_id_seq owned by public.mensagens.id;
alter table public.mensagens
  alter column id set default nextval('public.mensagens_id_seq'::regclass);
