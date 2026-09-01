-- ---------------------------------------------------------------------------
-- Base del tablero de soporte
--
-- Tres tablas, una por vista:
--   mensual     el acumulado del mes en curso, con el trabajo de soporte encima
--   ayer        lo que quedó sin cerrar en la jornada anterior
--   cancelados  viajes cancelados el mismo día que se colectaron
--
-- No comparten esquema a propósito: `ayer` sale del sistema sin pasar por
-- soporte, así que no tiene reclamo, aviso ni caso, y `cancelados` no es un
-- pedido con incidencia sino un viaje que se cortó, con sus propios estados. El
-- tablero arma las columnas de cada tabla con los campos que realmente trae,
-- así que agregar una columna acá alcanza para que aparezca en la web.
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
-- Cancelados
--
-- Viajes que se cancelaron el mismo día en que se colectaron, dentro de las 7
-- horas. Eso NO son todas las cancelaciones: el filtro vive en la consulta de
-- n8n, así que esta tabla es "cancelaciones tempranas" y no hay que leerla como
-- el total. Si alguna vez se afloja el filtro, cambia el significado de todo lo
-- que se calcule encima.
--
-- Trae dos estados y dos identificadores porque el viaje vive en dos sistemas a
-- la vez, el propio y el de Meli, y no siempre coinciden: justamente ver dónde
-- se despegan es para lo que sirve.
-- ---------------------------------------------------------------------------
create table if not exists public.cancelados (
  -- Viaje.Id del sistema propio. Clave del upsert diario.
  id                bigint primary key,
  -- Viaje.IdFlex: el id del envío en Meli. Va como texto porque no es un
  -- número nuestro y no queremos perder ceros a la izquierda ni prefijos.
  id_meli           text,
  tienda            text,
  -- Estado en cada sistema, sin unificar a propósito.
  estado_rbp        text,
  estado_meli       text,

  -- Momento en que se colectó y en que se canceló.
  --
  -- Van SIN zona horaria a propósito: la consulta ya les restó 3 horas, así que
  -- lo que llega es hora local de México. Guardarlas como `timestamptz` haría
  -- que Postgres las tomara por UTC y volviera a correrlas al mostrarlas, y los
  -- horarios quedarían mal por segunda vez.
  fecha_colectado   timestamp,
  fecha_cancelado   timestamp
);

-- Casi toda lectura de esta tabla arranca acotando por día.
create index if not exists cancelados_fecha_colectado_idx on public.cancelados (fecha_colectado desc);
create index if not exists cancelados_tienda_idx          on public.cancelados (tienda);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- El tablero lee con la service key y solo desde el servidor, así que ninguna
-- credencial llega al navegador y el login del sitio es lo que protege los
-- datos. RLS queda activo igual: sin políticas, la clave anónima no lee nada,
-- y así una fuga de la anon key no expone teléfonos ni domicilios.
-- ---------------------------------------------------------------------------
alter table public.mensual    enable row level security;
alter table public.ayer       enable row level security;
alter table public.cancelados enable row level security;
