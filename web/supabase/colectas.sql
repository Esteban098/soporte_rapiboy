-- ---------------------------------------------------------------------------
-- Colectas
--
-- Dos tablas, porque son dos cosas de distinto grano y conviene no mezclarlas:
--
--   colectas_asignacion  una fila por seller: quién lo colecta habitualmente
--   colectas             una fila por colecta: qué se pidió y qué se retiró
--
-- La primera responde «a quién le corresponde este seller» y la segunda
-- «quién fue realmente el martes». Con una sola tabla habría que recalcular la
-- asignación en cada lectura, y la asignación no sale solo de las colectas: el
-- mapa de dropOFF viene del historial de viajes, que esta tabla no tiene.
--
-- Correr una vez en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Asignación
--
-- La rehace entera el flujo de n8n en cada corrida: es una foto del ranking de
-- los últimos días, no un histórico. Por eso no tiene fecha propia más que
-- `actualizado_en`, que dice de cuándo es la foto.
-- ---------------------------------------------------------------------------
create table if not exists public.colectas_asignacion (
  -- Usuario.Id del seller en el sistema. Es la clave del upsert.
  id_usuario         bigint primary key,
  seller             text not null,

  /*
   * Dónde se colecta de hecho.
   *
   * Para la mayoría es el seller mismo, y ahí `lugar_colecta` repite a
   * `seller`. Para los que entregan en un punto compartido es el nombre del
   * dropOFF, y varios sellers comparten lugar: el chofer va una vez y levanta
   * todo. Esa diferencia es la que hace que el ranking se calcule por lugar y
   * no por seller.
   */
  lugar_colecta      text,

  -- Chofer que más veces fue a ese lugar en la ventana consultada.
  -- Vacío cuando todavía no hubo ninguna colecta: ahí el flujo escribe
  -- 'SIN ASIGNACION', que es lo que hay que mirar para repartir.
  id_motoboy         text,
  chofer             text,

  -- Cuántas veces fue ese chofer, y cuántos viajes respaldan el mapeo a
  -- dropOFF. Sirven para saber si el ranking se apoya en algo o en una sola
  -- visita suelta.
  cantidad_colectas  integer not null default 0,
  cantidad_historica integer not null default 0,

  actualizado_en     timestamptz not null default now()
);

create index if not exists colectas_asignacion_lugar_idx
  on public.colectas_asignacion (lugar_colecta);
create index if not exists colectas_asignacion_chofer_idx
  on public.colectas_asignacion (chofer);

-- ---------------------------------------------------------------------------
-- Colectas realizadas
--
-- Una fila por colecta, con su ciclo de vida completo: cuándo se pidió, cuándo
-- se retiró, cuándo llegó al depósito o cuándo se canceló.
--
-- La clave es `id` —el Colecta.Id del sistema— y no una clave natural: el
-- registro existe desde que alguien pide la colecta, así que una misma colecta
-- cambia de estado varias veces y hay que poder pisarla.
--
-- Ojo con el universo: esta consulta NO filtra por la reserva 4211, a
-- diferencia de la de asignación. Trae todas las colectas de México en
-- modalidad 5 y 7, incluidas las canceladas y las que todavía no tienen
-- repartidor. Si algún día los números de las dos pantallas no cierran, es
-- por acá.
--
-- Acumula: el flujo trae los últimos 15 días y hace upsert, así que las filas
-- viejas quedan.
-- ---------------------------------------------------------------------------
drop table if exists public.colectas;

create table public.colectas (
  -- Colecta.Id del sistema. Clave del upsert.
  id                     bigint primary key,

  /*
   * Las cuatro fechas del ciclo. Solo la primera está siempre.
   *
   * `fecha` es cuándo se creó el pedido de colecta y es la que ordena la
   * pantalla. Las otras se van llenando —o no— según qué pasó, y de su
   * combinación sale el estado sin necesidad de mirar `id_estado`.
   */
  fecha                  date,
  fecha_solicitud        timestamp,
  fecha_colecta          timestamp,
  fecha_llego_deposito   timestamp,
  fecha_cancelada        timestamp,

  -- Estado tal como lo numera el sistema. Se guarda crudo porque no tenemos su
  -- tabla de nombres; el estado que muestra el tablero sale de las fechas.
  id_estado              integer,

  -- Cuántos paquetes se pidieron y cuántos se retiraron de hecho. La
  -- diferencia es la métrica que importa: una colecta que pasó pero levantó
  -- tres de diez no es una colecta cumplida.
  paquetes_solicitados   integer,
  paquetes_colectados    integer,
  cantidad_bultos        integer,
  depositos_visitados    integer,
  comentario             text,

  id_seller              bigint,
  seller                 text,
  direccion_seller       text,
  telefono_seller        text,
  email_seller           text,

  -- Van con LEFT JOIN en la consulta: una colecta pedida y todavía sin asignar
  -- no tiene repartidor, y es justamente una de las cosas que hay que ver.
  repartidor             text,
  telefono_repartidor    text,

  -- `ReservaxMotoboy` no expone IdRuta: la consulta la pidió y SQL Server la
  -- rechazó, así que la ruta no está disponible por esta vía.
  id_reserva             bigint,
  fecha_reserva          timestamp,
  reserva_cancelada      boolean,

  precio                 numeric,
  incentivo              numeric,
  comision               numeric,
  precio_cobrar_deuda    numeric,
  id_pedidos             text
);

-- Toda lectura de esta tabla arranca acotando por día.
create index if not exists colectas_fecha_idx      on public.colectas (fecha desc);
create index if not exists colectas_seller_idx     on public.colectas (id_seller);
create index if not exists colectas_repartidor_idx on public.colectas (repartidor);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- Igual que el resto del proyecto: RLS prendido y sin políticas. Solo el
-- servidor, con la service key, lee estas tablas.
-- ---------------------------------------------------------------------------
alter table public.colectas_asignacion enable row level security;
alter table public.colectas            enable row level security;
