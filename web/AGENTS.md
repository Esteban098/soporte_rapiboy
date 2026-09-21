<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tablero de soporte Rapiboy

## Modelo de datos

- `mensual` y `cancelados` son tablas operativas. Del día 1 al 9 contienen el
  mes anterior y el actual; desde el día 10 deben contener solamente el actual.
- `mensual_historico` y `cancelados_historico` acumulan los períodos cerrados.
  La web los muestra por mes y permite actualizar el rango elegido con
  `desde` / `hasta`.
- `ayer` es la cola de lo nuevo de una jornada. Se reconstruye en cada ingesta
  y solo entra un caso si su ID no está en `mensual` ni en `cancelados` —ni en
  sus históricas—. La misma corrida lo inserta en `mensual` y en `ayer`, así que
  todo ID de `ayer` está también en `mensual`; lo que no puede pasar es que
  aparezca en `ayer` un caso que ya venía de días anteriores.
- La separación física se instala con `supabase/historico.sql`. La función
  copia antes de borrar, corre dentro de una transacción y es idempotente.
- El mes de pedidos se determina con
  `coalesce(fecha_creacion, fecha_programado)`; el de cancelados, con
  `fecha_colectado`. Los cortes de calendario usan `America/Mexico_City`.
- `Siniestrados` y `Siniestrados Historial` filtran el estado actual
  `Siniestrado` sobre `mensual` y `mensual_historico`, respectivamente. No
  duplicar tablas ni modificar los criterios de ingreso de los workflows.
- `valor_producto` es `numeric(18, 2)` y viene de
  `Viaje.ValorDeclaradoCompleto`. Lo cargan los flujos 01, 02 y 04 y lo conserva
  la rotación. Un importe desconocido es `null`, no cero. Para bases existentes
  instalar `supabase/migracion-02-valor-producto.sql` antes de importar los flujos.
- `valor_70` se genera en Postgres con `round(valor_producto * 0.70, 2)`.
  `cobrado` es booleano, empieza en `false` y solo lo modifica el equipo desde
  las vistas de Siniestrados. Ambos viven en Mensual e Histórico, sin nuevas
  tablas. Instalar `supabase/migracion-03-cobros-siniestrados.sql` para agregarlos.
- `seguimiento` usa solamente los estados `abierto` y `cerrado` en la columna
  `estado`; cualquier `tomado` legado ahí se migra a abierto. **Tomado** es
  `tomado_por` / `tomado_en` sobre un reporte abierto: cuenta como abierto en
  totales y tiempo de resolución, se toma y suelta con un PATCH condicional
  (solo quien lo tomó o un admin lo suelta) y se limpia al reabrir. El tablero
  lo muestra como una tercera columna de tarjetas y agrupa por semana o mes.
  Instalar `supabase/migracion-11-seguimiento-tomado.sql`.
  Los comentarios aceptan menciones `@alias` —la parte local del correo en
  minúsculas, `src/lib/menciones.ts`, compartido por servidor y navegador—.
  Al crear un reporte se notifica a cada mencionado; al editarlo, solo a las
  menciones nuevas; nunca a quien escribe. Los alias repetidos entre dominios
  quedan fuera del directorio. Los avisos van a `notificaciones`
  (`supabase/migracion-12-notificaciones.sql`), se leen sin caché filtrando por
  el correo de la sesión, y un fallo al notificar nunca hace fallar el
  guardado del reporte. La campana está en la barra, junto al selector de tema.
  Cada reporte conserva `driver` y `seller`
  como foto del pedido al momento del alta; se pueden cargar manualmente y, si
  quedan vacíos, se buscan en Mensual o Histórico. `abierto_en` se reinicia al
  reabrir y el tiempo de resolución es la diferencia hasta `atendido_en`.
  Instalar `supabase/migracion-04-seguimiento-semanal.sql` en bases existentes.
- El **live tracker** vive en cuatro tablas propias —`tracker_drivers`,
  `tracker_paquetes`, `tracker_sincronizaciones`, `tracker_demoras`— y no toca ninguna de las
  anteriores. Es la foto de la jornada en curso, no un histórico: la clave de
  repartidores es `id_motoboy` y la de paquetes `id_viaje`, así que una
  reasignación mueve la fila en vez de duplicarla. Se instala con
  `supabase/live-tracker.sql`.
- `tracker_drivers.fecha_operacion` y `tracker_paquetes.fecha_ruta` acotan cada
  jornada y permiten leer la anterior sin mezclarla con hoy. `diaDeOperacion()`
  resuelve hoy con `America/Mexico_City`; `diaDePaquetes()` muestra la última
  jornada operativa antes de las 15:00 —los lunes salta al sábado— y hoy desde
  esa hora. En la vista anterior se filtran los paquetes
  inactivos y los entregados. Las posiciones se leen como la última foto de
  cada repartidor visible y no retroceden junto con la fecha de la ruta. Los
  días viajan como texto a n8n porque la web, n8n y SQL Server pueden estar en
  zonas distintas. Nunca restar horas a mano.
- `minutos_sin_actualizar`, `minutos_sin_movimiento` y `estado_posicion` **no se guardan**: los calcula
  la vista `tracker_drivers_vista` al leer, y el navegador los vuelve a
  calcular contra su propio reloj. Una antigüedad guardada envejece mal —diría
  «hace 2 minutos» para siempre— y pintaría de verde a un teléfono apagado.
  Sí se guarda `ultima_movimiento_en`: el trigger la cambia solo cuando la
  coordenada se desplazó al menos 50 metros, para absorber el ruido del GPS.
- En los flujos del tracker, **ningún nodo lee a través del grafo**: nada de
  `$('Otro nodo')` dentro de `{{ }}`. Esa lectura se rompe sola cuando se corta
  la cadena de items y n8n la reporta como «el nodo no se ejecutó», culpando a
  un nodo que no tiene nada que ver. Lo que hace falta aguas abajo se arrastra
  en los datos. Solo se permite en un Code node, con `try/catch`.
- Las funciones de cierre cuentan solas las filas de su `sync_id` en vez de
  recibir el total desde n8n, justamente para que el nodo que cierra no tenga
  que ir a buscarlo a otro lado.
- El lock de sincronización es por tipo y vence a los 10 minutos.
  `tracker_liberar_lock(tipo)` es la salida de emergencia; su caso típico es
  haber ejecutado el nodo «Abrir sincronización» suelto desde el editor de n8n,
  que crea la fila sin que nada la cierre. Instalar
  `supabase/migracion-05-tracker-lock.sql` en bases que ya corrieron el script.
- Ninguna sincronización del tracker desactiva nada si leyó cero filas, y una
  corrida fallida no desactiva nunca. Una consulta que devuelve cero es
  indistinguible de una que no llegó a correr, y vaciar el mapa por eso es peor
  que quedarse con la última foto válida.
- La clasificación de paquetes sale del **nombre** del estado
  (`EstadoViaje.NombreCompleto`), nunca de una lista de `IdEstado`. Los ids
  verificados del proyecto son 22, 24 y los del filtro de fallidos; el resto
  sería adivinado. El vocabulario es el de `src/lib/estados.ts` y está escrito
  dos veces —en la web y en el nodo Code del flujo 09—, así que
  `npm run test:tracker` compara las dos implementaciones sobre todas las
  combinaciones para que no se separen en silencio.
- `SIN_CLASIFICAR` es una categoría interna para los cálculos, no una etiqueta
  operativa. En la tarjeta y el detalle de cada paquete se muestra y se agrupa
  por `EstadoViaje.NombreCompleto`; si el nombre falta, se indica «Estado no
  informado».

## Límites entre flujos

- Los workflows 01 y 02 trabajan únicamente sobre las tablas operativas.
- Los workflows 04 y 05 leen y escriben únicamente las tablas históricas y
  respetan el período seleccionado en el tablero.
- No cambiar `fecha_creacion` ni `fecha_colectado` en un refresco histórico:
  esas columnas fijan el mes al que pertenece cada fila.
- Los upserts automáticos nunca deben pisar `reclamo_tienda`, `ubicacion`,
  `telefono`, `aviso`, `avisado_en`, `foto`, `editado_por`, `editado_en` ni `cobrado`.
- La rotación copia `cobrado` y bloquea las filas que archiva para conservar
  ediciones concurrentes. Nunca insertar `valor_70`: es una columna generada.
- En n8n, mapear únicamente `valor_producto`; no seleccionar ni enviar
  `valor_70` en los nodos Postgres aunque aparezca entre las columnas disponibles.
- `ayer` se vacía solamente dentro de la ingesta diaria y después de confirmar
  que hubo jornada. Una limpieza manual es puntual y no se incorpora al flujo.
- Los flujos 08 y 09 escriben **solo** las tablas `tracker_*` y leen SQL Server
  en modo lectura. No comparten tablas con ningún otro flujo, así que se pueden
  importar, apagar o rehacer sin mirar el resto.
- El live tracker tiene **un solo botón, Actualizar**: corre la sincronización
  de paquetes y después la de posiciones —en ese orden, para que un
  repartidor recién sumado salga con posición en la misma pasada—, sigue con
  la segunda aunque la primera falle y relee la jornada una vez al final. Los
  dos endpoints siguen separados.
- La sincronización de paquetes hace una **reconciliación completa del día**, no un
  refresco de lo guardado. La consulta del flujo 09 no lleva ningún
  `WHERE V.Id IN (...)`: el universo lo definen las reservas del día. Es lo
  único que hace que un paquete agregado a media mañana aparezca solo, y hay
  una prueba que falla si alguien vuelve a meter la lista de ids.
- Los endpoints de sincronización del tracker no escriben en Supabase. Quien
  escribe posiciones y paquetes es n8n, con su credencial y dentro de su
  transacción; la web dispara y vuelve a leer. La única escritura directa es
  el motivo humano confirmado en `tracker_demoras`, separado de las fotos que
  cuentan los `sync_id`.

## Trabajo seguro

- La base se accede desde el servidor con `service_role`; esa clave no puede
  llegar a componentes de cliente, logs ni archivos versionados.
- Antes de borrar o mover datos en Supabase, contar las filas objetivo y
  verificar su destino. Después, comprobar cantidades e intersecciones.
- No truncar tablas ni cambiar workflows activos salvo pedido explícito.
- El rol `comercial` ve solo `/tiendas`, `/colectas` y `/colectas/historial`.
  La regla vive una sola vez en `src/lib/permisos.ts` y la aplican el proxy,
  el menú y las acciones. `operadorActual()` y `usuarioActual()` devuelven
  `null` para un comercial, así que toda acción o endpoint nuevo queda cerrado
  para él por defecto; `sesionActual()` lo incluye y se usa solo donde
  corresponde (guardar tiendas, refrescar colectas). Una pantalla nueva que
  deba verla un comercial se agrega a `RUTAS_COMERCIAL`.
- Los JSON de `../n8n/` son exportaciones importables. Conservar credenciales,
  conexiones, expresiones y columnas protegidas al modificarlos.
- Para una publicación compatible: correr primero las migraciones aditivas,
  desplegar la web y luego importar los workflows actualizados. El código viejo
  ignora columnas nuevas; el código nuevo no puede escribir columnas ausentes.

## Validación

Desde `web/` ejecutar como mínimo:

```bash
npm run typecheck
npm run lint
npm run test:siniestrados
npm run test:cobros
npm run test:seguimiento
npm run test:tracker
npm run test:tiendas
npm run test:responsables
npm run test:permisos
npm run test:lluvia
npm run test:trafico
```

Además, validar los workflows con `jq empty ../n8n/*.json`. El build no sale a
la red: la tipografía son archivos locales en `src/app/fonts/` cargados con
`next/font/local`, y el polígono de cobertura es `src/lib/cobertura.json`,
versionado y generado a mano con `scripts/cobertura.mts`.

## Live tracker

- El universo de paquetes se acota con `Usuario.IdModalidad = 5` y
  `Usuario.IdLocalidad = 9`, igual que el resto del tablero, para que los
  totales sean comparables entre pantallas.
- La fuente de la posición es `dbo.Motoboy.Latitud` / `.Longitud`, y se muestra
  siempre como «última posición conocida». `Viaje.LatitudDestino` es a dónde va
  el paquete, no dónde está la persona: hay una prueba que falla si esa columna
  aparece en la consulta de repartidores.
- El repartidor de un paquete sale de la reserva
  (`Viaje.IdReserva` → `ReservaxMotoboy.IdMotoboy`).
  `Viaje.IdMotoboyBalanceado` se guarda al lado, sin combinarse: cuando los dos
  no coinciden hay un balanceo a medio aplicar, y eso se mira.
- `ReservaxMotoboy` **no** expone `IdRuta` —está probado, ver `colectas.sql`—
  así que la ruta del repartidor se deriva de `Viaje.IdRuta` de sus paquetes.
- La ficha de un paquete se sincroniza desde RapiboyData, nunca desde
  `mensual`: `Viaje` aporta el estado, destinatario y comentarios; `Direccion`
  aporta teléfono y domicilio; `Poligono.Nombre` aporta el polígono; y
  `FotoViaje`, `HistorialViaje` y `Viaje.Foto` aportan la evidencia. n8n deja
  esa instantánea en `tracker_paquetes` para que el mapa no haga consultas por
  paquete. La prioridad de la foto es FotoViaje, historial y foto del viaje.
- `PROXIMO` es el pendiente de menor `Viaje.Orden`, y solo si ese orden alcanza
  para decidirlo. Con el mínimo empatado, o sin ningún pendiente con orden, no
  hay próximo y la pantalla dice por qué. No completar la secuencia es
  deliberado: el equipo leería un orden inventado como un dato del sistema.
- El mapa reutiliza la proyección y los polígonos de Cobertura. No hay librería
  de mapas: las únicas teselas son las de las capas opcionales, así que la
  pantalla no le pide nada a ningún servidor externo mientras lluvia, calles y
  tráfico estén apagadas. `proyectarEn()` y `proyectar()` tienen que dar el
  mismo resultado o los marcadores quedan corridos respecto del fondo; hay una
  prueba que lo compara.
- La **capa de lluvia** es radar de RainViewer (`src/lib/lluvia.ts`,
  `src/components/Lluvia.tsx`) y sale a internet, igual que las capas de
  TomTom. Va apagada por default y no pide nada hasta que se la prende: con
  la capa apagada, o con RainViewer caído, la pantalla es la de siempre. La API
  es pública y sin clave; pide atribución visible, que va debajo del control.
  Las teselas son Web Mercator y el mapa no lo es: en longitud las dos
  proyecciones coinciden exacto y en latitud queda un corrimiento máximo de
  352 m sobre esta ventana, menos que los 572 m que mide un píxel del radar.
  Hay una prueba que falla si crece. Para una ventana de varios grados de alto
  no alcanzaría: habría que partir cada tesela en franjas. El zoom del mosaico es fijo y está topeado en 7: arriba de
  ese zoom la API pública no da error, da una imagen gris que dice «Zoom Level
  Not Supported» y quedaría pegada sobre la ciudad. Por eso las teselas se
  piden de 512 px y la capa va con un desenfoque suave. Los cuadros se
  precargan antes de animar para que el primer ciclo no parpadee.
- Las capas de **calles y tráfico** son de TomTom (`src/lib/trafico.ts`,
  `src/components/Trafico.tsx`). Sin `TOMTOM_API_KEY` no aparecen; con clave,
  arrancan apagadas. A diferencia de la lluvia, **el zoom sigue al encuadre**:
  a zoom de calle, cubrir la ciudad entera con un zoom fijo serían cientos de
  teselas pagas, y atando el zoom a los píxeles de la pantalla quedan en unas
  dieciséis (`MAX_TESELAS` = 30 es el tope). Las calles van debajo de las zonas —que pasan a contorno, y
  al pasar el mouse se marcan con tinte translúcido y trazo grueso, nunca con
  el relleno opaco del hover general— y el
  tráfico encima de la lluvia, con `pointerEvents="none"` para no tapar los
  clics. Cada tesela se ubica por sus esquinas como el radar: el corrimiento
  queda siempre por debajo de medio píxel de imagen —38 m a zoom 9, con la
  ciudad entera en pantalla y píxeles de 144 m— y desde zoom 12 es de menos de
  un metro. Una prueba lo mide. TomTom manda las
  teselas con `no-store`, así que refrescar el tráfico es volver a montarlas:
  el ciclo de 2 minutos va en la clave de React. La clave de TomTom no es
  secreta —viaja en la URL de cada tesela—; va restringida por dominio y hay
  que mostrar «© TomTom» mientras las capas estén prendidas.

- Los marcadores se dibujan en píxeles, midiendo la caja del SVG con un
  `ResizeObserver`. Escalarlos con el `viewBox` los volvería gigantes al
  acercar e invisibles al alejar.
- El color del marcador dice el **estado** del paquete: verde entregado, rojo
  no entregado, verde azulado devuelto y amarillo retirado. Los destinos
  laborales reemplazan el glifo interior por un maletín sin cambiar el color.
  El aro dice de **quién** es. Lo que todavía no tiene desenlace se pinta del
  color del repartidor y va hueco: lleno es «resuelto», hueco es «falta».
- El pin del repartidor es negro (`--ink`, para que no desaparezca en tema
  oscuro). Su color de identidad queda en el aro y en la línea del recorrido.
- El identificador visible de un paquete es `id_viaje` (`Viaje.Id`), y también
  es el valor del enlace a `rapiboy.com/Operador?modalidad=5&idviaje=`. El
  `tracking_id` (`ReferenciaExterna`) se conserva para trazabilidad. La fila
  no es un botón con el enlace adentro —sería HTML inválido—: el botón va
  estirado por detrás y el enlace por encima.
- El buscador enfoca automáticamente un paquete solo cuando hay una
  coincidencia única, o cuando `id_viaje` coincide exactamente. En ese caso
  selecciona a su repartidor, resalta también paquetes fuera de ruta y centra
  el mapa en `LatitudDestino` / `LongitudDestino`, sin abrir el modal mientras
  se escribe; nunca elige arbitrariamente entre varias coincidencias.
- Entre las 15:00 y las 00:00 de México, un driver con paquetes `PROXIMO` o
  `PENDIENTE_NO_VISITADO` queda demorado tras 30 minutos sin desplazarse al
  menos 50 metros, y solo después de visitar su primera parada
  (`realizoPrimeraParada()`): la de menor `Viaje.Orden` o, si el mínimo está
  empatado, todas las empatadas —elegir una sería inventar la salida real—.
  Sin ningún paquete con orden no hay demora. La fila conserva el contorno rojo aunque se informe el
  inconveniente; el registro solo silencia los avisos. La alerta se puede
  recordar 10 minutos y solo acepta un motivo si el usuario confirma que el
  driver no continuará la ruta. No usarla para pausas normales.
- La pestaña **Estadísticas** lee la jornada operativa anterior a la del mapa
  (`diaOperativoAnterior(diaDePaquetes())`), no la que está en curso: es un
  resumen cerrado y comparable. Calcula todo en el navegador sobre
  `tracker_paquetes`, sin tablas ni flujos nuevos.
- La **ruta propuesta** sale siempre de la bodega (`BODEGA` en `lib/tracker.ts`)
  y encadena la parada más cercana a la anterior. Es vecino más cercano puro y
  tiene que seguir siéndolo: hay una prueba de propiedad que falla si alguien
  cuela un optimizador. No pisa `Viaje.Orden` ni cambia cuál es el próximo
  destino, y arranca apagada.
- La bodega está duplicada a propósito: constante en el código —de ella depende
  un cálculo y no puede quedarse sin origen— y fila en `tracker_tiendas`. Una
  prueba compara las dos.
- El id del repartidor es `Motoboy.Id`, no `ReservaxMotoboy.IdMotoboy`: es el
  número que el mapa de choferes lleva en el nombre de cada punto.
- **Tiendas es una pantalla aparte** (`/tiendas`) y no parte del tracker. Se
  pidió así expresamente. El tracker no lee `tracker_tiendas` ni dibuja
  comercios; solo conserva `Viaje.IdUsuario` y `Usuario.Alias` como contexto
  del paquete en su ficha.
- En sentido contrario, el mapa de Tiendas **sí** ofrece las capas de lluvia,
  calles y tráfico —los mismos componentes del tracker— y la última posición
  de los repartidores. Todo arranca apagado. Las posiciones salen de
  `leerPosiciones()` (`src/lib/posiciones-datos.ts`), que devuelve solo
  nombre, coordenadas y fecha: nunca domicilio ni paquetes. **El rol comercial
  no las recibe**: está afuera del live tracker a propósito, así que la página
  ni las lee para él, en vez de solo esconder la casilla. Si se decide
  mostrárselas, el cambio es `puedeVerPosiciones` en la página de Tiendas.
- Las casillas de calles y tráfico son `ControlesTomTom`, compartidas: la
  atribución «© TomTom» es condición de uso y vive en un solo lugar.
- En los dos mapas las casillas de capas van en `.barraMapa`, una fila arriba
  del mapa alineada a la derecha, y no en el `<aside>`: el panel es para elegir
  qué mirar. El control del radar y `AtribucionTomTom` van en
  `.barraMapaDetalle`, debajo, y solo existen con esas capas prendidas, para
  que prender una no corra las casillas. Las etiquetas son cortas a propósito
  para que la fila del tracker entre en una línea a 1400 px.
- Una tabla de referencia que falta se **anota y se avisa** (`tablasFaltantes`),
  no se traga con un `catch`. «No corriste la migración» y «esta persona no
  tiene domicilio» son respuestas distintas y la pantalla tiene que decir cuál.
- `tracker_tiendas` y `tracker_choferes` son de referencia: las genera
  `npx tsx scripts/lugares.mts` desde los KMZ de `datos/` y no las escribe
  ningún flujo. `id_tienda` **no** es único (#55004 tiene dos sucursales) y la
  pantalla lo marca en vez de elegir uno.
- `tiendas_responsables` dice de quién es cada comercio (Grupo A
  `esteban@rapiboy.com`, Grupo B `candelaria@rapiboy.com`) y decide su color en
  todo el tablero. Se cruza **por nombre** con `claveTienda()` más `alias`,
  porque `mensual` y `cancelados` no traen id de tienda. Una columna nueva que
  muestre un comercio va con `tipo: "tienda"` en `Tabla`, o con `NombreTienda`
  fuera de una tabla; no pintar tiendas con colores propios. El índice se lee
  una vez en el layout y nunca tira: sin la tabla, el tablero se ve sin colores.
  La edita la web (`src/app/responsables.ts`) y no la escribe ningún flujo.
- El encuadre movible y el fondo de cobertura los pone `LienzoMapa`, compartido
  entre el tracker y tiendas. Tiene tres sutilezas ya resueltas —la escala real
  en píxeles medida con `ResizeObserver`, el foco de la rueda y el re-encuadre
  durante el render—: no reimplementarlas por separado.
- El domicilio de un repartidor es dato sensible: sale del servidor solo dentro
  del repartidor que se está mirando, nunca como tabla completa.
- El color de cada repartidor sale de su `id`, no de su posición en la lista:
  si dependiera del orden, alguien que entra a la jornada le correría el color
  a todos los demás. La paleta está ordenada para que ids corridos —lo normal—
  caigan en tonos que contrastan.

## Cobertura

- La fuente es `datos/poligonos-v10-bfv.kmz`. No editar `src/lib/cobertura.json`
  a mano: se regenera con `npx tsx scripts/cobertura.mts`.
- Solo se usan las carpetas `ZONA 1` y `ZONA 2` (`ZONAS` en el script). Las
  capas por código postal y la `Capa sin título` quedan afuera: nombran por CP y
  no por área de reparto, así que no se pueden comparar con la columna
  `poligono` de un pedido. No volver a incluirlas sin pedido explícito.
- Los polígonos se pisan en los bordes, así que `ubicarPunto()` devuelve todos
  los que cubren el punto. No reducirlo a uno: la prioridad no está declarada.
- `contorno` es el detalle completo y es lo único que puede decidir si un
  domicilio entra. `trazo` está simplificado y sirve solo para dibujar.
- Un polígono puede traer huecos —recortes internos sin servicio—. Este KMZ no
  tiene, una versión anterior sí. Toda verificación tiene que descontarlos.
- Geocodificar una dirección le manda una dirección de cliente a Nominatim
  (OpenStreetMap). Por eso sale del servidor y no del navegador, pide sesión y
  se cachea. Su política admite 1 consulta por segundo: no llamarlo en bucle ni
  por fila de una tabla.
