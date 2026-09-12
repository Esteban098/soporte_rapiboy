-- Foto inmutable de los pendientes de una jornada anterior.
begin;

alter table public.tracker_paquetes
  add column if not exists pendiente_al_inicio_dia boolean;

create or replace function public.tracker_congelar_pendientes_anteriores(p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Solo congela una jornada ya anterior en Ciudad de México. Las actualizaciones
  -- posteriores cambian estado y evidencia, nunca esta foto.
  if p_fecha >= (now() at time zone 'America/Mexico_City')::date then return; end if;
  update public.tracker_paquetes
     set pendiente_al_inicio_dia = activo_en_ruta
       and clasificacion <> 'VISITADO_ENTREGADO'
   where fecha_ruta = p_fecha
     and pendiente_al_inicio_dia is null;
end;
$$;

revoke all on function public.tracker_congelar_pendientes_anteriores(date) from public;
commit;
