-- Migración 38: revisión automática y humana de fotografías de entrega.
--
-- La foto vive como máximo siete días en Storage y en la tabla operativa. El
-- historial separado no guarda rutas, URLs ni contenido de imagen; conserva
-- únicamente lo necesario para auditoría y para el score de calidad.

begin;

create table if not exists public.evidencias_entrega_config (
  id                     boolean primary key default true check (id),
  modo                   text not null default 'OBSERVACION'
                         check (modo in ('OBSERVACION', 'ACTIVO')),
  minimo_muestra_score   integer not null default 20
                         check (minimo_muestra_score between 1 and 10000),
  maximo_por_corrida     integer not null default 20
                         check (maximo_por_corrida between 1 and 100),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        text
);

insert into public.evidencias_entrega_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.evidencias_entrega_revision (
  id                       uuid primary key default gen_random_uuid(),
  clave_origen             text not null unique,
  id_viaje                 bigint not null,
  historial_evento_id      bigint not null,
  id_motoboy               bigint,
  driver_evento            text,
  evidencia_en             timestamptz not null,

  -- Ruta dentro del bucket privado. Nunca se guarda una URL firmada ni la URL
  -- original de Rapiboy. Se borra junto con esta fila al vencer la retención.
  foto_ruta                text,
  foto_mime                text,
  foto_bytes               integer check (foto_bytes is null or foto_bytes > 0),
  vence_en                 timestamptz not null default (now() + interval '7 days'),

  estado_proceso           text not null default 'PENDIENTE'
                           check (estado_proceso in (
                             'PENDIENTE', 'PROCESANDO', 'ANALIZADA',
                             'PENDIENTE_REVISION', 'REVISADA', 'ERROR'
                           )),
  intentos                 integer not null default 0,
  proximo_intento_en       timestamptz,
  ultimo_error_codigo      text,
  procesando_desde         timestamptz,

  calidad_modelo           text check (calidad_modelo in ('ACEPTABLE', 'DUDOSA')),
  tipo_problema_modelo     text check (tipo_problema_modelo in (
                             'BORROSA', 'OSCURA', 'CORTADA', 'ILEGIBLE',
                             'PAQUETE_NO_DISTINGUIBLE', 'OTRO', 'NINGUNO'
                           )),
  motivo_modelo            text,
  confianza_modelo         numeric(4, 3) check (confianza_modelo between 0 and 1),
  modelo                   text,
  tokens_entrada           integer,
  tokens_salida            integer,
  analizada_en             timestamptz,

  modo_observacion         boolean not null default true,
  decision_humana          text check (decision_humana in (
                             'CONFIRMADA', 'DESCARTADA', 'INCONCLUSA'
                           )),
  revisada_por             text,
  revisada_en              timestamptz,
  comentario_revision      text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (length(clave_origen) between 3 and 300),
  check (comentario_revision is null or length(comentario_revision) <= 1000)
);

create index if not exists evidencias_revision_pendientes_idx
  on public.evidencias_entrega_revision (estado_proceso, evidencia_en desc)
  where estado_proceso = 'PENDIENTE_REVISION';
create index if not exists evidencias_revision_vence_idx
  on public.evidencias_entrega_revision (vence_en)
  where foto_ruta is not null;
create index if not exists evidencias_revision_driver_idx
  on public.evidencias_entrega_revision (id_motoboy, evidencia_en desc);

create table if not exists public.evidencias_entrega_historial (
  id                     uuid primary key default gen_random_uuid(),
  revision_id            uuid not null unique,
  -- Identificador técnico de la fila de origen; nunca contiene la URL.
  clave_origen           text not null unique,
  id_motoboy             bigint,
  id_viaje               bigint not null,
  evidencia_en           timestamptz not null,
  analizada_en           timestamptz not null,
  fue_dudosa             boolean not null,
  tipo_problema          text check (tipo_problema in (
                           'BORROSA', 'OSCURA', 'CORTADA', 'ILEGIBLE',
                           'PAQUETE_NO_DISTINGUIBLE', 'OTRO', 'NINGUNO'
                         )),
  decision_humana        text check (decision_humana in (
                           'CONFIRMADA', 'DESCARTADA', 'INCONCLUSA'
                         )),
  revisada_por           text,
  revisada_en            timestamptz,
  modo_observacion       boolean not null,
  incluye_score          boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists evidencias_historial_score_idx
  on public.evidencias_entrega_historial (id_motoboy, evidencia_en desc)
  where incluye_score;

alter table public.evidencias_entrega_config enable row level security;
alter table public.evidencias_entrega_revision enable row level security;
alter table public.evidencias_entrega_historial enable row level security;

-- Reclama una evidencia nueva o un error cuyo backoff venció. Una ejecución
-- caída puede retomarse después de 20 minutos. Nunca se reclama una fila que
-- ya fue analizada o que otra ejecución todavía está procesando.
create or replace function public.evidencia_entrega_reclamar(
  p_clave_origen text,
  p_id_viaje bigint,
  p_historial_evento_id bigint,
  p_id_motoboy bigint,
  p_driver_evento text,
  p_evidencia_en timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_estado text;
  v_intentos integer;
  v_procesando_desde timestamptz;
  v_proximo timestamptz;
  v_observacion boolean;
begin
  if nullif(btrim(p_clave_origen), '') is null
     or p_id_viaje is null
     or p_historial_evento_id is null
     or p_evidencia_en is null then
    raise exception 'Datos incompletos para reclamar evidencia';
  end if;

  select modo = 'OBSERVACION'
    into v_observacion
    from public.evidencias_entrega_config
   where id = true;

  if exists (
    select 1 from public.evidencias_entrega_historial
     where clave_origen = btrim(p_clave_origen)
  ) then
    return null;
  end if;

  insert into public.evidencias_entrega_revision (
    clave_origen, id_viaje, historial_evento_id, id_motoboy,
    driver_evento, evidencia_en, modo_observacion
  ) values (
    btrim(p_clave_origen), p_id_viaje, p_historial_evento_id, p_id_motoboy,
    nullif(btrim(p_driver_evento), ''), p_evidencia_en, coalesce(v_observacion, true)
  )
  on conflict (clave_origen) do nothing;

  select id, estado_proceso, intentos, procesando_desde, proximo_intento_en
    into v_id, v_estado, v_intentos, v_procesando_desde, v_proximo
    from public.evidencias_entrega_revision
   where clave_origen = btrim(p_clave_origen)
   for update;

  if v_estado in ('ANALIZADA', 'PENDIENTE_REVISION', 'REVISADA') then
    return null;
  end if;
  if v_estado = 'PROCESANDO'
     and v_procesando_desde > now() - interval '20 minutes' then
    return null;
  end if;
  if v_estado = 'ERROR' and v_proximo is not null and v_proximo > now() then
    return null;
  end if;
  if v_intentos >= 4 then
    return null;
  end if;

  update public.evidencias_entrega_revision
     set estado_proceso = 'PROCESANDO',
         intentos = intentos + 1,
         procesando_desde = now(),
         proximo_intento_en = null,
         ultimo_error_codigo = null,
         updated_at = now()
   where id = v_id;
  return v_id;
end;
$$;

create or replace function public.evidencia_entrega_finalizar(
  p_id uuid,
  p_foto_ruta text,
  p_foto_mime text,
  p_foto_bytes integer,
  p_calidad text,
  p_tipo_problema text,
  p_motivo text,
  p_confianza numeric,
  p_modelo text,
  p_tokens_entrada integer,
  p_tokens_salida integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.evidencias_entrega_revision%rowtype;
begin
  update public.evidencias_entrega_revision
     set foto_ruta = p_foto_ruta,
         foto_mime = p_foto_mime,
         foto_bytes = p_foto_bytes,
         calidad_modelo = p_calidad,
         tipo_problema_modelo = p_tipo_problema,
         motivo_modelo = left(nullif(btrim(p_motivo), ''), 500),
         confianza_modelo = p_confianza,
         modelo = left(nullif(btrim(p_modelo), ''), 100),
         tokens_entrada = p_tokens_entrada,
         tokens_salida = p_tokens_salida,
         analizada_en = now(),
         estado_proceso = case when p_calidad = 'DUDOSA'
                           then 'PENDIENTE_REVISION' else 'ANALIZADA' end,
         procesando_desde = null,
         updated_at = now()
   where id = p_id
     and estado_proceso = 'PROCESANDO'
  returning * into v_fila;

  if v_fila.id is null then return false; end if;

  insert into public.evidencias_entrega_historial (
    revision_id, clave_origen, id_motoboy, id_viaje, evidencia_en, analizada_en,
    fue_dudosa, tipo_problema, modo_observacion, incluye_score
  ) values (
    v_fila.id, v_fila.clave_origen, v_fila.id_motoboy, v_fila.id_viaje, v_fila.evidencia_en,
    v_fila.analizada_en, v_fila.calidad_modelo = 'DUDOSA',
    v_fila.tipo_problema_modelo, v_fila.modo_observacion,
    not v_fila.modo_observacion
  )
  on conflict (revision_id) do nothing;
  return true;
end;
$$;

create or replace function public.evidencia_entrega_fallar(
  p_id uuid,
  p_codigo text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.evidencias_entrega_revision
     set estado_proceso = 'ERROR',
         ultimo_error_codigo = left(regexp_replace(lower(coalesce(p_codigo, 'error')), '[^a-z0-9_-]+', '_', 'g'), 80),
         proximo_intento_en = now() + make_interval(mins => least(60, greatest(5, 5 * intentos))),
         procesando_desde = null,
         updated_at = now()
   where id = p_id and estado_proceso = 'PROCESANDO'
  returning true;
$$;

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
begin
  if p_decision not in ('CONFIRMADA', 'DESCARTADA', 'INCONCLUSA') then
    raise exception 'Decisión inválida';
  end if;
  if nullif(btrim(p_revisada_por), '') is null then
    raise exception 'Falta revisor';
  end if;

  update public.evidencias_entrega_revision
     set decision_humana = p_decision,
         revisada_por = lower(btrim(p_revisada_por)),
         revisada_en = now(),
         comentario_revision = left(nullif(btrim(p_comentario), ''), 1000),
         estado_proceso = 'REVISADA',
         updated_at = now()
   where id = p_id and estado_proceso = 'PENDIENTE_REVISION';
  if not found then return false; end if;

  update public.evidencias_entrega_historial
     set decision_humana = p_decision,
         revisada_por = lower(btrim(p_revisada_por)),
         revisada_en = now()
   where revision_id = p_id;
  return true;
end;
$$;

create or replace function public.evidencia_entrega_eliminar_operativa(p_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  delete from public.evidencias_entrega_revision
   where id = p_id and vence_en <= now()
  returning true;
$$;

create or replace view public.evidencias_entrega_score_30d
with (security_invoker = true) as
with configuracion as (
  select minimo_muestra_score from public.evidencias_entrega_config where id = true
), resumen as (
  select
    h.id_motoboy,
    count(*)::integer as total_revisadas,
    count(*) filter (where h.decision_humana = 'CONFIRMADA')::integer as problemas_confirmados,
    count(*) filter (where h.decision_humana = 'DESCARTADA')::integer as falsos_positivos,
    count(*) filter (where h.decision_humana = 'INCONCLUSA')::integer as inconclusas
  from public.evidencias_entrega_historial h
  where h.incluye_score
    and h.id_motoboy is not null
    and h.evidencia_en >= now() - interval '30 days'
  group by h.id_motoboy
)
select
  r.id_motoboy,
  r.total_revisadas,
  r.problemas_confirmados,
  r.falsos_positivos,
  r.inconclusas,
  c.minimo_muestra_score,
  r.total_revisadas >= c.minimo_muestra_score as muestra_suficiente,
  case when r.total_revisadas >= c.minimo_muestra_score
    then round((1 - r.problemas_confirmados::numeric / nullif(r.total_revisadas, 0)) * 100, 1)
    else null
  end as score_calidad,
  round(r.problemas_confirmados::numeric / nullif(r.total_revisadas, 0) * 100, 1) as proporcion_malas
from resumen r cross join configuracion c;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias-entrega', 'evidencias-entrega', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on function public.evidencia_entrega_reclamar(text, bigint, bigint, bigint, text, timestamptz) from public;
revoke all on function public.evidencia_entrega_finalizar(uuid, text, text, integer, text, text, text, numeric, text, integer, integer) from public;
revoke all on function public.evidencia_entrega_fallar(uuid, text) from public;
revoke all on function public.evidencia_entrega_revisar(uuid, text, text, text) from public;
revoke all on function public.evidencia_entrega_eliminar_operativa(uuid) from public;

grant execute on function public.evidencia_entrega_reclamar(text, bigint, bigint, bigint, text, timestamptz) to postgres, service_role;
grant execute on function public.evidencia_entrega_finalizar(uuid, text, text, integer, text, text, text, numeric, text, integer, integer) to postgres, service_role;
grant execute on function public.evidencia_entrega_fallar(uuid, text) to postgres, service_role;
grant execute on function public.evidencia_entrega_revisar(uuid, text, text, text) to postgres, service_role;
grant execute on function public.evidencia_entrega_eliminar_operativa(uuid) to postgres, service_role;

commit;
