-- Migración 17: directorio operativo de sellers, drivers y grupos de WhatsApp.
-- Ejecutar una vez en Supabase/PostgreSQL antes de importar el workflow n8n.
-- No modifica tracker_tiendas ni tracker_choferes: esas tablas contienen
-- puntos geograficos estaticos y tienen otra responsabilidad.

begin;

create table if not exists public.directorio_sellers (
  id_seller          bigint primary key,
  nombre             text not null,
  hora_corte         time,
  direccion          text,
  fecha_activacion   date,
  celular            text,
  comercial          text,
  email              text,
  lleva_bodega       boolean,
  lleva_dropoff      boolean,
  paga_colecta       boolean,
  tope_maximo        integer,
  activo             boolean not null default true,
  visto_por_ultima_vez timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_sync_id     text not null
);

create index if not exists directorio_sellers_activos_idx
  on public.directorio_sellers (activo, nombre);

create table if not exists public.directorio_drivers (
  id_motoboy         bigint primary key,
  nombre             text not null,
  condicion          text,
  flotilla           text,
  ultima_reserva     timestamptz,
  activo             boolean not null default true,
  visto_por_ultima_vez timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_sync_id     text not null
);

create index if not exists directorio_drivers_activos_idx
  on public.directorio_drivers (activo, nombre);

create table if not exists public.whatsapp_grupos (
  grupo_jid          text primary key,
  nombre_grupo       text not null,
  id_extraido        bigint,
  nombre_extraido    text,
  activo             boolean not null default true,
  visto_por_ultima_vez timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_sync_id     text not null,
  check (grupo_jid like '%@g.us')
);

create index if not exists whatsapp_grupos_id_extraido_idx
  on public.whatsapp_grupos (id_extraido)
  where activo;

create table if not exists public.whatsapp_asignaciones (
  id                 bigint generated always as identity primary key,
  tipo_entidad       text not null check (tipo_entidad in ('SELLER', 'DRIVER')),
  id_entidad         bigint not null,
  grupo_jid          text not null references public.whatsapp_grupos (grupo_jid),
  origen             text not null default 'AUTOMATICO'
                     check (origen in ('AUTOMATICO', 'MANUAL')),
  actualizado_en     timestamptz not null default now(),
  unique (tipo_entidad, id_entidad),
  unique (grupo_jid)
);

create table if not exists public.directorio_sync_ejecuciones (
  sync_id            text primary key,
  estado             text not null check (estado in ('EJECUTANDO', 'COMPLETADO', 'ERROR')),
  iniciado_en        timestamptz not null default now(),
  finalizado_en      timestamptz,
  sellers_activos    integer,
  drivers_activos    integer,
  grupos_activos     integer,
  vinculos_automaticos integer,
  detalle_error      text
);

-- Solo el backend y n8n con credencial de servicio pueden acceder directamente.
alter table public.directorio_sellers enable row level security;
alter table public.directorio_drivers enable row level security;
alter table public.whatsapp_grupos enable row level security;
alter table public.whatsapp_asignaciones enable row level security;
alter table public.directorio_sync_ejecuciones enable row level security;

-- Directorio consumible por la plataforma.
create or replace view public.directorio_contactos_whatsapp
with (security_invoker = true) as
select
  'SELLER'::text as tipo_entidad,
  s.id_seller as id_entidad,
  s.nombre,
  s.activo,
  a.grupo_jid,
  g.nombre_grupo,
  a.origen,
  s.actualizado_en
from public.directorio_sellers s
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'SELLER' and a.id_entidad = s.id_seller
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid
union all
select
  'DRIVER'::text,
  d.id_motoboy,
  d.nombre,
  d.activo,
  a.grupo_jid,
  g.nombre_grupo,
  a.origen,
  d.actualizado_en
from public.directorio_drivers d
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'DRIVER' and a.id_entidad = d.id_motoboy
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid;

-- Diagnostico de grupos sin vinculo o ambiguos. Un ID que coincide a la vez
-- con seller y driver no se asigna automaticamente.
create or replace view public.whatsapp_grupos_diagnostico
with (security_invoker = true) as
with candidatos as (
  select g.grupo_jid, 'SELLER'::text as tipo_entidad, s.id_seller as id_entidad
  from public.whatsapp_grupos g
  join public.directorio_sellers s on s.id_seller = g.id_extraido and s.activo
  where g.activo
  union all
  select g.grupo_jid, 'DRIVER'::text, d.id_motoboy
  from public.whatsapp_grupos g
  join public.directorio_drivers d on d.id_motoboy = g.id_extraido and d.activo
  where g.activo
), conteo as (
  select grupo_jid, count(*) as coincidencias
  from candidatos
  group by grupo_jid
)
select
  g.grupo_jid,
  g.nombre_grupo,
  g.id_extraido,
  g.nombre_extraido,
  coalesce(c.coincidencias, 0) as coincidencias,
  case
    when g.id_extraido is null then 'SIN_ID'
    when coalesce(c.coincidencias, 0) = 0 then 'SIN_COINCIDENCIA'
    when c.coincidencias = 1 then 'VINCULABLE'
    else 'AMBIGUO'
  end as estado
from public.whatsapp_grupos g
left join conteo c on c.grupo_jid = g.grupo_jid
where g.activo;

commit;

-- Rollback manual, solo si se confirma que estas tablas no tienen consumidores:
-- drop view if exists public.whatsapp_grupos_diagnostico;
-- drop view if exists public.directorio_contactos_whatsapp;
-- drop table if exists public.whatsapp_asignaciones;
-- drop table if exists public.whatsapp_grupos;
-- drop table if exists public.directorio_drivers;
-- drop table if exists public.directorio_sellers;
-- drop table if exists public.directorio_sync_ejecuciones;
