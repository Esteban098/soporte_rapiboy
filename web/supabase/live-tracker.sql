-- ---------------------------------------------------------------------------
-- Live tracker
--
-- Tres tablas y una vista. Guardan la foto de la jornada: qué repartidores
-- salieron, dónde se los vio por última vez y qué paquetes lleva cada uno.
--
--   tracker_drivers          una fila por repartidor con operación del día
--   tracker_paquetes         una fila por viaje de las rutas del día
--   tracker_sincronizaciones una fila por corrida de n8n
--
-- La fuente es SQL Server, siempre de solo lectura, y el único que escribe acá
-- es n8n con la credencial Postgres de servicio. La web lee.
--
-- Por qué tres tablas y no una: posiciones y paquetes se actualizan por
-- separado —son dos botones distintos y dos consultas distintas— y mezclarlos
-- obligaría a releer todo para mover un punto en el mapa. La tercera existe
-- porque sin registro de corridas no hay forma de distinguir «no hay paquetes»
-- de «la consulta falló», y esa diferencia decide si se desactiva o no.
--
-- Correr una vez en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Sincronizaciones
--
-- Va primero porque las otras dos referencian su id.
--
-- `estado` tiene tres valores y ninguno es decorativo:
--
--   running  la corrida empezó y todavía no cerró
--   success  la consulta terminó y lo leído se guardó entero
--   failed   algo se cortó en el medio
--
-- Solo una corrida `success` puede desactivar filas. Una `failed` deja todo
-- como estaba: ante un error, la última información válida es mejor que una
-- tabla vaciada a medias.
-- ---------------------------------------------------------------------------
create table if not exists public.tracker_sincronizaciones (
  id                     uuid primary key default gen_random_uuid(),

  -- 'drivers' o 'paquetes'. Es el ámbito del lock: las dos pueden correr a la
  -- vez entre sí, pero no dos de la misma clase.
  tipo                   text not null check (tipo in ('drivers', 'paquetes')),
  estado                 text not null check (estado in ('running', 'success', 'failed')),

  fecha_inicio           timestamptz not null default now(),
  fecha_fin              timestamptz,

  -- El día de operación que se estaba reconciliando, en hora de México. Lo
  -- manda n8n; acá no se recalcula, porque el servidor de la base no tiene por
  -- qué estar en la misma zona.
  fecha_operacion        date,

  registros_leidos       integer not null default 0,
  registros_insertados   integer not null default 0,
  registros_actualizados integer not null default 0,
  registros_desactivados integer not null default 0,
  mensaje_error          text
);

/*
 * Una sola corrida en curso por tipo.
 *
 * Es un índice y no una comprobación dentro de la función a propósito: dos
 * corridas que arrancan en el mismo milisegundo pasarían las dos por un
 * `if exists`, y una de ellas terminaría desactivando lo que la otra todavía
 * no alcanzó a insertar. El índice lo resuelve en la base, que es el único
 * lugar donde la comprobación y la inserción pueden ser atómicas.
 */
create unique index if not exists tracker_sync_una_en_curso_por_tipo
  on public.tracker_sincronizaciones (tipo)
  where estado = 'running';

create index if not exists tracker_sync_tipo_inicio_idx
  on public.tracker_sincronizaciones (tipo, fecha_inicio desc);

-- ---------------------------------------------------------------------------
-- Repartidores del día
--
-- La clave es `id_motoboy` —`Motoboy.Id` del sistema— y no un par con la
-- fecha: esta tabla es el estado actual, no un histórico de posiciones. La
-- posición anterior no se guarda porque el mapa muestra «última posición
-- conocida»; si algún día hiciera falta el recorrido real, va en otra tabla y
-- no agrandando esta.
--
-- No hay `id_ruta` ni `id_poligono`, y es a propósito:
--
--   * `ReservaxMotoboy` no expone `IdRuta`. Está probado: la consulta de
--     colectas la pidió y SQL Server la rechazó (ver colectas.sql). La ruta
--     vive en `Viaje.IdRuta`, así que la del repartidor sale de sus paquetes.
--   * ninguna de las dos tablas de origen expone un polígono verificado. El
--     tablero lo resuelve con las coordenadas contra el KMZ de cobertura, que
--     es un dato real y no una columna adivinada.
-- ---------------------------------------------------------------------------
create table if not exists public.tracker_drivers (
  id_motoboy             bigint primary key,
  nombre                 text,
  apellido               text,

  -- Última posición conocida. Nulas cuando el repartidor todavía no reportó:
  -- un repartidor sin coordenadas es un dato —salió y no está transmitiendo—,
  -- no una fila que haya que esconder.
  latitud                double precision,
  longitud               double precision,
  fecha_ultima_posicion  timestamptz,

  -- `Motoboy.UltimaInfo`, tal como viene. Es lo que el sistema sabe del último
  -- reporte del dispositivo.
  ultima_info            text,

  -- Reserva vigente del día. Es la que ata al repartidor con sus paquetes.
  id_reserva             bigint,
  id_localidad           integer,
  id_modalidad           integer,
  reserva_desde          timestamptz,
  reserva_hasta          timestamptz,

  -- El último día de operación en que se lo vio reservado, en hora de México.
  -- La fila es el estado actual del repartidor y sobrevive de un día para el
  -- otro, así que sin esta columna «activo» no diría de cuándo. El tablero
  -- pide siempre el día en curso: un domingo sin reservas devuelve vacío en
  -- vez de mostrar a los del sábado.
  fecha_operacion        date,

  -- `false` cuando una corrida exitosa del mismo día dejó de verlo entre los
  -- reservados. La fila no se borra: el equipo tiene que poder ver que alguien
  -- que estaba operando dejó de estarlo.
  activo                 boolean not null default true,

  primera_deteccion      timestamptz not null default now(),
  ultima_deteccion       timestamptz not null default now(),
  sincronizado_en        timestamptz not null default now(),
  sync_id                uuid references public.tracker_sincronizaciones (id)
);

create index if not exists tracker_drivers_dia_idx
  on public.tracker_drivers (fecha_operacion, activo);
create index if not exists tracker_drivers_sync_idx   on public.tracker_drivers (sync_id);

-- ---------------------------------------------------------------------------
-- Paquetes de las rutas del día
--
-- La clave es `id_viaje` —`Viaje.Id`— porque un paquete es el mismo paquete
-- aunque cambie de repartidor, de ruta o de orden. Justamente por eso el
-- upsert por `id_viaje` es lo que hace que una reasignación se vea como lo que
-- es: la misma fila que cambia de dueño, y no dos filas compitiendo.
--
-- `tracking_id` es el número que usa la operación para hablar del paquete y es
-- el mismo `Viaje.Id` en texto. Se guarda aparte porque en pantalla y en los
-- enlaces al operador se usa como cadena, y porque si algún día el sistema
-- expone un tracking propio distinto del id, esta es la columna que cambia.
--
-- `fecha_ruta` no está en la lista mínima pero hace falta: sin ella, «marcar
-- inactivos solamente los registros del día» no tiene cómo saber cuáles son
-- los del día, y una corrida de hoy terminaría desactivando lo de ayer.
-- ---------------------------------------------------------------------------
create table if not exists public.tracker_paquetes (
  id_viaje               bigint primary key,
  tracking_id            text not null,
  referencia_auxiliar    text,
  id_usuario             bigint,
  tienda                 text,

  -- Sale de `ReservaxMotoboy.IdMotoboy` a través de `Viaje.IdReserva`, que es
  -- la relación operativa. `id_motoboy_balanceado` es `Viaje.IdMotoboyBalanceado`
  -- y se guarda al lado, sin mezclarse: cuando los dos no coinciden hay un
  -- balanceo a medio aplicar, y eso se mira, no se promedia.
  id_motoboy             bigint,
  id_motoboy_balanceado  bigint,
  id_reserva             bigint,
  id_ruta                bigint,

  id_estado              integer,
  nombre_estado          text,

  -- `Viaje.Orden`. Puede venir nulo o repetido dentro de una misma ruta: el
  -- tablero no completa ninguna de las dos cosas, las muestra como están.
  orden                  integer,

  direccion              text,
  telefono               text,
  ciudad                 text,
  barrio                 text,
  codigo_postal          text,
  observacion_direccion  text,
  -- Se calcula desde Viaje.ObservacionDestino. Permite distinguir los
  -- destinos laborales sin inferirlo de la dirección o del polígono.
  es_laboral             boolean not null default false,
  poligono               text,
  nombre_recibe          text,
  comentario_motoboy     text,
  comentario_estado      text,
  motivo_no_entregado    text,
  motivo_no_devuelto     text,
  evidencia_foto         text,
  evidencia_tipo         text,
  fecha_evidencia        timestamptz,
  latitud_destino        double precision,
  longitud_destino       double precision,

  -- `Viaje.VisitadoMotoboy`, confirmado además contra `HistorialViaje`.
  visitado               boolean not null default false,
  fecha_visita           timestamptz,

  -- El resultado del cruce entre estado, visita y orden. Lo calcula la web y lo
  -- guarda n8n con el mismo criterio, para que la clasificación sea consultable
  -- desde la base y no solo mirando la pantalla.
  clasificacion          text not null default 'SIN_CLASIFICAR'
                           check (clasificacion in (
                             'PROXIMO', 'PENDIENTE_NO_VISITADO',
                             'VISITADO_ENTREGADO', 'VISITADO_NO_ENTREGADO',
                             'CANCELADO', 'RETIRADO_DE_RUTA', 'SIN_CLASIFICAR')),

  fecha_ruta             date,
  fecha_programado       timestamptz,
  fecha_programado_hasta timestamptz,
  fecha_cambio_estado    timestamptz,

  -- `false` cuando una corrida exitosa dejó de encontrarlo en las rutas del
  -- día. Entregados y no entregados siguen con `true` hasta que la ruta cierra:
  -- son el historial visible de la jornada, no ruido.
  activo_en_ruta         boolean not null default true,
  retirado_de_ruta_en    timestamptz,

  primera_deteccion      timestamptz not null default now(),
  ultima_deteccion       timestamptz not null default now(),
  sincronizado_en        timestamptz not null default now(),
  sync_id                uuid references public.tracker_sincronizaciones (id)
);

-- Toda lectura del tablero arranca por el día y sigue por el repartidor.
create index if not exists tracker_paquetes_dia_idx
  on public.tracker_paquetes (fecha_ruta, id_motoboy);
create index if not exists tracker_paquetes_motoboy_idx
  on public.tracker_paquetes (id_motoboy) where activo_en_ruta;
create index if not exists tracker_paquetes_sync_idx
  on public.tracker_paquetes (sync_id);

-- ---------------------------------------------------------------------------
-- Marcas de tiempo
--
-- Van en un trigger y no en el mapeo de n8n por dos motivos. El primero es que
-- `primera_deteccion` tiene que sobrevivir al upsert: es la hora en que se vio
-- al repartidor por primera vez en la jornada y un `on conflict do update` la
-- pisaría en cada corrida, dejándola siempre igual a la última. El segundo es
-- que así la invariante vale para cualquiera que escriba —n8n, una corrección
-- a mano, una migración futura— y no solo para el flujo que la respeta.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_marcas()
returns trigger
language plpgsql
as $$
begin
  new.ultima_deteccion := now();
  new.sincronizado_en  := now();

  if tg_op = 'UPDATE' then
    new.primera_deteccion := old.primera_deteccion;
  end if;

  -- `retirado_de_ruta_en` acompaña al booleano en vez de escribirse aparte. Un
  -- paquete que vuelve a la ruta —se reasigna, se reprograma— tiene que perder
  -- la marca de retiro, o quedaría a la vez activo y retirado.
  if tg_table_name = 'tracker_paquetes' then
    if new.activo_en_ruta then
      new.retirado_de_ruta_en := null;
    elsif tg_op = 'INSERT' or old.activo_en_ruta then
      new.retirado_de_ruta_en := now();
    else
      new.retirado_de_ruta_en := old.retirado_de_ruta_en;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tracker_drivers_marcas on public.tracker_drivers;
create trigger tracker_drivers_marcas
  before insert or update on public.tracker_drivers
  for each row execute function public.tracker_marcas();

drop trigger if exists tracker_paquetes_marcas on public.tracker_paquetes;
create trigger tracker_paquetes_marcas
  before insert or update on public.tracker_paquetes
  for each row execute function public.tracker_marcas();

-- ---------------------------------------------------------------------------
-- Vista de repartidores
--
-- `minutos_sin_actualizar` y `estado_posicion` se calculan al leer y no se
-- guardan. Una columna con los minutos quedaría vieja apenas se escribe: a los
-- cinco minutos de la corrida diría «hace 0 minutos» y el mapa mostraría en
-- verde a alguien que dejó de transmitir. Lo que se guarda es la hora; la
-- antigüedad es una cuenta contra el reloj de quien mira.
--
-- Los cortes son 10 y 45 minutos. El primero es cuánto tarda el dispositivo en
-- reportar de nuevo en condiciones normales; el segundo, a partir de cuándo la
-- operación deja de tratar el punto como la posición de alguien que se mueve.
--
-- `security_invoker = true` no es un detalle: sin eso la vista corre con los
-- permisos de quien la creó y le daría a `anon` una puerta de entrada a una
-- tabla que tiene RLS justamente para que nadie lea desde el navegador.
-- ---------------------------------------------------------------------------
create or replace view public.tracker_drivers_vista
with (security_invoker = true) as
select
  d.*,
  case
    when d.fecha_ultima_posicion is null then null
    else floor(extract(epoch from (now() - d.fecha_ultima_posicion)) / 60)::integer
  end as minutos_sin_actualizar,
  case
    when d.latitud is null or d.longitud is null      then 'SIN_POSICION'
    when d.fecha_ultima_posicion is null              then 'SIN_FECHA'
    when d.fecha_ultima_posicion > now() - interval '10 minutes' then 'RECIENTE'
    when d.fecha_ultima_posicion > now() - interval '45 minutes' then 'DEMORADA'
    else 'VIEJA'
  end as estado_posicion
from public.tracker_drivers d;

-- ---------------------------------------------------------------------------
-- Abrir una corrida
--
-- Devuelve el `sync_id` con el que la corrida va a marcar todo lo que vea.
-- Falla —y el flujo se corta antes de tocar nada— si ya hay otra del mismo
-- tipo en curso.
--
-- Antes de comprobar, vence las abandonadas. Una corrida que murió sin cerrar
-- dejaría el tipo bloqueado para siempre, y eso pasa más seguido de lo que
-- parece: alcanza con ejecutar el nodo «Abrir sincronización» suelto desde el
-- editor de n8n para crear una fila que nadie va a cerrar. Probar un flujo nodo
-- por nodo es lo normal, así que el diseño tiene que aguantarlo.
--
-- El timeout bajó de 15 a 10 minutos. La corrida de repartidores tarda unos
-- segundos —103 filas en dos— y la de paquetes está lejos de esa marca, así que
-- diez minutos siguen siendo holgados. No conviene bajarlo mucho más: el
-- timeout no interrumpe a la corrida vieja, solo deja que otra le saque el
-- lock, y dos corridas del mismo tipo a la vez es exactamente lo que esto
-- existe para evitar.
--
-- Cuando rechaza, el mensaje dice hace cuánto arrancó la otra y cuánto falta
-- para que se libere sola. «Ya hay una en curso» a secas no deja distinguir una
-- corrida de verdad de una fila zombi, que es lo único que uno quiere saber en
-- ese momento.
--
-- El lock de aviso serializa el vencimiento y la comprobación. El índice único
-- parcial es la garantía de verdad; esto es lo que hace que el segundo en
-- llegar reciba un mensaje que se entiende en vez de un choque de clave.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_abrir_sync(
  p_tipo            text,
  p_fecha_operacion date default null,
  p_timeout_minutos integer default 10
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_desde timestamptz;
  v_edad integer;
begin
  if p_tipo not in ('drivers', 'paquetes') then
    raise exception 'Tipo de sincronización desconocido: %', p_tipo;
  end if;

  perform pg_advisory_xact_lock(hashtext('tracker_sync_' || p_tipo));

  update public.tracker_sincronizaciones
     set estado        = 'failed',
         fecha_fin     = now(),
         mensaje_error = format('Vencida: pasó más de %s minutos sin cerrar.', p_timeout_minutos)
   where tipo = p_tipo
     and estado = 'running'
     and fecha_inicio < now() - make_interval(mins => p_timeout_minutos);

  select fecha_inicio into v_desde
    from public.tracker_sincronizaciones
   where tipo = p_tipo and estado = 'running'
   limit 1;

  if v_desde is not null then
    v_edad := floor(extract(epoch from (now() - v_desde)) / 60);
    /*
     * El mensaje se arma con `format()` y RAISE lo lanza entero con un solo
     * `%`. RAISE no entiende `%L` ni `%s`: para él todo `%` es «acá va el
     * siguiente argumento», así que un `%L` dejaría una L suelta pegada al
     * texto y correría el resto de los valores un lugar.
     */
    raise exception '%', format(
      'Ya hay una sincronización de %s en curso, empezada hace %s min. '
      'Se libera sola en %s min, o a mano con: select public.tracker_liberar_lock(%L);',
      p_tipo, v_edad, greatest(p_timeout_minutos - v_edad, 0), p_tipo)
      using errcode = 'lock_not_available';
  end if;

  insert into public.tracker_sincronizaciones (tipo, estado, fecha_operacion)
       values (p_tipo, 'running', p_fecha_operacion)
    returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liberar el lock a mano
--
-- La salida de emergencia para cuando quedó una corrida abierta que se sabe
-- muerta. El caso típico no es una falla rara: es haber ejecutado el nodo
-- «Abrir sincronización» suelto desde el editor de n8n, que crea la fila sin
-- que nada aguas abajo la cierre.
--
-- Marca la corrida como fallida —no la borra— así queda el registro de que
-- alguien la cortó y por qué. No toca ni un repartidor ni un paquete: una
-- corrida abierta todavía no desactivó nada, porque eso pasa recién al cerrar.
--
-- Devuelve cuántas liberó, que normalmente es una o ninguna.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_liberar_lock(p_tipo text)
returns integer
language plpgsql
as $$
declare
  v_liberadas integer;
begin
  update public.tracker_sincronizaciones
     set estado        = 'failed',
         fecha_fin     = now(),
         mensaje_error = 'Liberada a mano: la corrida quedó abierta sin cerrarse.'
   where tipo = p_tipo
     and estado = 'running';

  get diagnostics v_liberadas = row_count;
  return v_liberadas;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cerrar una corrida
--
-- Desactiva lo que la corrida no vio y marca la ejecución como exitosa, todo
-- en la misma transacción: si la desactivación falla, la corrida no queda
-- contada como buena.
--
-- Las dos funciones cuentan solas en vez de recibir los totales. Antes se les
-- pasaba `leidos` desde n8n, y eso obligaba al nodo que cierra a ir a buscar
-- el dato a un nodo lejano del flujo con `$('...')`. Esa lectura cruzada es
-- frágil -si la cadena de items se corta, n8n dice que el nodo «no se
-- ejecutó» y se lleva puesta la corrida- y además el número que mandaba n8n
-- era lo que había leído, no lo que había quedado escrito. Contar acá es más
-- corto y más cierto.
--
-- `omitidos` son las filas que se guardaron sin coordenadas utilizables:
-- cuentan en la jornada pero no se pueden dibujar. Que el número esté a la
-- vista es lo que hace que alguien note que faltan puntos en el mapa en vez de
-- suponer que hay menos paradas.
--
-- No desactivan nada si la corrida no escribió ninguna fila. Una consulta que
-- devuelve cero es indistinguible de una que no llegó a correr, y quedarse con
-- la última foto válida es lo único que no puede vaciar el mapa por un
-- problema de red.
--
-- Devuelven columnas planas -y no el tipo de la tabla- para poder sumar
-- `registros_omitidos` y `registros_con_error`, que no son columnas de
-- `tracker_sincronizaciones`. Así el último nodo del flujo devuelve el resumen
-- entero sin que haga falta un nodo extra que lo arme.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_cerrar_drivers(
  p_sync  uuid,
  p_fecha date
)
returns table (
  id                     uuid,
  tipo                   text,
  estado                 text,
  fecha_operacion        date,
  registros_leidos       integer,
  registros_insertados   integer,
  registros_actualizados integer,
  registros_desactivados integer,
  registros_omitidos     integer,
  registros_con_error    integer,
  mensaje_error          text
)
language plpgsql
as $$
declare
  v_leidos       integer;
  v_insertados   integer;
  v_actualizados integer;
  v_omitidos     integer;
  v_desactivados integer := 0;
begin
  select count(*),
         count(*) filter (where primera_deteccion = ultima_deteccion),
         count(*) filter (where primera_deteccion <> ultima_deteccion),
         count(*) filter (where latitud is null or longitud is null)
    into v_leidos, v_insertados, v_actualizados, v_omitidos
    from public.tracker_drivers
   where sync_id = p_sync;

  if v_leidos > 0 then
    update public.tracker_drivers
       set activo = false
     where activo
       and fecha_operacion = p_fecha
       and sync_id is distinct from p_sync;
    get diagnostics v_desactivados = row_count;
  end if;

  return query
  update public.tracker_sincronizaciones s
     set estado                 = 'success',
         fecha_fin              = now(),
         fecha_operacion        = coalesce(s.fecha_operacion, p_fecha),
         registros_leidos       = v_leidos,
         registros_insertados   = v_insertados,
         registros_actualizados = v_actualizados,
         registros_desactivados = v_desactivados
   where s.id = p_sync
  returning s.id, s.tipo, s.estado, s.fecha_operacion,
            s.registros_leidos, s.registros_insertados, s.registros_actualizados,
            s.registros_desactivados, v_omitidos, 0, s.mensaje_error;
end;
$$;

create or replace function public.tracker_cerrar_paquetes(
  p_sync  uuid,
  p_fecha date
)
returns table (
  id                     uuid,
  tipo                   text,
  estado                 text,
  fecha_operacion        date,
  registros_leidos       integer,
  registros_insertados   integer,
  registros_actualizados integer,
  registros_desactivados integer,
  registros_omitidos     integer,
  registros_con_error    integer,
  mensaje_error          text
)
language plpgsql
as $$
declare
  v_leidos       integer;
  v_insertados   integer;
  v_actualizados integer;
  v_omitidos     integer;
  v_desactivados integer := 0;
begin
  select count(*),
         count(*) filter (where primera_deteccion = ultima_deteccion),
         count(*) filter (where primera_deteccion <> ultima_deteccion),
         count(*) filter (where latitud_destino is null or longitud_destino is null)
    into v_leidos, v_insertados, v_actualizados, v_omitidos
    from public.tracker_paquetes
   where sync_id = p_sync;

  /*
   * La desactivación va acotada a `fecha_ruta`: lo que salió de la ruta de hoy
   * no dice nada de la de ayer, y sin ese filtro cada corrida borraría la
   * jornada anterior.
   *
   * Un paquete desactivado conserva estado, clasificación y destino. Sale del
   * mapa por defecto pero sigue siendo consultable: «este paquete estaba y
   * dejó de estar» es exactamente lo que hay que poder reconstruir cuando
   * alguien pregunta por un pedido que no llegó.
   */
  if v_leidos > 0 then
    update public.tracker_paquetes
       set activo_en_ruta = false
     where activo_en_ruta
       and fecha_ruta = p_fecha
       and sync_id is distinct from p_sync;
    get diagnostics v_desactivados = row_count;
  end if;

  return query
  update public.tracker_sincronizaciones s
     set estado                 = 'success',
         fecha_fin              = now(),
         fecha_operacion        = coalesce(s.fecha_operacion, p_fecha),
         registros_leidos       = v_leidos,
         registros_insertados   = v_insertados,
         registros_actualizados = v_actualizados,
         registros_desactivados = v_desactivados
   where s.id = p_sync
  returning s.id, s.tipo, s.estado, s.fecha_operacion,
            s.registros_leidos, s.registros_insertados, s.registros_actualizados,
            s.registros_desactivados, v_omitidos, 0, s.mensaje_error;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcar una corrida como fallida
--
-- La llama la rama de error de n8n. No toca ni una fila de datos: ese es todo
-- el punto. Una corrida fallida deja el mapa con lo último que se supo, que es
-- viejo pero cierto, en vez de con una foto incompleta que parece nueva.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_fallar_sync(
  p_sync    uuid,
  p_mensaje text
)
returns public.tracker_sincronizaciones
language plpgsql
as $$
declare
  v_fila public.tracker_sincronizaciones;
begin
  update public.tracker_sincronizaciones
     set estado        = 'failed',
         fecha_fin     = now(),
         -- Recortado: el mensaje de un driver de base puede traer la consulta
         -- entera, y de ahí a guardar un domicilio en la tabla de ejecuciones
         -- hay un paso.
         mensaje_error = left(coalesce(p_mensaje, 'Error sin detalle.'), 500)
   where id = p_sync
     and estado = 'running'
  returning * into v_fila;

  return v_fila;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceso
--
-- Igual que el resto del proyecto: RLS prendido y sin políticas. Nadie lee ni
-- escribe con la anon key; el navegador nunca habla con estas tablas. La web
-- las lee desde el servidor con la service key y n8n escribe con la credencial
-- Postgres, y lo que protege los domicilios es el login del tablero.
--
-- Las funciones quedan sin `security definer` a propósito: quien las llama es
-- la credencial de servicio, que ya puede escribir. Con `definer` serían un
-- camino para que un rol sin permisos desactivara la jornada entera.
-- ---------------------------------------------------------------------------
alter table public.tracker_drivers          enable row level security;
alter table public.tracker_paquetes         enable row level security;
alter table public.tracker_sincronizaciones enable row level security;

-- De `public` y no solo de `anon`: PostgreSQL le concede EXECUTE a PUBLIC en
-- cada función nueva, así que revocar rol por rol deja la puerta abierta para
-- el que se cree mañana.
revoke all on function public.tracker_abrir_sync(text, date, integer)      from public;
revoke all on function public.tracker_liberar_lock(text)                   from public;
revoke all on function public.tracker_cerrar_drivers(uuid, date)           from public;
revoke all on function public.tracker_cerrar_paquetes(uuid, date)          from public;
revoke all on function public.tracker_fallar_sync(uuid, text)              from public;
