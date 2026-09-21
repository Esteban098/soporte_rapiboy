-- ---------------------------------------------------------------------------
-- Colectas en vivo
--
-- La foto de las colectas de hoy en México para el mapa de Tiendas: qué
-- repartidor va a qué tienda, en qué estado está cada colecta y dónde anda el
-- repartidor. La escribe el flujo 12 de n8n cada pocos minutos y cuando
-- alguien aprieta «Actualizar» en la pantalla.
--
-- Son dos tablas propias y no tocan ninguna otra: `colectas` y
-- `colectas_asignacion` siguen siendo del flujo 06, con su ventana de días y
-- su universo. Esta es la jornada en curso, con la posición del repartidor,
-- que aquellas no tienen.
--
--   colectas_vivo          una fila por colecta (Colecta.Id)
--   colectas_vivo_drivers  una fila por repartidor (Motoboy.Id) con su
--                          última posición conocida
--
-- Acumulan: el flujo hace upsert y no borra. La pantalla filtra por
-- `fecha_operacion`, así que las filas de días anteriores quedan como
-- registro y no se mezclan con hoy. Son unas setenta colectas por día.
--
-- Es aditiva: correrla dos veces no rompe nada. Correr una vez en el SQL
-- Editor de Supabase, antes de importar el flujo 12.
-- ---------------------------------------------------------------------------

create table if not exists public.colectas_vivo (
  -- Colecta.Id del sistema. Clave del upsert.
  id_colecta            bigint primary key,

  -- El día en México al que pertenece la colecta. Lo decide la web o el
  -- flujo con America/Mexico_City, nunca el reloj del servidor.
  fecha_operacion       date not null,

  -- Colecta.IdEstado crudo: 1 Asignada, 2 En camino, 3 Retirada,
  -- 4 Finalizada, 5 Finalizada parcial, 6 En local, 7 Aceptada,
  -- 8 En depósito. La cancelación sale de `cancelada_en`, no de acá: el
  -- catálogo no tiene un estado Cancelada. El nombre lo pone la web.
  id_estado             integer,

  /*
   * Las fechas son instantes (`timestamptz`). RapiboyData las guarda en hora
   * de Argentina y la consulta las convierte con AT TIME ZONE antes de que
   * salgan, así que acá ya no hay reloj de pared que reinterpretar.
   */
  creada_en             timestamptz,
  solicitada_en         timestamptz,
  colectada_en          timestamptz,
  llego_deposito_en     timestamptz,
  cancelada_en          timestamptz,

  -- Del historial: el último cambio de estado y la primera vez que entró a
  -- cada uno. Con esto la pantalla dice «en local hace 25 min».
  estado_desde          timestamptz,
  aceptada_en           timestamptz,
  en_camino_en          timestamptz,
  en_local_en           timestamptz,
  retirada_en           timestamptz,
  finalizada_en         timestamptz,
  en_deposito_en        timestamptz,

  -- Colecta.HoraDesde / HoraHasta como 'HH:MM', sin fecha ni zona: así las
  -- guarda el sistema. En México casi siempre vienen vacías o '01:00-01:00',
  -- que la web trata como «sin ventana».
  hora_desde            text,
  hora_hasta            text,
  id_turno              integer,

  id_reserva            bigint,
  reserva_cancelada     boolean,

  -- El repartidor de la colecta y el de su reserva, por separado: cuando no
  -- coinciden hay algo a medio reasignar, y eso se mira.
  id_motoboy            bigint,
  id_motoboy_reserva    bigint,

  id_seller             bigint,
  seller                text,
  direccion_seller      text,
  -- COALESCE(Direccion, Usuario): la dirección normalizada manda.
  latitud_tienda        double precision,
  longitud_tienda       double precision,

  /*
   * Los paquetes, en los tres momentos en que el sistema los cuenta:
   * `cantidad_pedidos` son los ids de Colecta.IdPedidos (lo que se espera),
   * `paquetes_solicitados` es Colecta.CantidadPaquetes (se llena al retirar)
   * y `paquetes_colectados` es CantidadPaquetesColectados (al llegar a la
   * bodega). La lista de ids no se guarda: alcanza con cuántos son.
   */
  cantidad_pedidos      integer,
  paquetes_solicitados  integer,
  paquetes_colectados   integer,
  cantidad_bultos       integer,

  -- Sin catálogo confirmado: se guarda el número tal cual, sin nombre.
  id_deposito           bigint,
  depositos_visitados   text,
  comentario            text,

  -- La corrida del flujo que escribió la fila. Todas las filas de una
  -- corrida llevan el mismo valor; una colecta de hoy con un valor más viejo
  -- que el resto es una que la última corrida ya no vio.
  sincronizado_en       timestamptz not null default now()
);

create index if not exists colectas_vivo_fecha_idx
  on public.colectas_vivo (fecha_operacion desc);
create index if not exists colectas_vivo_motoboy_idx
  on public.colectas_vivo (fecha_operacion, id_motoboy);

create table if not exists public.colectas_vivo_drivers (
  -- Motoboy.Id. Clave del upsert: una reasignación mueve la fila.
  id_motoboy            bigint primary key,
  fecha_operacion       date not null,
  nombre                text,
  apellido              text,

  /*
   * Motoboy.Latitud / Longitud: la última posición conocida, no la de este
   * instante. Nulas cuando el sistema no trae un punto válido (fuera de rango
   * o el 0,0 de un teléfono sin señal): el repartidor sigue en la lista, lo
   * que no se hace es dibujarlo donde no está.
   */
  latitud               double precision,
  longitud              double precision,
  -- Motoboy.UltimaActualizacion convertida a instante. La antigüedad no se
  -- guarda: la calcula el navegador contra su propio reloj.
  posicion_en           timestamptz,

  sincronizado_en       timestamptz not null default now()
);

create index if not exists colectas_vivo_drivers_fecha_idx
  on public.colectas_vivo_drivers (fecha_operacion desc);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- Igual que el resto del proyecto: RLS prendido y sin políticas. Solo leen el
-- servidor de la web y n8n, con sus credenciales de servicio.
-- ---------------------------------------------------------------------------
alter table public.colectas_vivo         enable row level security;
alter table public.colectas_vivo_drivers enable row level security;
