-- Seguimiento: quita el estado Tomado y conserva driver/seller en cada reporte.
-- Ejecutar una vez en el SQL Editor de Supabase antes de desplegar la web.

begin;

alter table public.seguimiento add column if not exists driver text;
alter table public.seguimiento add column if not exists seller text;
alter table public.seguimiento add column if not exists abierto_en timestamptz;

-- Para filas anteriores a esta migración, el alta es el mejor comienzo que
-- existe. Desde ahora, cada reapertura reinicia este reloj.
update public.seguimiento set abierto_en = created_at where abierto_en is null;
alter table public.seguimiento alter column abierto_en set default now();
alter table public.seguimiento alter column abierto_en set not null;

-- Tomado no significaba resuelto: los casos vuelven a la cola de abiertos.
update public.seguimiento
   set estado = 'abierto',
       atendido_por = null,
       atendido_en = null,
       abierto_en = now()
 where estado::text = 'tomado';

-- El enum antiguo puede conservar el valor físicamente, pero ya no es válido
-- para la tabla y ninguna integración puede volver a insertarlo.
alter table public.seguimiento drop constraint if exists seguimiento_estado_valido_check;
alter table public.seguimiento
  add constraint seguimiento_estado_valido_check
  check (estado::text in ('abierto', 'cerrado'));

-- Backfill de reportes existentes. No pisa un valor ya capturado.
update public.seguimiento as s
   set driver = coalesce(
         nullif(btrim(s.driver), ''),
         (select nullif(btrim(m.repartidor), '') from public.mensual m where m.id::text = s.caso_id limit 1),
         (select nullif(btrim(h.repartidor), '') from public.mensual_historico h where h.id::text = s.caso_id limit 1)
       ),
       seller = coalesce(
         nullif(btrim(s.seller), ''),
         (select nullif(btrim(m.tienda), '') from public.mensual m where m.id::text = s.caso_id limit 1),
         (select nullif(btrim(h.tienda), '') from public.mensual_historico h where h.id::text = s.caso_id limit 1)
       )
 where nullif(btrim(s.driver), '') is null
    or nullif(btrim(s.seller), '') is null;

commit;
