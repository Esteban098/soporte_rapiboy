-- Alertas automáticas en la campana.
--
-- Añade avisos para paquetes demorados y seguimientos abiertos más de tres
-- días. `clave` impide que el refresco periódico cree la misma alerta una y
-- otra vez; cambia cuando el paquete se mueve o el seguimiento se reabre.

begin;

alter table public.notificaciones
  add column if not exists clave text;

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check
  check (tipo in ('mencion', 'demora_paquete', 'seguimiento_vencido'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notificaciones_destinatario_clave_key'
      and conrelid = 'public.notificaciones'::regclass
  ) then
    alter table public.notificaciones
      add constraint notificaciones_destinatario_clave_key unique (destinatario, clave);
  end if;
end;
$$;

commit;
