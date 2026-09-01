-- ---------------------------------------------------------------------------
-- Migración 01 · columnas calculadas
--
-- Para bases creadas con la primera versión de `schema.sql`. Ese archivo usa
-- `create table if not exists`, así que volver a correrlo NO agrega columnas a
-- una tabla que ya existe: hace falta esto.
--
-- Se pierden los valores guardados de `caso`, `copiar`, `demora` e `ids`. No es
-- un problema: las cuatro eran derivadas de otras columnas, y desde ahora las
-- recalcula Postgres en cada lectura de la fila. `demora` desaparece del todo
-- porque depende de la fecha de hoy y la calcula la web.
--
-- Correr una vez en el SQL Editor de Supabase. Es idempotente.
-- ---------------------------------------------------------------------------

-- Una columna común no se puede convertir en generada: hay que rehacerla. Y se
-- borran también las que ya son generadas, para que correr esto dos veces no
-- falle con «la columna ya existe».
alter table public.mensual drop column if exists caso;
alter table public.mensual drop column if exists informacion_enviar;
alter table public.mensual drop column if exists ids;
alter table public.mensual drop column if exists copiar;
alter table public.mensual drop column if exists demora;
alter table public.ayer    drop column if exists ids;

alter table public.mensual add column if not exists avisado_en timestamptz;

alter table public.mensual
  add column caso text generated always as (
    case
      when btrim(lower(estado)) in (
        'entregado',
        'devuelto',
        'siniestrado',
        'devolución en centro de dropoff',
        'devolucion en centro de dropoff'
      ) then 'Cerrado'
      else 'Abierto'
    end
  ) stored;

alter table public.mensual
  add column informacion_enviar text generated always as (
    case
      when coalesce(btrim(reclamo_tienda), '') = '' then null
      else btrim(regexp_replace(
        'Para el envío te comparto lo siguiente: '
          || coalesce(btrim(destino), '')
          || ' *' || btrim(reclamo_tienda) || '*: '
          || coalesce(btrim(ubicacion), '')
          || ' ' || coalesce(btrim(telefono), ''),
        '\s+', ' ', 'g'))
    end
  ) stored;

alter table public.mensual add column ids text generated always as (id::text || ',') stored;
alter table public.ayer    add column ids text generated always as (id::text || ',') stored;

-- El índice se fue junto con la columna que indexaba.
create index if not exists mensual_caso_idx on public.mensual (caso);
