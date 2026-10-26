-- Igual que en Live Tracker (migración 44), una corrida no puede sustituir
-- la última ubicación válida por una anterior o sin señal. La fecha de
-- operación y el resto de la fila sí se actualizan, incluso al cambiar de día.
-- Aditiva e idempotente; requiere migración 15. No reescribe datos existentes.

create or replace function public.colectas_conservar_ultima_ubicacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.posicion_en is not null
     and old.latitud between -90 and 90
     and old.longitud between -180 and 180
     and (old.latitud <> 0 or old.longitud <> 0)
     and (
       new.posicion_en is null
       or new.posicion_en < old.posicion_en
       or new.latitud is null or new.longitud is null
       or new.latitud not between -90 and 90
       or new.longitud not between -180 and 180
       or (new.latitud = 0 and new.longitud = 0)
     ) then
    new.latitud := old.latitud;
    new.longitud := old.longitud;
    new.posicion_en := old.posicion_en;
  end if;
  return new;
end;
$$;

-- Solo la ejecuta el trigger; no es una RPC para los clientes.
revoke all on function public.colectas_conservar_ultima_ubicacion()
  from public, anon, authenticated;

drop trigger if exists colectas_drivers_antes_ubicacion on public.colectas_vivo_drivers;
create trigger colectas_drivers_antes_ubicacion
before update on public.colectas_vivo_drivers
for each row execute function public.colectas_conservar_ultima_ubicacion();
