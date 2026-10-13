-- Permite medir el cierre real a partir de HistorialViaje, incluso en otro mes.
alter table public.devoluciones_mensuales
  add column if not exists fecha_devuelto timestamptz;

comment on column public.devoluciones_mensuales.fecha_devuelto is
  'Primer movimiento Devuelto posterior a primera_devolucion; null si no existe.';
