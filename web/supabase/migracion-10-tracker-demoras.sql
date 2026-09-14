-- ---------------------------------------------------------------------------
-- Live tracker · movimiento e inconvenientes confirmados
--
-- Para bases que ya instalaron live-tracker.sql. Agrega el reloj de movimiento
-- real y el registro que silencia la alerta de una jornada cuando operaciones
-- confirmó que el driver no continuará la ruta.
-- ---------------------------------------------------------------------------

begin;

alter table public.tracker_drivers
  add column if not exists ultima_movimiento_en timestamptz;

update public.tracker_drivers
   set ultima_movimiento_en = coalesce(fecha_ultima_posicion, sincronizado_en, now())
 where ultima_movimiento_en is null;

alter table public.tracker_drivers
  alter column ultima_movimiento_en set default now(),
  alter column ultima_movimiento_en set not null;

create table if not exists public.tracker_demoras (
  id                       uuid primary key default gen_random_uuid(),
  fecha_operacion          date not null,
  id_motoboy               bigint not null references public.tracker_drivers (id_motoboy),
  nombre_driver            text not null,
  motivo                   text not null check (length(btrim(motivo)) between 5 and 1000),
  ultima_movimiento_en     timestamptz not null,
  paquetes_sin_visitar    integer not null check (paquetes_sin_visitar > 0),
  registrado_por           text not null,
  registrado_en            timestamptz not null default now(),
  unique (fecha_operacion, id_motoboy)
);

create index if not exists tracker_demoras_fecha_idx
  on public.tracker_demoras (fecha_operacion, registrado_en desc);

create or replace function public.tracker_marcas()
returns trigger
language plpgsql
as $$
begin
  new.ultima_deteccion := now();
  new.sincronizado_en  := now();

  if tg_op = 'UPDATE' then
    new.primera_deteccion := old.primera_deteccion;
  end if;

  if tg_table_name = 'tracker_drivers' then
    if tg_op = 'INSERT' then
      new.ultima_movimiento_en := coalesce(new.fecha_ultima_posicion, now());
    elsif new.fecha_operacion is distinct from old.fecha_operacion then
      new.ultima_movimiento_en := coalesce(new.fecha_ultima_posicion, now());
    elsif new.latitud is not null and new.longitud is not null and (
      old.latitud is null or old.longitud is null or
      sqrt(
        power((new.latitud - old.latitud) * 111320, 2) +
        power(
          (new.longitud - old.longitud) * 111320 * cos(radians(new.latitud)),
          2
        )
      ) >= 50
    ) then
      new.ultima_movimiento_en := coalesce(new.fecha_ultima_posicion, now());
    else
      new.ultima_movimiento_en := old.ultima_movimiento_en;
    end if;
  end if;

  if tg_table_name = 'tracker_paquetes' then
    if new.activo_en_ruta then
      new.retirado_de_ruta_en := null;
    elsif tg_op = 'INSERT' or old.activo_en_ruta then
      new.retirado_de_ruta_en := now();
    else
      new.retirado_de_ruta_en := old.retirado_de_ruta_en;
    end if;
  end if;

  return new;
end;
$$;

-- `d.*` se expande al crear la vista. Hay que recrearla para incorporar la
-- columna nueva sin intentar renombrar las dos columnas calculadas existentes.
drop view if exists public.tracker_drivers_vista;
create view public.tracker_drivers_vista
with (security_invoker = true) as
select
  d.*,
  case
    when d.fecha_ultima_posicion is null then null
    else floor(extract(epoch from (now() - d.fecha_ultima_posicion)) / 60)::integer
  end as minutos_sin_actualizar,
  floor(extract(epoch from (now() - d.ultima_movimiento_en)) / 60)::integer
    as minutos_sin_movimiento,
  case
    when d.latitud is null or d.longitud is null      then 'SIN_POSICION'
    when d.fecha_ultima_posicion is null              then 'SIN_FECHA'
    when d.fecha_ultima_posicion > now() - interval '10 minutes' then 'RECIENTE'
    when d.fecha_ultima_posicion > now() - interval '45 minutes' then 'DEMORADA'
    else 'VIEJA'
  end as estado_posicion
from public.tracker_drivers d;

alter table public.tracker_demoras enable row level security;

commit;
