-- Conserva la última ubicación conocida aunque el origen deje de devolver
-- un evento al cambiar de jornada. No modifica datos históricos ni horarios.
begin;
create or replace function public.tracker_conservar_ultima_ubicacion()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.fecha_ultima_posicion is not null
     and old.latitud between -90 and 90 and old.longitud between -180 and 180
     and (old.latitud <> 0 or old.longitud <> 0)
     and (new.fecha_ultima_posicion is null
          or new.fecha_ultima_posicion < old.fecha_ultima_posicion
          or new.latitud is null or new.longitud is null
          or new.latitud not between -90 and 90
          or new.longitud not between -180 and 180
          or (new.latitud = 0 and new.longitud = 0)) then
    new.latitud := old.latitud;
    new.longitud := old.longitud;
    new.fecha_ultima_posicion := old.fecha_ultima_posicion;
    new.ultima_movimiento_en := old.ultima_movimiento_en;
  end if;
  return new;
end;
$$;
-- BEFORE triggers se ordenan por nombre: conservar antes de tracker_drivers_marcas.
drop trigger if exists tracker_drivers_antes_ubicacion on public.tracker_drivers;
create trigger tracker_drivers_antes_ubicacion before update on public.tracker_drivers
for each row execute function public.tracker_conservar_ultima_ubicacion();
commit;
