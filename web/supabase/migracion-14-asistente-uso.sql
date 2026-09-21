-- ---------------------------------------------------------------------------
-- Uso del asistente
--
-- Una fila por pregunta al asistente del tablero: quién preguntó, cuántos
-- tokens usó y cuánto costó aproximadamente. Alimenta el panel de uso que ve
-- el administrador en Perfiles y el tope diario por persona.
--
-- No guarda la pregunta ni la respuesta: para contar y cobrar alcanza con los
-- números, y el texto puede traer datos de clientes que no hace falta
-- conservar en otro lado.
--
-- `costo_usd` se calcula al guardar, con el precio vigente del modelo: si
-- OpenAI cambia sus precios, lo ya gastado no se reescribe.
-- `dia` es el día de Ciudad de México en que se hizo la pregunta, para que el
-- tope diario y los cortes por mes no dependan de la zona del servidor.
--
-- Ejecutar una vez en el SQL Editor de Supabase antes de desplegar la web. Sin
-- la tabla, el asistente funciona igual: no registra uso ni aplica el tope.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.asistente_uso (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  dia              date not null,
  email            text not null,
  modelo           text not null,
  ok               boolean not null,
  llamadas         integer not null default 0,
  tokens_entrada   integer not null default 0,
  tokens_cache     integer not null default 0,
  tokens_salida    integer not null default 0,
  costo_usd        numeric(12, 6),
  herramientas     text[] not null default '{}'
);

-- El tope diario cuenta las de una persona en un día; el panel lee por mes.
create index if not exists asistente_uso_email_dia_idx on public.asistente_uso (email, dia);
create index if not exists asistente_uso_dia_idx on public.asistente_uso (dia);

-- Igual que el resto: RLS prendido y sin políticas. Lee y escribe el servidor
-- con la service key; la anon key no ve nada.
alter table public.asistente_uso enable row level security;

commit;
