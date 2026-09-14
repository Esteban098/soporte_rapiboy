-- Seguimiento: quién tomó cada reporte.
--
-- Tomado no es un valor de `estado`: un reporte tomado sigue `abierto`, con
-- `tomado_por` puesto. Así cuenta como pendiente en todo lo que ya existe y el
-- tiempo de resolución no cambia. Al reabrir un reporte se limpia.
--
-- Ejecutar una vez en el SQL Editor de Supabase antes de desplegar la web.

begin;

alter table public.seguimiento add column if not exists tomado_por text;
alter table public.seguimiento add column if not exists tomado_en timestamptz;

-- Las dos columnas van juntas: un nombre sin hora, o al revés, no dice nada.
alter table public.seguimiento drop constraint if exists seguimiento_tomado_check;
alter table public.seguimiento
  add constraint seguimiento_tomado_check
  check ((tomado_por is null) = (tomado_en is null));

create index if not exists seguimiento_tomado_por_idx on public.seguimiento (tomado_por);

commit;
