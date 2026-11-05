-- Separa la operación vigente del archivo de devoluciones por mes mexicano.
-- La función es transaccional e idempotente: primero copia/actualiza y recién
-- después elimina las filas archivadas de la tabla operativa.

create table if not exists public.devoluciones_historico (
  mes date not null,
  id bigint not null,
  primera_devolucion timestamptz not null,
  ultima_devolucion timestamptz not null,
  fecha_devuelto timestamptz,
  estado text,
  repartidor text,
  tienda text,
  destino text,
  poligono text,
  fecha_programado date,
  visitas integer,
  actualizado_en timestamptz not null default now(),
  primary key (mes, id)
);

create index if not exists devoluciones_historico_mes_idx
  on public.devoluciones_historico (mes desc);

alter table public.devoluciones_historico enable row level security;
revoke all on public.devoluciones_historico from anon, authenticated;
grant all on public.devoluciones_historico to service_role;

create or replace function public.rotar_devoluciones_historico()
returns table (archivadas bigint, retiradas bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  limite date := date_trunc('month', now() at time zone 'America/Mexico_City')::date;
begin
  lock table public.devoluciones_mensuales in share row exclusive mode;
  lock table public.devoluciones_historico in share row exclusive mode;

  insert into public.devoluciones_historico (
    mes, id, primera_devolucion, ultima_devolucion, fecha_devuelto, estado,
    repartidor, tienda, destino, poligono, fecha_programado, visitas, actualizado_en
  )
  select mes, id, primera_devolucion, ultima_devolucion, fecha_devuelto, estado,
    repartidor, tienda, destino, poligono, fecha_programado, visitas, actualizado_en
  from public.devoluciones_mensuales
  where mes < limite
  on conflict (mes, id) do update set
    primera_devolucion = excluded.primera_devolucion,
    ultima_devolucion = excluded.ultima_devolucion,
    fecha_devuelto = excluded.fecha_devuelto,
    estado = excluded.estado,
    repartidor = excluded.repartidor,
    tienda = excluded.tienda,
    destino = excluded.destino,
    poligono = excluded.poligono,
    fecha_programado = excluded.fecha_programado,
    visitas = excluded.visitas,
    actualizado_en = excluded.actualizado_en;
  get diagnostics archivadas = row_count;

  delete from public.devoluciones_mensuales where mes < limite;
  get diagnostics retiradas = row_count;
  return next;
end;
$$;

revoke all on function public.rotar_devoluciones_historico() from public, anon, authenticated;
grant execute on function public.rotar_devoluciones_historico() to service_role;

comment on table public.devoluciones_historico is
  'Devoluciones de meses cerrados, separadas de la operación mensual vigente.';
comment on function public.rotar_devoluciones_historico() is
  'Archiva atómicamente todo mes anterior al vigente en México.';

select * from public.rotar_devoluciones_historico();
