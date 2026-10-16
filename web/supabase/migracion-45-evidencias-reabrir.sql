-- Protege las decisiones humanas contra clics accidentales.
-- La foto sigue teniendo la retencion operativa de siete dias; esta auditoria
-- permanente guarda solo la accion, la decision, el actor y la fecha.
begin;

create table if not exists public.evidencias_entrega_decisiones (
  id             bigint generated always as identity primary key,
  revision_id    uuid not null,
  accion         text not null check (accion in ('REVISION', 'REAPERTURA')),
  decision       text check (decision in ('CONFIRMADA', 'DESCARTADA', 'INCONCLUSA')),
  actor          text not null,
  creada_en      timestamptz not null default now()
);

create index if not exists evidencias_decisiones_revision_idx
  on public.evidencias_entrega_decisiones (revision_id, creada_en desc);

alter table public.evidencias_entrega_decisiones enable row level security;

-- Conserva también las decisiones tomadas antes de instalar esta migración.
insert into public.evidencias_entrega_decisiones (
  revision_id, accion, decision, actor, creada_en
)
select h.revision_id, 'REVISION', h.decision_humana, h.revisada_por, h.revisada_en
from public.evidencias_entrega_historial h
where h.decision_humana is not null
  and h.revisada_por is not null
  and h.revisada_en is not null
  and not exists (
    select 1
    from public.evidencias_entrega_decisiones d
    where d.revision_id = h.revision_id
      and d.accion = 'REVISION'
      and d.creada_en = h.revisada_en
  );

create or replace function public.evidencia_entrega_revisar(
  p_id uuid,
  p_decision text,
  p_revisada_por text,
  p_comentario text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(btrim(p_revisada_por));
begin
  if p_decision not in ('CONFIRMADA', 'DESCARTADA', 'INCONCLUSA') then
    raise exception 'Decisión inválida';
  end if;
  if nullif(v_actor, '') is null then
    raise exception 'Falta revisor';
  end if;

  update public.evidencias_entrega_revision
     set decision_humana = p_decision,
         revisada_por = v_actor,
         revisada_en = now(),
         comentario_revision = left(nullif(btrim(p_comentario), ''), 1000),
         estado_proceso = 'REVISADA',
         updated_at = now()
   where id = p_id and estado_proceso = 'PENDIENTE_REVISION';
  if not found then return false; end if;

  update public.evidencias_entrega_historial
     set decision_humana = p_decision,
         revisada_por = v_actor,
         revisada_en = now()
   where revision_id = p_id;

  insert into public.evidencias_entrega_decisiones (
    revision_id, accion, decision, actor
  ) values (p_id, 'REVISION', p_decision, v_actor);
  return true;
end;
$$;

create or replace function public.evidencia_entrega_reabrir(
  p_id uuid,
  p_reabierta_por text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(btrim(p_reabierta_por));
  v_decision text;
begin
  if nullif(v_actor, '') is null then
    raise exception 'Falta operador';
  end if;

  select decision_humana
    into v_decision
    from public.evidencias_entrega_revision
   where id = p_id
     and estado_proceso = 'REVISADA'
     and vence_en > now()
   for update;
  if not found then return false; end if;

  update public.evidencias_entrega_revision
     set decision_humana = null,
         revisada_por = null,
         revisada_en = null,
         comentario_revision = null,
         estado_proceso = 'PENDIENTE_REVISION',
         updated_at = now()
   where id = p_id;

  update public.evidencias_entrega_historial
     set decision_humana = null,
         revisada_por = null,
         revisada_en = null
   where revision_id = p_id;

  insert into public.evidencias_entrega_decisiones (
    revision_id, accion, decision, actor
  ) values (p_id, 'REAPERTURA', v_decision, v_actor);
  return true;
end;
$$;

revoke all on function public.evidencia_entrega_reabrir(uuid, text) from public;
grant execute on function public.evidencia_entrega_reabrir(uuid, text) to postgres, service_role;

commit;
