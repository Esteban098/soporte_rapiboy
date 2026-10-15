-- Estado de Mercado Libre en la foto operativa de cada paquete del tracker.
--
-- Es una columna independiente de `nombre_estado`: los dos sistemas pueden
-- informar estados distintos para el mismo Viaje.Id y ese desfasaje es justo
-- lo que operaciones necesita revisar. No se deriva ni se normaliza al
-- guardar, para conservar el valor original de cada fuente.

alter table public.tracker_paquetes
  add column if not exists estado_meli text;

comment on column public.tracker_paquetes.estado_meli is
  'Estado original de DetalleViaje.EstadoMeli para comparar con nombre_estado de Rapiboy.';
