-- ---------------------------------------------------------------------------
-- Colectas en vivo: el recorrido de cada repartidor
--
-- RapiboyData no guarda un historial de posiciones: `Motoboy.Latitud` y
-- `Longitud` se pisan cada vez que el teléfono reporta, y los eventos de
-- `HistorialViaje` de las colectas vienen sin coordenadas. Para poder dibujar
-- por dónde anduvo el repartidor, el flujo 12 guarda acá cada posición nueva
-- que ve, una fila por (repartidor, momento del reporte).
--
-- La resolución es la del flujo —cada cinco minutos— y arranca el día en que
-- se instala: no hay forma de reconstruir lo anterior. Entre dos puntos la
-- pantalla dibuja una recta, no las calles que tomó.
--
-- Es aditiva y se puede correr dos veces. Requiere la migración 15.
-- ---------------------------------------------------------------------------

create table if not exists public.colectas_vivo_posiciones (
  id_motoboy       bigint not null,
  -- Motoboy.UltimaActualizacion convertida a instante. Con la clave
  -- (repartidor, momento), la misma posición leída en dos corridas es una
  -- sola fila: solo se agrega cuando el teléfono volvió a reportar.
  posicion_en      timestamptz not null,
  fecha_operacion  date not null,
  latitud          double precision not null,
  longitud         double precision not null,
  primary key (id_motoboy, posicion_en)
);

create index if not exists colectas_vivo_posiciones_dia_idx
  on public.colectas_vivo_posiciones (fecha_operacion, id_motoboy, posicion_en);

-- Igual que el resto: RLS prendido y sin políticas.
alter table public.colectas_vivo_posiciones enable row level security;
