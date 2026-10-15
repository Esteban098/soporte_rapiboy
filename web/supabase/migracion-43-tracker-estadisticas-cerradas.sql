-- Foto inmutable para las estadísticas de una jornada cerrada del Live Tracker.
--
-- `tracker_paquetes` es la fotografía viva: los estados de un Viaje pueden
-- seguir cambiando después de la ruta. Esta tabla conserva exactamente los
-- valores que había al primer cierre posterior a la jornada y nunca se vuelve
-- a actualizar. Así el SLA, el inicio y el fin de cada driver no se alteran
-- por una gestión hecha al día siguiente.

begin;

create table if not exists public.tracker_estadisticas_cerradas (
  fecha_ruta           date not null,
  id_viaje             bigint not null,
  id_motoboy           bigint not null,
  nombre_motoboy       text not null,
  clasificacion        text not null check (clasificacion in (
    'PROXIMO', 'PENDIENTE_NO_VISITADO',
    'VISITADO_ENTREGADO', 'VISITADO_NO_ENTREGADO',
    'CANCELADO', 'RETIRADO_DE_RUTA', 'SIN_CLASIFICAR'
  )),
  activo_en_ruta       boolean not null,
  poligono             text,
  latitud_destino      double precision,
  longitud_destino     double precision,
  fecha_programado     timestamptz,
  fecha_visita         timestamptz,
  fecha_cambio_estado  timestamptz,
  congelado_en         timestamptz not null default now(),
  primary key (fecha_ruta, id_viaje)
);

create index if not exists tracker_estadisticas_cerradas_dia_driver_idx
  on public.tracker_estadisticas_cerradas (fecha_ruta, id_motoboy);

alter table public.tracker_estadisticas_cerradas enable row level security;
revoke all on table public.tracker_estadisticas_cerradas from public, anon, authenticated;
grant select, insert on table public.tracker_estadisticas_cerradas to service_role;

create or replace function public.tracker_congelar_estadisticas_cerradas(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insertadas integer;
begin
  -- No se congela una ruta todavía abierta. El calendario de operación es el
  -- de México, incluso si el cron de n8n se expresa en Argentina.
  if p_fecha >= (now() at time zone 'America/Mexico_City')::date then
    return 0;
  end if;

  insert into public.tracker_estadisticas_cerradas (
    fecha_ruta, id_viaje, id_motoboy, nombre_motoboy, clasificacion,
    activo_en_ruta, poligono, latitud_destino, longitud_destino,
    fecha_programado, fecha_visita, fecha_cambio_estado
  )
  select
    p.fecha_ruta,
    p.id_viaje,
    p.id_motoboy,
    coalesce(nullif(btrim(concat_ws(' ', d.nombre, d.apellido)), ''), p.id_motoboy::text),
    p.clasificacion,
    p.activo_en_ruta,
    p.poligono,
    p.latitud_destino,
    p.longitud_destino,
    p.fecha_programado,
    p.fecha_visita,
    p.fecha_cambio_estado
  from public.tracker_paquetes p
  left join public.tracker_drivers d on d.id_motoboy = p.id_motoboy
  where p.fecha_ruta = p_fecha
    and p.id_motoboy is not null
    and p.activo_en_ruta
  on conflict (fecha_ruta, id_viaje) do nothing;

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$$;

revoke all on function public.tracker_congelar_estadisticas_cerradas(date) from public;
grant execute on function public.tracker_congelar_estadisticas_cerradas(date) to service_role;

comment on table public.tracker_estadisticas_cerradas is
  'Foto inmutable de paquetes de una jornada cerrada, usada por Estadísticas del Live Tracker.';

commit;
