-- ---------------------------------------------------------------------------
-- Base del tablero de soporte
--
-- Dos tablas, una por vista, tal como venían del libro:
--   mensual  el acumulado del mes en curso, con el trabajo de soporte encima
--   ayer     lo que quedó sin cerrar en la jornada anterior
--
-- No comparten esquema a propósito: `ayer` sale del sistema sin pasar por
-- soporte, así que no tiene reclamo, aviso ni caso. El tablero arma las
-- columnas de cada tabla con los campos que realmente trae, así que agregar una
-- columna acá alcanza para que aparezca en la web.
--
-- Correr una vez en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Mensual
-- ---------------------------------------------------------------------------
create table if not exists public.mensual (
  -- Id del pedido en el sistema. Es la clave del upsert diario de n8n.
  id                bigint primary key,

  -- Columnas del sistema: las pisa n8n en cada corrida.
  fecha_creacion    date,
  -- Fecha del último cambio de estado, NO una entrega comprometida: se pisa
  -- cada vez que el paquete se mueve. Sirve para saber hace cuánto que el caso
  -- no avanza, no para cuándo estaba prometido.
  fecha_programado  date,
  estado            text,
  repartidor        text,
  tienda            text,
  destino           text,
  poligono          text,
  visitas           integer,

  -- Columnas de soporte: las carga el equipo, n8n NO las toca.
  reclamo_tienda    text,
  ubicacion         text,
  telefono          text,
  aviso             text,
  caso              text,

  -- Auxiliares que el equipo usa para operar.
  ids               text,
  copiar            text,
  demora            text,
  foto              text,

  -- Rastro de quién editó desde el tablero.
  editado_por       text,
  editado_en        timestamptz
);

-- El tablero ordena y filtra por estas tres, y la tabla crece todos los días.
create index if not exists mensual_estado_idx           on public.mensual (estado);
create index if not exists mensual_fecha_programado_idx on public.mensual (fecha_programado desc);
create index if not exists mensual_caso_idx             on public.mensual (caso);

-- ---------------------------------------------------------------------------
-- Ayer
-- ---------------------------------------------------------------------------
create table if not exists public.ayer (
  id                bigint primary key,
  fecha_creacion    date,
  fecha_programado  date,
  estado            text,
  repartidor        text,
  tienda            text,
  destino           text,
  poligono          text,
  ids               text
);

create index if not exists ayer_estado_idx on public.ayer (estado);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- El tablero lee con la service key y solo desde el servidor, así que ninguna
-- credencial llega al navegador y el login del sitio es lo que protege los
-- datos. RLS queda activo igual: sin políticas, la clave anónima no lee nada,
-- y así una fuga de la anon key no expone teléfonos ni domicilios.
-- ---------------------------------------------------------------------------
alter table public.mensual enable row level security;
alter table public.ayer    enable row level security;
