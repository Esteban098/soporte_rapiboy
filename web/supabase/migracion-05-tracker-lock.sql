-- ---------------------------------------------------------------------------
-- Live tracker · lock de sincronización y cierre sin lecturas cruzadas
--
-- Para bases que ya corrieron `live-tracker.sql`. Solo toca funciones: no
-- modifica ni una tabla, ni una columna, ni una fila de datos.
--
-- Qué cambia y por qué:
--
--   * El timeout del lock baja de 15 a 10 minutos, y el rechazo pasa a decir
--     hace cuánto arrancó la otra corrida y cuánto falta para que se libere
--     sola. «Ya hay una en curso» a secas no deja distinguir una corrida de
--     verdad de una fila zombi.
--
--   * Aparece `tracker_liberar_lock(tipo)`, la salida de emergencia. El caso
--     típico es haber ejecutado el nodo «Abrir sincronización» suelto desde el
--     editor de n8n, que crea la fila sin que nada aguas abajo la cierre.
--
--   * Las dos funciones de cierre dejan de recibir `p_leidos` y cuentan solas
--     las filas que quedaron con su `sync_id`. Antes ese total se lo pasaba
--     n8n, y para conseguirlo el nodo que cierra tenía que ir a buscar el dato
--     a un nodo lejano del flujo con `$('...')`. Esa lectura cruzada rompía el
--     flujo de paquetes: cuando la cadena de items se corta, n8n responde que
--     el nodo «no se ejecutó» y se lleva puesta la corrida. Contando acá, el
--     nodo solo necesita lo que tiene en su propia entrada.
--
--   * Además devuelven `registros_omitidos` -las filas guardadas sin
--     coordenadas utilizables- y `registros_con_error`, así el último nodo del
--     flujo ya trae el resumen entero y no hace falta un nodo extra que lo
--     arme.
--
-- Correr una vez en el SQL Editor de Supabase, junto con la reimportación de
-- `n8n/08-tracker-drivers.json` y `n8n/09-tracker-paquetes.json`. Los flujos
-- viejos llaman a las funciones con tres argumentos y esta migración deja esa
-- versión sin efecto, así que las dos cosas van juntas.
--
-- Para volver atrás: correr de nuevo `live-tracker.sql`, que trae exactamente
-- estas mismas definiciones. Para dejar la base como antes de todo el tracker,
-- `drop function` de las cinco y `drop table` de las tres `tracker_*`.
-- ---------------------------------------------------------------------------

begin;

/*
 * El drop va primero y es imprescindible.
 *
 * `create or replace` no reemplaza una función cuya firma cambió: crea una
 * sobrecarga nueva al lado de la vieja. Las dos convivirían, y una llamada con
 * tres argumentos seguiría entrando por la versión anterior -la que espera que
 * n8n le pase el total- sin que nada avise. Además PostgreSQL rechaza un
 * `replace` que cambie el tipo de retorno, y acá cambió.
 */
drop function if exists public.tracker_cerrar_drivers(uuid, date, integer);
drop function if exists public.tracker_cerrar_paquetes(uuid, date, integer);

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

-- Igual que el resto: de `public` y no rol por rol, porque PostgreSQL le
-- concede EXECUTE a PUBLIC en cada función nueva.
revoke all on function public.tracker_abrir_sync(text, date, integer) from public;
revoke all on function public.tracker_liberar_lock(text)              from public;
revoke all on function public.tracker_cerrar_drivers(uuid, date)      from public;
revoke all on function public.tracker_cerrar_paquetes(uuid, date)     from public;

commit;
