-- Independiente de Mensual, Ayer, Cancelados y sus históricos.
create table if not exists public.devoluciones_mensuales (
  mes date not null check (extract(day from mes) = 1),
  id bigint not null check (id > 0),
  primera_devolucion timestamptz not null,
  ultima_devolucion timestamptz not null,
  estado text,
  repartidor text,
  tienda text,
  destino text,
  poligono text,
  fecha_programado date,
  visitas integer,
  actualizado_en timestamptz not null default now(),
  primary key (mes, id),
  check (ultima_devolucion >= primera_devolucion)
);
alter table public.devoluciones_mensuales enable row level security;
revoke all on public.devoluciones_mensuales from anon, authenticated;
grant all on public.devoluciones_mensuales to service_role;
comment on table public.devoluciones_mensuales is
  'Una fila por viaje y mes en que pasó por Procesando como devolución; se conserva aunque cambie su estado actual.';
