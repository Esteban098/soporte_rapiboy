# Tablero de Operación · México

Web con los tableros de entregas fallidas, demoras y cancelaciones. Los casos
salen de dos tablas de Supabase que n8n rearma todos los días: la app las lee,
calcula las métricas y las muestra. No hay que cargar nada dos veces.

## Cómo está armado

```
n8n  ──►  Supabase   ──►  servidor Next.js  ──►  navegador
          mensual         lee, normaliza,        solo agregados,
          *_historico     agrega y cachea        sin datos de clientes
          ayer
```

Tres decisiones que vale la pena tener presentes:

- **La base se lee solo desde el servidor.** La `service_role` key vive en una
  variable de entorno y nunca llega al navegador. Por eso el login protege de
  verdad: no hay forma de saltearlo pidiendo las filas por afuera.
- **La sección de reclamos muestra los datos que aporta la tienda.** El teléfono
  alterno y el link de ubicación se ven tal cual, porque son justamente lo que el
  equipo necesita para trabajar el caso. Es información del cliente, así que el
  login no es opcional: cualquiera con acceso al tablero los ve. El resto de las
  secciones sigue trabajando solo con agregados. Las páginas que muestran pedidos individuales lo hacen
  con id, estado, repartidor, comercio y zona: nada de datos del cliente.
- **`FechaProgramado` es la fecha del último cambio de estado, no una entrega
  comprometida.** Se pisa cada vez que el paquete se mueve: si no se entregó el
  20 y volvió a la tienda el 24, queda en el 24. Sirve para saber hace cuánto
  que un caso no se mueve, y **no** para medir anticipación ni cumplimiento de
  fecha: un caso devuelto siempre daría "tarde" porque la devolución ocurre
  después.
- **Un caso está cerrado cuando queda en Entregado, Devuelto o Siniestrado.** Es
  la misma regla que la columna `CASO` del libro, y el tablero la lee de ahí
  cuando está disponible. `Devolucion` **no** cierra: la devolución está en
  curso. Abiertos contra cerrados es la métrica principal del tablero.
- **Las columnas se leen por nombre de encabezado, no por posición.** Las
  pestañas no comparten esquema: en `Ayer` la columna 8 es `IDcoma`, mientras
  que en `Mensual` esa posición es `Visitas`. `src/lib/normalizar.ts` mapea cada
  campo por su nombre —con todos los alias que tuvo en el libro— y concentra
  también la conversión de fechas, que llegan en `M/D/AAAA` desde gviz.

## Secciones

| Ruta | Qué muestra |
|---|---|
| `/` | **Mes en curso**: abiertos contra cerrados —la métrica principal—, el desglose de estados, todos los casos de `Mensual`, las devoluciones por día de la semana y las visitas antes de cerrar. |
| `/operacion` | **Ayer**: los casos de la pestaña `Ayer`, lo que quedó sin cerrar la jornada anterior. |
| `/demorados` | **Demorados**: la cola de escalamiento, derivada de `Mensual`. Entra todo caso que lleve más de 2 días sin cambiar de estado y todavía no haya cerrado. |
| `/reclamos` | Casos donde la tienda aportó datos, con el dato tal cual y la información del viaje. Se filtra por avisado / no avisado. |
| `/cobertura` | **Cobertura · BETA**: el contorno donde hay servicio y un verificador puntual por dirección o coordenadas que responde si un domicilio entra. No busca por ID de viaje. |
| Asistente (beta) | Pestaña en todas las pantallas: preguntas en lenguaje natural sobre paquetes, casos, seguimiento, colectas y repartidores. Ver [Asistente](#asistente-beta). |
| `/live-tracker` | **Live tracker**: dónde está cada repartidor de la jornada y qué le queda por entregar. Panel de selección a la izquierda, mapa a la derecha. |
| `/tiendas` | **Ruta**: las **colectas de hoy** en vivo —se elige a qué repartidores ver y el mapa muestra solo esos, con el camino que ya hizo y las paradas que le faltan—. Ver [Tiendas](#tiendas). |
| `/sellers` | **Directorio · Sellers**: sellers activos, grupos de WhatsApp y distribución editable de tiendas. La tabla comienza reducida y se puede expandir. |
| `/drivers` | **Directorio · Drivers**: drivers activos y grupos de WhatsApp. La tabla comienza reducida y se puede expandir. |

Junto al indicador de la fuente («Base en vivo») hay un selector de tema:
**Claro**, **Oscuro** o **Sistema**. Las paletas están en `globals.css`; el
selector solo pone `data-theme` en `<html>`, y «Sistema» lo saca para que mande
`prefers-color-scheme`. La elección se guarda en `localStorage` —es del
navegador, no de la cuenta— y un script en `<head>` la aplica antes del primer
pintado para que no destelle el tema equivocado.

Al pie de la barra lateral, **Ocultar menú** la pliega a una columna de íconos
para ganar ancho —pensado sobre todo para el mapa—. Funciona igual que el tema:
pone `data-menu` en `<html>`, se recuerda en `localStorage` y un script en
`<head>` lo aplica antes de pintar. Plegada, cada sección se nombra con su
tooltip y todos los grupos quedan abiertos. El logo de la barra es el mismo
`src/app/icon.png` que Next sirve como ícono de la pestaña; el proxy lo deja
pasar sin sesión para que la pantalla de acceso también lo tenga.

La identidad visual parte de `--seed` en `globals.css`. Los roles `primary`,
`secondary`, `tertiary` y sus contenedores se derivan de esa semilla; los
componentes compartidos consumen esos roles y la escala tipográfica
`display`/`headline`/`title`/`body`/`label`. Para cambiar la marca se modifica
la semilla, conservando los estados operativos y sus contrastes.

## Live tracker

La jornada que corresponde al horario operativo: quiénes tienen una ruta
visible, dónde se los vio por última vez y qué paquetes lleva cada uno. Antes
de las 15:00 de México conserva la última ruta operativa y actualiza sus
estados sin cambiar su total: normalmente es la de ayer, pero los lunes toma
la del sábado porque el domingo no hay operación. Desde las 15:00 muestra la
ruta de hoy. Un repartidor que tenga posición o reserva pero ningún paquete
activo no aparece en esta pantalla.

Entre las 15:00 y las 00:00 de México, una fila recibe contorno rojo si el
driver lleva 30 minutos sin moverse, ya visitó su primera parada y todavía
tiene paquetes sin visitar. Antes de la primera parada no se evalúa: un driver
que todavía no salió de la bodega está cargando, no demorado. El
selector **Ordenar por** permite llevar esos demorados arriba. La coordenada
debe desplazarse al menos 50 metros para contar como movimiento y no reaccionar
al ruido normal del GPS.

La web revisa la jornada cada 10 minutos. Si detecta una demora, pide contactar
al driver y permite volver a recordar en 10 minutos. El motivo se registra
únicamente cuando el driver confirmó un inconveniente por el que no seguirá la
ruta —por ejemplo rotura, robo o choque—; una casilla obliga a confirmar esa
condición. Al guardarlo persisten su ID, nombre, texto, operador y contexto de
la demora, y no se vuelve a notificar durante esa jornada. El contorno rojo se
mantiene mientras siga detenido y con paquetes pendientes.

La pantalla lee la jornada desde sus tablas propias de Supabase. Es una copia
operativa que n8n arma directamente desde RapiboyData; no cruza ni consulta
`mensual` o `mensual_historico` para los viajes, sus estados o su evidencia.

### Cómo se usa

Arranca con el mapa vacío y el panel lleno. Es a propósito: con veinte
repartidores y todas sus paradas encima, el mapa completo no dice nada. La
pantalla empieza a servir cuando alguien elige a quién quiere mirar, con las
casillas del panel o el buscador por repartidor, dirección o **ID de viaje** de
paquete.

Cuando la búsqueda identifica un único paquete, el tablero selecciona a su
repartidor, resalta la parada y centra el mapa en su destino. La ficha se abre
al tocar el marcador, para no interrumpir mientras se escribe. Además
del ID y el domicilio, busca por tracking, referencia auxiliar, teléfono,
ciudad, colonia, código postal, tienda, destinatario, estado y polígono. Una
coincidencia compartida por varios paquetes filtra la lista, pero no elige uno
a ciegas.

El identificador visible del paquete es siempre `Viaje.Id` (`id_viaje`), por
ejemplo `30448011`. `ReferenciaExterna` se conserva como `tracking_id` para
trazabilidad, pero no se muestra ni se usa para identificar el paquete.

La lista arranca ordenada por **porcentaje entregado** —entregados sobre
paquetes que siguen en ruta— y se puede reordenar de mayor a menor por total de
paquetes, entregados o última actualización de posición. Este porcentaje no es
el mismo que **avance**: avance también considera resuelto un intento no
entregado. El ícono de flecha al lado del criterio alterna entre mayor a menor
y menor a mayor.

Al elegir a alguien aparecen su última posición conocida, sus destinos y la
línea del recorrido que le queda, y abajo una ficha con paquetes, entregados,
no entregados, pendientes, avance y próximo destino. Si algún paquete no
encaja de forma segura en esas categorías, la ficha no lo agrupa bajo una
etiqueta genérica: desglosa la cantidad con el estado que informa
`EstadoViaje.NombreCompleto`. Con varios elegidos, cada uno tiene su color y
ese color es el mismo en el marcador, en la línea, en los destinos y en el
casillero del panel.

Los marcadores dicen en qué quedó cada parada: número de orden si está
pendiente, un aro alrededor si es la próxima, un tilde si se entregó, un signo
de admiración si se visitó y no se entregó. Los cancelados y los que salieron
de la ruta están ocultos y se muestran con la casilla **Cancelados y retirados**.

Las casillas de capas van en una fila **arriba del mapa, a la derecha**, y no
en el panel: el panel es para elegir a quién mirar y la fila dice qué se ve en
el mapa. Son **Cancelados y retirados**, **Ruta por cercanía**, **Lluvia** y,
con clave de TomTom, **Calles** y **Tráfico en vivo**. En teléfono la fila se
parte en dos líneas. El control del radar y los créditos van en una segunda
línea que aparece solo con esas capas prendidas.

La casilla **Lluvia** pone el radar de RainViewer debajo
de los marcadores, para distinguir una ruta lenta por el driver de una ruta
lenta porque está diluviando. Aparece una barra con la hora del cuadro —hora de
México, como todo el tablero— que se puede animar o mover a mano; los cuadros
futuros se marcan como pronóstico. Sale a internet, así que va apagada y no
pide nada hasta que se la prende: con la
casilla sin marcar, o con RainViewer caído, el mapa es exactamente el de
siempre. La imagen del radar es gruesa a propósito —la API pública sirve hasta
zoom 7, unos 570 metros por píxel—: sirve para ver dónde está la tormenta, no
para mirar una cuadra.

Con `TOMTOM_API_KEY` cargada aparecen dos casillas más: **Calles** pone un
mapa de calles debajo de las zonas —que pasan a verse solo como contorno— y
**Tráfico en vivo** dibuja la velocidad de cada calle encima: verde
es tránsito normal para esa calle, rojo es mucho más lento que de costumbre. El
tráfico se vuelve a pedir cada dos minutos. Las dos arrancan apagadas y sin
clave ni aparecen. A diferencia del radar, el detalle sigue al acercamiento: de
lejos se ven las avenidas, de cerca cada cuadra, y la pantalla pide unas
dieciséis imágenes por capa en un monitor común (el tope es 30).

La clave de TomTom **no es secreta**: va en la URL de cada imagen que pide el
navegador, así que cualquiera que abra el tablero la puede ver. Hay que
restringirla a los dominios del tablero en el portal de TomTom. Con las capas
prendidas, TomTom ve la IP de quien mira y qué zona está mirando, y cobra por
imagen pedida según el plan.

Debajo del mapa, **Entregados por hora** agrupa por la hora de Ciudad de México
de `fecha_visita`; si esa marca falta en un entregado, usa
`fecha_cambio_estado`. Con repartidores seleccionados muestra solamente los de
esa selección; sin selección resume todas las rutas visibles.

### Estadísticas

Arriba del mapa, dos pestañas: **Mapa en vivo** y **Estadísticas**. La segunda
resume la **jornada operativa anterior** —la de antes de la que muestra el mapa,
salteando el domingo—, porque es la que ya está cerrada y se puede comparar sin
que los números se muevan mientras se mira. La página la lee aparte con
`leerTracker(diaOperativoAnterior(diaDePaquetes()))`; si esa lectura falla, la
pestaña resume la jornada visible y lo avisa, y el mapa sigue andando.
Muestra entregados, paquetes en ruta, drivers y tasa global; entregas por driver y por hora de México; una tabla ordenable por
driver con entregas por hora, primera y última entrega; las zonas más lentas
por tiempo promedio desde `fecha_programado` hasta `fecha_visita`, y un mapa
de calor de destinos entregados sobre la cobertura. El mapa de calor ubica
cada destino con `proyectar()`, igual que el mapa, y deja afuera los que caen
fuera de la ventana para que la grilla no se corra respecto de las zonas. El buscador filtra drivers
y zonas.

### El botón Actualizar

Un solo botón, **Actualizar**, corre las dos sincronizaciones una detrás de la
otra —primero paquetes, después posiciones— y relee la jornada una vez al
final. Van en ese orden porque la de posiciones conserva a quienes aparecen por
sus pendientes: un repartidor que recién sumó paquetes sale con su posición en
la misma pasada. Mientras corre, el botón dice cuál de las dos está en curso.
Son flujos independientes: si uno falla, el otro corre igual y el aviso dice
cuál falló.

- **Posiciones** relee `Motoboy.Latitud` y `Motoboy.Longitud` de los
  repartidores y mantiene la última posición conocida de quienes aparecen por
  sus pendientes. No toca los paquetes ni cambia la fecha visible.
- **Paquetes** vuelve a preguntar cuáles son los paquetes de las
  rutas que corresponden al corte operativo y los compara con los guardados.
  Antes de las 15:00 actualiza los estados de la última ruta operativa —el
  sábado cuando es lunes—; desde las 15:00 reconcilia la ruta de hoy. Una
  entrega de esa jornada cambia a verde, pero no sale del total de la ruta.

Lo importante de los paquetes: **no parte de los paquetes que ya tiene**. Vuelve a
descubrir el universo del día desde las reservas. Por eso, si a un repartidor
que arrancó con 30 paquetes le agregan uno a media mañana, el botón lo trae y
el total pasa a 31 sin reiniciar nada. Un refresco que consultara solo los
tracking id guardados nunca preguntaría por ese paquete.

Después de apretarlo, la pantalla vuelve a leer la API y
reemplaza los datos, **conservando la selección, los filtros, el zoom y el
encuadre**. No se remonta el mapa: si se recargara el árbol de servidor, se
perdería todo lo que el operador acomodó a mano.

### Qué se muestra y qué no se inventa

- La posición es siempre **«última posición conocida»**, con la hora y cuánto
  hace. La pastilla del panel va en verde hasta 10 minutos, ámbar hasta 45 y
  roja después. No es «va bien» o «va mal»: es cuán reciente es el punto. Sin
  eso, nadie distinguiría a alguien que está repartiendo de un teléfono que se
  quedó sin batería a las once.
- Un repartidor **sin coordenadas** aparece igual si tiene una ruta, marcado
  «sin GPS», y no se dibuja en ningún lado. Tiene paquetes y no está
  transmitiendo: eso es un dato que el tracker debe conservar.
- El **próximo destino** es el pendiente de menor `Orden`. Si ningún pendiente
  trae orden, o si el menor está empatado entre varios, la pantalla dice que no
  puede señalarlo y explica por qué. Elegir uno sería inventar la secuencia, y
  se leería como un dato del sistema.
- Un paquete cuyo estado dice que no se entregó pero del que no hay ninguna
  visita registrada conserva internamente la categoría de control
  `SIN_CLASIFICAR`. En la tarjeta y en su ficha se muestra el estado real de
  sistema —por ejemplo, **Pedido no entregado**—, no el nombre de esa categoría
  interna. La contradicción sigue sin contarse como un intento fallido real.
- El avance no cuenta cancelados ni retirados de ruta: no son paradas que el
  repartidor tenga que resolver, y contarlas haría bajar el porcentaje justo
  cuando le aligeran el día.

### El mapa

Es el mismo SVG de Cobertura con encuadre movible encima —arrastrar para mover,
rueda o los botones para acercar—. **No hay librería de mapas**: el fondo son
los polígonos del KMZ, que ya están en el repo. Las únicas imágenes de afuera
son las de las capas opcionales —radar, calles y tráfico—, así que con esas
casillas apagadas la pantalla no le pide nada a ningún servidor de mapas y
funciona con la red caída. Para una operación acotada a una ciudad, el contorno
de las zonas de reparto ubica mejor que un mapa de calles: es el marco contra
el que la operación piensa; las calles están para cuando hace falta llegar a
una cuadra.

El contorno se dibuja en el servidor y no se vuelve a pintar nunca; mover y
acercar cambian solo el `viewBox`. Los ~3.500 puntos del polígono no viajan como
datos al navegador.

Cada polígono conserva el `nombre` y la `zona` originales del KMZ. Al tocarlo
se abre un cuadro con ese nombre. Al tocar un paquete se abre su ficha con
estado, dirección, teléfono e información de tienda disponible, polígono,
repartidor, ruta, orden, horarios e ID, además de accesos a Google Maps y al
viaje en Rapiboy.

La ficha se alimenta de RapiboyData durante la sincronización: `Viaje`,
`Direccion`, `Poligono`, `HistorialViaje` y `FotoViaje`. La evidencia prioriza
la última foto no vacía de `FotoViaje`, luego la del historial y finalmente la
foto del viaje. **Ver evidencia** la muestra dentro del cuadro y permite abrirla
en tamaño completo; si el sistema no tiene foto para el ID, la ficha lo informa
sin bloquear el mapa.

El tipo de destino también viene de `Viaje`: se marca como **Domicilio laboral**
cuando `ObservacionDestino` comienza por `Domicilio Laboral`, sin distinguir
mayúsculas ni acentos.

### Qué día muestra

El reloj de Ciudad de México decide la vista, no el reloj de quien abre la
pantalla ni el del servidor:

- Antes de las **15:00**, muestra únicamente los paquetes activos de ayer cuyo
  estado es distinto de `Entregado`.
- Desde las **15:00**, muestra únicamente la ruta de hoy.

Las posiciones no retroceden de fecha junto con los paquetes: para cada
repartidor visible se conserva su última posición conocida. La cabecera indica
por separado la fecha de los paquetes y la fecha de las posiciones cuando son
distintas.

La diferencia importa una vez por día. Ciudad de México está tres horas detrás
de Buenos Aires, así que entre las 00:00 y las 03:00 argentinas en México
todavía es el día anterior: a las 00:30 de acá allá son las 21:30, la jornada
sigue abierta y los repartidores siguen en la calle. La pantalla muestra los
paquetes de esa jornada, que es la que está pasando. Un tablero que mirara el
reloj local pasaría a mostrar la jornada nueva —vacía— tres horas antes de que
exista.

El corte se resuelve con `Intl` y `America/Mexico_City`, no restando horas.
Hoy la diferencia es de tres horas fijas porque ninguno de los dos países usa
horario de verano, pero eso es una circunstancia y no una regla: México lo dejó
de usar en 2022 y podría volver. Con una constante de −3, el corte del día
quedaría corrido durante medio año sin que nada avise.

`diaDeOperacion()` resuelve hoy en México y `diaDePaquetes()` aplica el corte
de las 15:00 y omite el domingo al retroceder un lunes. Ambos días viajan como
texto a n8n. El flujo de paquetes corre a las 07:15 y el de posiciones a las
06:45. Además, ambos corren cada 30 minutos entre las 15:00 y las 23:30, de
lunes a sábado, para refrescar la ruta y detectar movimiento. Al arrancar por
horario calculan la misma regla con la misma zona.

### Si una sincronización queda trabada

El botón contesta *«Ya hay una sincronización de X en curso»* mientras haya una
corrida abierta. El mensaje dice hace cuánto arrancó y cuánto falta para que se
libere sola: si arrancó hace un minuto, es una corrida de verdad y hay que
esperarla; si arrancó hace ocho, es una fila zombi.

Se libera sola a los 10 minutos. Para no esperar:

```sql
select public.tracker_liberar_lock('drivers');   -- o 'paquetes'
```

No borra nada: marca la corrida como fallida y deja el registro. Una corrida
abierta todavía no desactivó ningún repartidor ni ningún paquete, porque eso
pasa recién al cerrar.

La causa más común no es una falla: es haber ejecutado el nodo **Abrir
sincronización** suelto desde el editor de n8n. Ese nodo crea la fila, y sin el
resto del flujo no hay nada que la cierre. Para probar, conviene correr el
workflow entero —«Execute Workflow» desde el trigger, o el botón del tablero—
en vez de nodo por nodo.

### Instalación

1. Correr `supabase/live-tracker.sql` en el SQL Editor de Supabase.
2. Correr `supabase/migracion-06-lugares.sql`: las tiendas y los domicilios de
   los choferes.
3. En una base que ya tenía el tracker, correr también
   `supabase/migracion-07-tracker-detalle-sistema.sql` y
   `supabase/migracion-08-tracker-destino-laboral.sql` y
   `supabase/migracion-09-tracker-snapshot-pendientes.sql` y
   `supabase/migracion-10-tracker-demoras.sql` antes de importar el
   flujo de paquetes actualizado.
4. Importar `../n8n/08-tracker-drivers.json` y `../n8n/09-tracker-paquetes.json`,
   elegir la credencial Postgres en los nodos morados y activarlos.
5. Cargar las *Production URL* de los dos webhooks en
   `N8N_WEBHOOKS_TRACKER_POSICIONES` y `N8N_WEBHOOKS_TRACKER_PAQUETES`.

Sin el paso 1 la pantalla explica qué script falta, en vez de mostrar un 500.
Sin el paso 2 funciona igual y avisa arriba cuál migración falta correr. Sin el
paso 5 la pantalla sigue mostrando lo último que haya guardado n8n y el botón
dice qué variable falta.

### Ruta propuesta por cercanía

El mapa puede dibujar, además de la ruta real, una **ruta propuesta**: sale de
la bodega (19,455207 / −99,105858) y en cada paso toma la parada pendiente más
cercana a la anterior. Es el «vecino más cercano» de toda la vida, y es
deliberado que sea eso y no algo más fino: es una regla que una persona puede
seguir con el dedo sobre el mapa y verificar. Deja kilómetros sobre la mesa
—termina cruzando la zona para juntar lo que quedó suelto— y cambiar eso es una
decisión de la operación, no un ajuste de implementación.

Arranca **apagada**. El orden que manda es el del sistema, el que el repartidor
tiene en su app; encendida por defecto, alguien la leería como la ruta asignada.
El panel dice cuánto mide y, solo cuando las dos rutas cubren exactamente las
mismas paradas, cuánto ahorraría. Con órdenes faltantes o repetidos no se
compara nada: los dos números medirían recorridos distintos.

El cálculo va en el servidor (`proponerRuta()` en `src/lib/tracker.ts`), así que
el resultado es el mismo para todos los que miren la misma jornada.

### Domicilios de los repartidores

El mapa de choferes que mantiene operaciones, exportado como KMZ a
`datos/choferes.kmz`. Cada punto se llama `#ID nombre`, donde el ID es
`IdMotoboy`: es la única forma de atar el mapa con el sistema, porque Google My
Maps no guarda campos propios.

Al elegir un repartidor, su domicilio aparece en el mapa como una casita hueca
de su color. Es un dato sensible: viaja solo el domicilio del repartidor que se
está mirando, nunca la tabla entera. 63 de los 69 choferes del mapa cruzan con
la jornada cargada; los que no tienen punto lo dicen en el detalle.

Los dos KMZ —choferes y tiendas— se convierten con el mismo script; ver
**Tiendas** más abajo.

## Tiendas

Está en el menú dentro de **Colectas**, junto a Asignación e Historial, pero
conserva su ruta `/tiendas`. El panel del mapa tiene dos pestañas: **Colectas
de hoy**, que arranca elegida cuando hay colectas (ver abajo), y **Tiendas**, el
directorio de siempre, que responde «¿dónde queda este comercio?».

Muestra las tiendas, los puntos de dropoff y la bodega sobre las zonas de
reparto, con un buscador que filtra por nombre (sin acentos) o por id. El
nombre de cada punto abre esa ubicación en Google Maps: el mapa del tablero
ubica contra las zonas, que es lo que sirve para decidir, y para llegar a la
puerta hace falta un mapa de calles.

El mapa tiene las mismas capas opcionales que el Live tracker —**lluvia**,
**calles** y **tráfico en vivo**— y una más, **Repartidores**, con la
última posición conocida de cada uno. Sirve para ver quién anda cerca de un
comercio. Las casillas van en la misma fila arriba del mapa, a la derecha, y
todas arrancan apagadas. Las posiciones son las del momento en que se
abrió la página, y su antigüedad se recalcula mientras está abierta. Los
repartidores **no se muestran al rol Comercial**, que no tiene acceso al Live
tracker: para ese rol la página ni siquiera las lee.

La fuente son los dos KMZ de `datos/`:

```bash
npx tsx scripts/lugares.mts
```

Regenera `supabase/migracion-06-lugares.sql`, que se corre en Supabase y carga
`tracker_tiendas` y `tracker_choferes`. Es idempotente y hace un reemplazo
completo, así que un punto borrado del mapa desaparece de la tabla.

Detalles que el script resuelve y conviene conocer:

- **El tipo sale del color del ícono**: verde tienda, naranja dropoff, negro la
  bodega. My Maps no guarda una categoría. La lectura se confirma contra el
  flujo de colectas, que ya trae la lista de dropoff por nombre.
- **El id no es único**: `#55004` está dos veces —«Marlovet» y «Marlovet 2»—,
  dos sucursales del mismo vendedor. La pantalla marca los dos puntos como «ID
  compartido» en vez de quedarse con uno: el sistema no dice cuál corresponde a
  cada pedido, y mostrar una sola sería contestar una pregunta que nadie puede
  responder.
- **Tres puntos no traen id** (`Bodega`, `SPG Benito Juarez`, `David`): quedan
  con id nulo, no con uno inventado.
- **`#73517 Volk's Coruña`** viene envuelto en CDATA por el apóstrofo, y dos
  nombres traen tabulación en vez de espacio. El importador los desenvuelve y
  los normaliza; sin eso el id se pierde.

### Colectas de hoy

La pestaña **Colectas de hoy** muestra la jornada en curso: qué repartidor va a
qué tienda, en qué estado está cada colecta y dónde anda cada repartidor. La
escribe el flujo 12 de n8n en `colectas_vivo` y `colectas_vivo_drivers`, cada
cinco minutos en horario de colectas y cuando alguien aprieta **Actualizar
posiciones y estados**. Con **En vivo** prendido la página relee lo guardado cada
minuto mientras está a la vista.

- **El mapa muestra solo a los repartidores elegidos.** Sin nadie elegido
  queda vacío (la bodega y las zonas); se eligen tocándolos en la lista, uno o
  varios para comparar, y **Quitar todos** vuelve a vaciarlo. De cada elegido
  se ven sus tiendas —con el color de la fase de la colecta y el borde de su
  dueño, como en todo el tablero—, su última posición conocida y dos líneas:
  - **continua: el camino que ya hizo.** Las tiendas por las que pasó, en el
    orden y a la hora en que llegó al local o retiró (✓1, ✓2…), más cada
    posición que fue guardando el flujo 12, hasta la posición actual y la
    bodega si ya llegó;
  - **punteada: lo que le falta**, con las próximas paradas numeradas.

  Elegir una tienda abre su ficha.
- **Sobre el camino recorrido.** RapiboyData no guarda un historial de
  posiciones —`Motoboy` se pisa en cada reporte y los eventos de colecta vienen
  sin coordenadas—, así que el flujo 12 guarda cada posición nueva en
  `colectas_vivo_posiciones` (una cada 5 minutos como mucho, 30 días de
  historia). El camino tiene esa resolución, arranca el día en que se instala
  la migración 16 y une los puntos en línea recta, no por calles. Sin esa tabla
  el camino se dibuja igual, solo con las tiendas visitadas. El recorrido no
  viaja con la página: el navegador lo pide solo para los repartidores elegidos.
- **La ruta es calculada.** El sistema no guarda un orden de paradas para las
  colectas, así que el número de cada parada sale de una regla, y la pantalla lo
  dice: primero la ventana horaria que cierra antes, después las que ya están en
  el local o en camino, y entre las demás la más cercana a la parada anterior
  (al principio, al repartidor); desempatan la solicitud más antigua y el id.
  Las distancias son en línea recta.
- **La ficha** trae la hora de cada paso en hora de México (del historial de la
  colecta), los paquetes en sus tres momentos —los ids del pedido, los que se
  retiraron y los que llegaron a bodega—, la reserva, el dropOFF donde se
  colecta si no es la tienda y la distancia al repartidor.
- **Debajo del mapa**: cifras del día, **Para revisar** (colectas sin
  repartidor, más de 20 min en el local sin retirar, reserva cancelada con la
  colecta abierta, repartidor distinto al de la reserva, más paquetes en bodega
  que retirados, repartidores que no reportan posición o con posición de hace más
  de 45 min), una tabla por repartidor y otra con cada colecta.

Reglas que conviene conocer:

- El estado sale de `Colecta.IdEstado` (1 Asignada, 2 En camino, 3 Retirada,
  4 Finalizada, 5 Finalizada parcial, 6 En local, 7 Aceptada, 8 En depósito) y
  la cancelación, de `FechaCancelada`: el catálogo no tiene un estado Cancelada.
  No se cruza con `EstadoViaje`, que es de los paquetes.
- `CantidadPaquetes` vale 0 hasta que se retira y `CantidadPaquetesColectados`
  hasta que llega a bodega; por eso los faltantes solo se calculan con la colecta
  cerrada. Los dropOFF no traen `IdPedidos`.
- `FechaColecta` se escribe al cerrar en bodega, no al retirar: en dos de cada
  tres colectas es posterior a `FechaLlegoDeposito`. Por eso no se marca como
  error, y la hora de retiro que se muestra es la del historial.
- `HoraDesde`/`HoraHasta` casi nunca vienen en México, y cuando vienen como
  «01:00–01:00» no son una ventana.
- El rol **Comercial** ve la pestaña con los estados y los nombres, pero **sin
  posiciones**: las coordenadas de los repartidores se sacan en el servidor, como
  en la capa Repartidores, y la acción que entrega el recorrido le contesta
  vacío. Su camino recorrido es solo el de las tiendas visitadas.

Instalación: correr `supabase/migracion-15-colectas-vivo.sql` y
`supabase/migracion-16-colectas-vivo-recorrido.sql`, importar
`../n8n/12-colectas-vivo.json`, asignarle las credenciales, activarlo y cargar su
URL de producción en `N8N_WEBHOOKS_COLECTAS_VIVO`. Sin la migración, la pantalla
avisa qué falta y el mapa de tiendas funciona igual.

### Distribución de tiendas

Debajo del mapa está **de quién es cada comercio**: Grupo A de Esteban y Grupo B
de Candelaria. Esa asignación decide el color de la tienda en **todo** el
tablero —azul Esteban, rosa Candelaria—: las columnas «Comercio» y «Tienda» de
las tablas, los rankings de Ayer, Cancelados, Colectas, el
seller de Seguimiento, la ficha del paquete en el Live tracker y los puntos del
mapa de tiendas. Una tienda sin asignar se ve como siempre.

Se agrega y se edita desde la misma pantalla, con nombre, alias, responsable y
sección (Colecta, No colecta o Tienda nueva). Lo puede hacer cualquiera con
sesión y queda firmado en `editado_por`. No hay baja: una tienda que cambia de
manos se reasigna.

En `mensual` y `cancelados` la tienda es solo un texto, sin id, así que el dueño
se encuentra **por nombre**. Se compara sin acentos, sin mayúsculas y sin nada
que no sea letra o número, así que «Mayor Bag» y «MayorBag» son la misma. Lo que
eso no alcanza a unir va como **alias**: la lista original dice «DropOff
MayorBag (MayorBag)», en colectas figura «dropOFF MayorBag» y en el mapa
«Mayor Bag». Una tienda que en algún lado aparece sin color casi siempre es un
alias que falta.

Un nombre o alias no puede pertenecer a dos tiendas: si pasara, el color
dependería de qué fila se leyó última.

Instalación: correr `supabase/migracion-13-tiendas-responsables.sql`. Crea la
tabla y carga la lista inicial —364 tiendas, 181 de Esteban y 183 de
Candelaria— con `on conflict do nothing`, así que volver a correrla no pisa lo
editado desde la web. Sin la migración el tablero funciona igual, sin colores,
y la pantalla de Tiendas avisa qué falta.

## Cobertura · BETA

Los polígonos los mantiene operaciones en `datos/poligonos-v10-bfv.kmz`. Ese KMZ
es la fuente; la web consume `src/lib/cobertura.json`, que se genera con:

```bash
npx tsx scripts/cobertura.mts
```

Se corre a mano cuando cambia la cobertura, no en cada build. El JSON se
versiona a propósito: así el build no depende de leer un binario, y el diff
deja ver qué cambió.

**Solo entran las carpetas `ZONA 1` y `ZONA 2`**: 86 polígonos que nombran las
áreas igual que la columna `poligono` de los pedidos (`ECATEPEC CENTRO`,
`ALVARO OBREGON A`), que es lo que hace comparable el resultado con un caso. El
KMZ trae además capas por código postal —`Iztapalapa`, `Iztacalco`, `Tláhuac`—
y una `Capa sin título` con doce polígonos sin nombre; el script las descarta
(`ZONAS` en `scripts/cobertura.mts`). El recorte no achica la cobertura en la
práctica: el área que cubrían solo ellas es el 1% del total, en bordes finos.

Los polígonos se pisan un poco al tocarse —alrededor del 1% del área cae en
dos—, así que `ubicarPunto()` devuelve todos los que cubren un punto en vez de
elegir uno. Por lo mismo el mapa se dibuja con relleno opaco: con transparencia
los solapes suman y dibujan una costura más oscura en cada límite.

El JSON guarda dos versiones de cada contorno: `contorno`, completo, es el que
decide si un domicilio entra; `trazo`, simplificado con Douglas-Peucker a
0,0002° (~medio pixel a la escala del mapa), es solo para dibujar.

Decidir si un punto entra es local e instantáneo. Lo único que sale a la red es
traducir una dirección escrita a coordenadas, que pasa por Nominatim
(OpenStreetMap): admite 1 consulta por segundo, exige identificar la aplicación
con un User-Agent propio y **recibe la dirección del cliente**, así que se llama
solo desde el servidor, detrás de sesión y con la respuesta cacheada un día. Un
par `lat, lon` o un link de Google Maps pegado se resuelven sin salir.

El verificador de Cobertura no recibe ni busca por ID de viaje. Para una
consulta puntual se ingresa una dirección, un par de coordenadas o un enlace de
Google Maps; el resultado se determina contra los polígonos locales.

## Correrlo local

```bash
npm install
npm run dev
```

Copiá `.env.example` a `.env.local` y completá `SUPABASE_URL` y
`SUPABASE_SERVICE_KEY`. Para probar contra el sheet, completá `SHEET_ID` y poné
`ORIGEN_DATOS=sheet`.

Con `ORIGEN_DATOS=fixture` la app lee los CSV de `fixtures/`, si los hay. El
script que los generaba desde el libro vivía en `analisis/` y se eliminó junto
con esa carpeta; el modo sigue existiendo para archivos armados a mano.

El tablero pide login. Si te quedás afuera, `AUTH_ABIERTO=1` lo abre en local.

Comandos útiles:

```bash
npm run typecheck    # TypeScript
npm run verificar    # imprime todas las métricas por consola
npm run build        # build de producción
```

## Publicar el sheet (solo si se usa como respaldo)

El documento tiene que ser legible por la app. La opción más simple es
**Compartir → Cualquiera con el enlace → Lector**. Con eso alcanza: la app baja
cada pestaña por gid del endpoint `/export`.

> Cuidado: mientras el documento esté compartido por enlace, cualquiera que
> tenga la URL puede abrirlo con todo su contenido, teléfonos incluidos. El
> login del tablero no cambia eso. Si en algún momento querés cerrarlo del todo,
> hay que pasar a una cuenta de servicio de Google Cloud; el único archivo a
> tocar es `src/lib/csv.ts`.

## Desplegar en Vercel

1. Importá el repo en Vercel y elegí `web` como **Root Directory**.
2. Cargá las variables de entorno. Las mínimas para que ande:

   | Variable | De dónde sale |
   |---|---|
   | `SUPABASE_URL` | Supabase ▸ Project Settings ▸ API |
   | `SUPABASE_SERVICE_KEY` | ídem, la **service_role**, no la anon |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `GOOGLE_CLIENT_ID` | Google Cloud ▸ Credenciales |
   | `GOOGLE_CLIENT_SECRET` | ídem |
   | `ALLOWED_EMAIL_DOMAIN` o `ALLOWED_EMAILS` | quién entra por Google (opcional si se usan perfiles) |
   | `N8N_WEBHOOKS` | la Production URL del webhook `actualizar-tablero` |
   | `N8N_WEBHOOKS_DIRECTORIO` | la Production URL del webhook `actualizar-directorio` del flujo 13; la usan los botones Actualizar de Sellers y Drivers |
   | `OPENAI_API_KEY` | opcional: resume los reportes de seguimiento y habilita el asistente |
   | `OPENAI_MODELO_ASISTENTE` | opcional: modelo del asistente, por defecto `gpt-5-mini` |
   | `N8N_WEBHOOK_HISTORIAL_VIAJE` | opcional: Production URL del webhook `historial-viaje` (flujo 11) |
   | `N8N_TOKEN_HISTORIAL_VIAJE` | opcional: el token de la credencial Header Auth de ese webhook (encabezado `ChatBot-Rapiboy-Token`) |

   `SHEET_ID` ya no hace falta. Si se carga igual, queda como respaldo: con
   `ORIGEN_DATOS=sheet` el tablero vuelve al libro sin tocar código.

3. En Google Cloud → Credenciales, creá un cliente OAuth de tipo *Aplicación
   web* y agregá como URI de redirección autorizada:
   `https://TU-DOMINIO/api/auth/callback/google`.

La `service_role` key saltea RLS: lee las tablas completas. Solo se
usa desde el servidor y nunca llega al navegador, pero por eso mismo va cargada
como variable de entorno de Vercel y no en el repo. Si se filtra, se rota desde
el panel de Supabase.

Sin `GOOGLE_CLIENT_ID` cargado, en producción no entra nadie: el ingreso falla
en vez de quedar abierto.

### Quién puede entrar

Hay dos puertas y las dos terminan en la misma sesión.

**Correo y contraseña**, contra la tabla `perfiles`. Los perfiles los crea el
administrador desde *Administración ▸ Perfiles*; no hay registro abierto, así
que nadie entra por su cuenta. El script está en `supabase/perfiles.sql` y deja
creado el perfil del administrador.

Las contraseñas se guardan derivadas con **scrypt** (`scrypt$N$r$p$sal$hash`),
nunca en claro. Los parámetros van pegados a cada hash para poder subir el costo
más adelante sin invalidar las contraseñas que ya existen. Se usa scrypt y no
bcrypt porque viene en Node: una dependencia menos en un proyecto que ya habla
con Supabase y con OpenAI por `fetch` pelado.

Tres roles:

| Rol | Puede |
|---|---|
| `admin` | todo el tablero, más crear perfiles, desactivarlos y resetear contraseñas |
| `operador` | todo el tablero y cambiar su propia contraseña |
| `comercial` | solo **Ruta** (`/tiendas`) y **Colectas** (`/colectas` y `/colectas/historial`) |

El **comercial** es para el equipo comercial y lo crea el administrador eligiendo
ese rol. Ve el menú recortado a esas tres pantallas; si pide otra, el proxy lo
devuelve a Ruta, y los endpoints le responden 403. Puede actualizar colectas y
ver las **Colectas de hoy** con sus estados —pero no la posición ni el recorrido GPS de los repartidores, que se
sacan en el servidor—, y nada más: no carga reportes, no
tiene campana ni puede entrar a *Mi perfil*, así que su contraseña la resetea el
administrador. Antes de crear el primero, volver a correr `supabase/perfiles.sql`:
en una base existente agrega el valor `comercial` al enum `rol_perfil`, sin tocar
los perfiles ni las contraseñas.

El rol viaja en la sesión. Si a alguien se le cambia el rol, el cambio corre
desde su próximo ingreso; para cortarle el acceso ya, desactivarlo.

El administrador edita cualquier perfil —correo, nombre y rol—, resetea
contraseñas y activa o desactiva. Cualquiera, administre o no, entra a la misma
sección y ahí encuentra solo lo suyo: su nombre y su contraseña. La lista de los
demás no sale del servidor, así que no hay nada que esconder en el navegador.

Se **desactiva** en vez de borrar: el correo sigue figurando en los reportes y
las ediciones que hizo esa persona, y borrar la fila dejaría ese rastro sin
dueño.

Tres cosas que el tablero no deja hacer, las tres por el mismo motivo —que no
quede sin quién lo administre y sin arreglo desde la web—: desactivarte a vos
mismo, quitarte a vos mismo el rol de admin, y bajar o desactivar al último
administrador activo. La última cubre el caso que las otras no ven: dos admins,
uno baja al otro y después se baja solo.

Cambiar el correo de alguien no reescribe lo que esa persona ya firmó. Y si
alguien cambia el suyo, la sesión abierta sigue con el anterior hasta que vuelva
a entrar; la pantalla lo avisa.

**Google**, para las cuentas de `ALLOWED_EMAILS` o del dominio de
`ALLOWED_EMAIL_DOMAIN`. Es como funcionaba antes y se mantiene. Quien entra así
no tiene perfil en la base, así que no puede administrar perfiles: eso pide
tener uno.

La pantalla de acceso responde lo mismo para correo inexistente, perfil
desactivado y contraseña equivocada. Si cada caso dijera algo distinto, serviría
para averiguar qué correos tienen cuenta.

> **Si te quedás afuera en local**, poné `AUTH_ABIERTO=1` en `.env.local`. Abre
> el tablero sin login, y solo funciona fuera de producción. Antes ese bypass se
> prendía solo cuando faltaba `GOOGLE_CLIENT_ID`; ahora es explícito, porque ya
> hay forma de entrar en local sin configurar nada externo.

## De dónde salen los datos

La app tiene tres orígenes y elige solo, según lo que esté configurado: manda
Supabase si están sus credenciales, si no el sheet, y si no hay nada los
fixtures. `ORIGEN_DATOS` fuerza uno puntual, que es la forma de volver al sheet
en el acto si la base falla, sin borrar credenciales.

Los tres entregan las filas con la misma forma —encabezado primero, todo como
texto— así que el resto de la app no sabe de dónde salieron. Eso es lo que
permite cambiar de origen con variables de entorno y comparar los dos en
paralelo: con los mismos datos, los tres dan exactamente los mismos números.

El **Live tracker** es la excepción a todo esto: solo funciona con Supabase, no
pasa por el normalizador y no tiene caché. Lee sus cuatro tablas propias en cada
pedido, porque el sentido de la pantalla es ver dónde está la gente ahora y una
copia de hace una hora sería el mapa de la mañana. Con el origen en `sheet` o
`fixture`, la pantalla lo explica en vez de mostrar un error.

Las vistas principales, se lean de donde se lean:

| Vista | Tabla | Pestaña | Para qué |
|---|---|---|---|
| `mensual` | `mensual` | `Mensual` | El período operativo: mes anterior y actual del 1 al 9; solo el actual desde el día 10. |
| histórico | `mensual_historico` | — | Períodos cerrados. Alimenta Histórico y se puede refrescar por el rango seleccionado. |
| `ayer` | `ayer` | `Ayer` | Los casos nuevos de la jornada anterior: los que no estaban ya en `mensual` ni en `cancelados`. Alimenta la sección Ayer. |
| cancelados | `cancelados` / `cancelados_historico` | `Cancelados` | La misma separación física para cancelaciones tempranas. |

No comparten esquema a propósito: `ayer` sale del sistema sin pasar por soporte,
así que no tiene reclamo, aviso ni caso. Cada tabla del tablero arma sus columnas
con los campos que su vista realmente trae, así que **agregar una columna en
Supabase alcanza para que aparezca en la web**, sin tocar código.

### Montar la base

1. Correr `supabase/schema.sql` en el SQL Editor de Supabase. Crea las tablas
   operativas con sus índices y deja RLS activo.
2. Correr `supabase/historico.sql`. Crea `mensual_historico` y
   `cancelados_historico`, instala la rotación y ordena los datos existentes
   sin perder filas.
3. Copiar `SUPABASE_URL` y la **`service_role`** key desde Project Settings ▸ API
   a `.env.local` (o a las variables de Vercel).

La rotación es transaccional. Del 1 al 9 conserva dos meses en las tablas
operativas; desde el día 10 copia todo lo anterior al mes actual al histórico y
solo entonces lo quita de la operación. Si una parte falla, PostgreSQL revierte
todo. Repetir la función es seguro.

### Siniestrados

- `/siniestrados` muestra los casos con estado actual `Siniestrado` de la misma
  ventana que Mes en curso: mes anterior y actual del 1 al 9; solo actual desde
  el día 10.
- `/siniestrados/historial` filtra `mensual_historico` por estado y por el mes o
  rango elegido. Usa el mismo botón y webhook que Histórico; el refresco cubre
  todos los casos del rango, para detectar también nuevos cambios a Siniestrado.
- No hay tablas adicionales ni copias de casos: la rotación existente mueve
  Mensual a Histórico, incluyendo el valor del producto. Las listas reflejan
  el estado vigente, no una foto congelada del estado al cerrar el mes.
- `valor_producto` toma `CAST(V.ValorDeclaradoCompleto AS DECIMAL(18, 2))`.
  Los importes desconocidos aparecen como `—` y se cuentan por separado;
  cero sigue siendo un valor válido. Se muestra el importe del origen sin
  convertir ni asumir una moneda que la consulta no informa.
- `valor_70` es una columna generada por Postgres: `round(valor_producto * 0.70, 2)`.
  Si falta el valor declarado, también queda en `null`.
- `cobrado` es booleano, por defecto `false`. Se marca o desmarca desde las
  tablas de Siniestrados, tanto operativa como histórica, con sesión válida.
  La edición registra al operador y la fecha en `editado_por` y `editado_en`.
  n8n no modifica esta marca; la rotación la conserva y recalcula el 70%.

Para actualizar una instalación existente:

1. Ejecutar `supabase/migracion-03-cobros-siniestrados.sql` en Supabase. Agrega
   `valor_producto` si falta, `valor_70` y `cobrado` en ambas tablas, y actualiza
   la rotación; no mueve ni elimina filas durante la instalación. Incluye lo
   necesario de la migración 02: no ejecutar la 02 después de la 03.
2. Importar los JSON 01, 02 y 04 actualizados, conservando las credenciales y
   URLs de producción. No se requieren nuevas variables de entorno.
3. Publicar la web y usar **Actualizar** en Siniestrados y en cada período
   histórico que se quiera completar con importes. No se rellenan importes al
   ejecutar la migración SQL.

La consulta de colectas suministrada se usa como referencia del campo de
valor, no como reemplazo de las consultas: se conservan los filtros actuales
de ingreso, modalidad y localidad, y el mes sigue siendo el de creación.

Validación local sin tocar bases ni ejecutar webhooks: `npm run test:siniestrados`
y `npm run test:cobros`.

### Lo que n8n tiene que hacer

Usar el nodo de **Postgres** contra el connection string de Supabase, no el nodo
de Supabase: el de Postgres tiene `Insert or Update` (upsert) y escritura en
lote, que es lo que hace falta.

La corrida diaria es un upsert por `id` que **lista solo las columnas del
sistema**:

```sql
insert into mensual (id, fecha_creacion, fecha_programado, estado,
                     repartidor, tienda, destino, poligono, visitas, valor_producto)
values (...)
on conflict (id) do update set
  fecha_creacion = excluded.fecha_creacion,
  fecha_programado = excluded.fecha_programado,
  estado = excluded.estado,
  repartidor = excluded.repartidor,
  tienda = excluded.tienda,
  destino = excluded.destino,
  poligono = excluded.poligono,
  visitas = excluded.visitas,
  valor_producto = excluded.valor_producto;
```

Las columnas de soporte —`reclamo_tienda`, `ubicacion`, `telefono`, `aviso`,
`caso`— no van en el `do update set`, así que la corrida diaria no las pisa. Ese
es el motivo de fondo para haber dejado el sheet: ahí el flujo rearmaba la hoja
entera y se llevaba puesto el trabajo del equipo.

`Demorados` y `DemoradoNoEntregado` tampoco se leen más. La cola de escalamiento
se calcula sobre `Mensual` (`demorados()` en `src/lib/metricas.ts`): un caso
entra cuando pasaron más de `DIAS_PARA_DEMORA` días desde su último movimiento y
sigue abierto. Da la misma lista sin que nadie tenga que volver a pegarla cada
mañana, y no se queda vieja durante el día.

## Tablas

Todas las tablas del proyecto usan el mismo componente (`src/components/Tabla.tsx`):

- Traen un buscador que filtra por cualquier columna, sin distinguir acentos ni
  mayúsculas.
- Se ordenan haciendo clic en cualquier encabezado.
- Varias traen filtros por estado, caso o aviso, y admiten **varios valores a la
  vez**: se eligen con casillas, no con un desplegable de un solo valor.
- El menú **Columnas** deja ocultar las que no interesen, tabla por tabla.
- Las columnas ocultas y los filtros elegidos quedan guardados en el navegador
  de cada persona (`localStorage`, ver `src/lib/preferencias.ts`), por tabla. Se
  consumen con `useSyncExternalStore` para que el render del servidor no choque
  con la hidratación. El buscador no se guarda: es de uso momentáneo.
- **Imprimir** manda esa tabla —y solo esa— a la impresión del navegador, que
  ofrece guardar en PDF. Sale con lo que haya en pantalla: los mismos filtros,
  la misma búsqueda y las mismas columnas visibles, con un encabezado que deja
  registrado qué se filtró y cuándo. Se usa la impresión del navegador en vez de
  generar el PDF por código para no reproducir la lógica de la tabla en otro
  lado; el detalle está en el bloque `@media print` de `globals.css`.
- Con algún filtro puesto aparece **Limpiar filtros**, que también sirve cuando
  una preferencia guardada apunta a un valor que ya no está en los datos.
- Las celdas de texto largo se muestran acortadas y se despliegan con un clic;
  otro clic las vuelve a acortar.

Cada tabla ofrece **las columnas que trae su propia pestaña**: `Ayer` no tiene
visitas y solo `Mensual` trae reclamo, aviso y caso, así que esas columnas no
aparecen donde no existen. De las que sí están, el equipo oculta las que no le
interesan en cada momento.

Cada estado tiene su color, definido en `src/lib/estados.ts` con los tokens de
`globals.css`: Entregado verde oscuro, Devuelto verde claro, Devolución violeta,
En depósito amarillo, Retirado celeste, Para retirar azul, Siniestrado naranja y
Pedido no entregado rojo. Van como color de texto, sin recuadro.

La única pill del tablero es la de **Caso** —Cerrado en verde oscuro, Abierto en
rojo oscuro—, porque resuelto contra pendiente es la métrica que la operación
mira primero y conviene que salte por encima del resto.

Como la tabla es un componente de cliente, las páginas le pasan filas planas
—valores serializables— y una descripción de las columnas; nunca funciones de
render, que no cruzan el límite entre servidor y cliente.

## El botón Actualizar

Refresca lo que ya está en la base. **No trae casos nuevos**, y esa es la
distinción que importa: la ingesta de las 8 decide *quiénes* entran a las
tablas, y el botón actualiza *lo que hay*. Son dos preguntas distintas y por eso
son dos flujos.

Dispara un solo webhook, el de `02-refresco-estados`:

```
N8N_WEBHOOKS=https://TU-N8N/webhook/actualizar-tablero
```

Ese flujo toma **todos** los ids de `mensual`, de `ayer` y de `cancelados`, le
pregunta a SQL Server por cada uno y pisa lo que devuelve. Tres ramas
independientes que corren en paralelo, con los mismos tres horarios diarios
(06:00, 15:13, 18:55) más el botón.

No puede agregar filas aunque el nodo diga *upsert*: los ids que consulta salen
de la propia tabla, así que no hay ninguno nuevo que insertar.

Y no pisa el trabajo de soporte. Cada nodo mapea **solo las columnas del
sistema** —estado, repartidor, comercio, zona, visitas, fechas—. `aviso`,
`avisado_en`, `reclamo_tienda`, `ubicacion` y `telefono` no figuran en el
mapeo, así que el UPDATE no las nombra y el ciclo de AVISADO / NO AVISADO
sobrevive intacto a cada corrida. Ese ciclo lo mueven solo dos cosas: el envío
por WhatsApp y el nodo de reapertura de la ingesta diaria.

El orden importa dentro del tablero: primero corre el flujo, y recién cuando
termina se invalida el caché. Al revés, la web volvería a leer la base vieja.

**La ingesta no tiene webhook a propósito.** Lo tuvo un día y fue un error: el
botón terminó cargando casos nuevos a mitad de la jornada, que es justo lo que
no se le pide. Corre por horario, y si hace falta correrla a mano se ejecuta
desde n8n.

Antes había también un botón **Refrescar** que solo vencía el caché sin tocar
n8n. Se sacó: partía la acción en dos y ninguna mitad era lo que la gente
quería. Apretar Refrescar releía los mismos datos viejos, porque lo que estaba
desactualizado era la base, no la copia.

## Los botones del Live tracker

Son otros dos, con su propio endpoint cada uno, y no pasan por
`app/actualizar.ts`:

```
POST /api/live-tracker/sync/drivers     -> N8N_WEBHOOKS_TRACKER_POSICIONES
POST /api/live-tracker/sync/shipments   -> N8N_WEBHOOKS_TRACKER_PAQUETES
GET  /api/live-tracker/datos            -> vuelve a leer la jornada
POST /api/live-tracker/demoras          -> registra un inconveniente confirmado
```

Los cuatro piden sesión y, además, están detrás del proxy. Se comprueba en los dos
lados porque un endpoint se puede invocar por HTTP directo y porque el matcher
del proxy es una línea de configuración.

Los dos endpoints `sync` no escriben en Supabase. Disparan el flujo, esperan a que **termine de
verdad** —`Response Mode: Last Node`— y devuelven el resumen que dejó la corrida
en `tracker_sincronizaciones`: leídos, insertados, actualizados, desactivados,
omitidos. Quien escribe es n8n, con su credencial y dentro de su transacción.
`POST /demoras` es la excepción acotada: revalida la demora en el servidor y
escribe solo el motivo confirmado en `tracker_demoras`.

Dos corridas del mismo tipo no pueden solaparse: `tracker_abrir_sync()` toma un
lock en la base, y la segunda recibe un 409 con un mensaje que se entiende, no
un error. El botón además se deshabilita mientras corre y hay un candado contra
el doble clic, porque el estado de React se aplica un render tarde.

## Seguimiento

La única parte del tablero donde el equipo escribe texto libre. La pestaña de
abajo a la derecha está en **todas** las pantallas, porque el momento de
reportar algo casi nunca coincide con estar parado en la pantalla de reportes:
se encuentra algo raro mirando Demorados o el mes en curso.

Se carga el id del caso, driver, seller, un comentario y, si hace falta, fotos o archivos. El
reporte queda **abierto** hasta que alguien lo cierra; al cerrarlo se registra
quién fue.

La pantalla es un tablero de tarjetas. Cada período —semana de lunes a domingo
o mes calendario, a elección, con el calendario de Ciudad de México— es un
carril plegable con tres columnas de color: **Abierto** (rojo), **Tomado**
(índigo) y **Cerrado** (verde). Arriba hay un resumen con la proporción por
etapa, y filtros por texto y por responsable (míos, sin tomar o una persona).
Cada tarjeta muestra el caso, el resumen, driver y seller, cuánto lleva abierto
—ámbar desde 24 h, rojo desde 3 días— y un avatar de color por persona.

Lo que conviene saber:

- **Tomado no es un estado de la base.** Es `tomado_por` / `tomado_en` sobre un
  reporte `abierto`, así que un tomado cuenta como abierto en los totales y en
  el tiempo de resolución. Se toma con el checkbox de la tarjeta; la condición
  viaja dentro del mismo PATCH, y si dos personas lo marcan a la vez gana una
  y la otra ve quién lo tiene. Soltarlo puede quien lo tomó o un admin. Al
  cerrar se conserva quién lo tomó; al reabrir se limpia. En una base
  existente, ejecutar `supabase/migracion-11-seguimiento-tomado.sql`.
- **Las tarjetas no se arrastran.** Tomar y cerrar escriben en la base y dejan
  firmado quién lo hizo; un arrastre accidental no debería poder hacer eso.

- **El resumen es opcional.** Con `OPENAI_API_KEY` cargada, cada comentario
  largo pasa por el modelo (`OPENAI_MODEL`, por defecto `gpt-4o-mini`) y se
  guarda un resumen de dos oraciones. Sin clave, con la API caída o con un
  timeout, el reporte se guarda igual sin resumen y la tabla muestra el
  comentario original. El dato que importa es lo que escribió la persona; el
  resumen es una comodidad para leer la cola de un vistazo. Los comentarios de
  menos de 120 caracteres no se resumen: ya son su propio resumen.
- **Los adjuntos van a un bucket privado, subidos desde el navegador.** El
  servidor no los toca: firma una URL de subida por archivo —válida para esa
  ruta y nada más— y el navegador manda el archivo directo a Supabase. Es lo que
  permite adjuntar una foto de teléfono: el cuerpo de una Server Action está
  limitado a 1 MB y una función de Vercel a 4,5 MB, así que proxear el archivo
  fallaría justo con el caso normal. La `service_role` sigue sin salir del
  servidor; lo que viaja es un token atado a una ruta.
- **En la base se guardan las rutas, no las URLs.** Una URL firmada vence, así
  que guardarla dejaría la tabla llena de links muertos. La página firma todas
  las rutas visibles de una sola vez al pintarse, con una hora de validez
  (`SUPABASE_FIRMA_SEGUNDOS`).
- **La tabla es del equipo y n8n no la toca.** Por eso `caso_id` es texto y no
  una foreign key a `mensual`: se puede reportar sobre un viaje que todavía no
  entró a la tabla, o que ya salió del mes. El script está en
  `supabase/seguimiento.sql` y se corre una vez; hasta entonces la sección
  aparece con un aviso en vez de fallar.
- **Driver y seller quedan guardados con el reporte.** Al cargarlo, el servidor
  acepta ambos valores desde el formulario; si alguno queda vacío, busca el
  pedido en `mensual` y `mensual_historico` y lo completa.
  Así no desaparecen cuando el pedido rota al histórico. En una base existente,
  ejecutar `supabase/migracion-04-seguimiento-semanal.sql`: también devuelve los
  valores `tomado` antiguos de la columna `estado` a `abierto` y bloquea nuevas
  cargas con ese valor (hoy se toma con `tomado_por`, ver arriba).
- **La resolución se mide desde la última apertura.** `abierto_en` se crea con
  el reporte y se reinicia si alguien lo reabre; al cerrarlo, `atendido_en`
  marca el final. Así un segundo ciclo abierto/cerrado no suma el tiempo de un
  cierre anterior.

Esta sección no usa el componente `Tabla`: vive en `TableroSeguimiento`, porque
cada tarjeta tiene acciones que escriben en la base, adjuntos que abrir y un
comentario que se despliega, y meter eso en la tabla común la llenaría de casos
especiales de una sola pantalla.

### Menciones y notificaciones

En el comentario de un reporte —al cargarlo o al editarlo— se puede arrobar a
alguien del equipo: al escribir `@` aparece una lista con autocompletado
(flechas y Enter o Tab para elegir, Escape para cerrarla). El alias es la parte
del correo antes de la arroba, en minúsculas: `@esteban.larcher`. En las
tarjetas, las menciones se ven resaltadas, y más marcadas si son a vos.

- **A quién se puede arrobar:** perfiles activos, correos de `ALLOWED_EMAILS` y
  quien ya aparece en algún reporte. Si dos correos comparten la parte local en
  dominios distintos, ese alias no se ofrece ni notifica: avisarle a la persona
  equivocada es peor que no avisar.
- **Cuándo se avisa:** al crear el reporte, a cada persona mencionada; al
  editarlo, solo a las menciones nuevas, para que corregir una coma no vuelva a
  notificar a todos. Nadie recibe aviso por arrobarse a sí mismo. Si falla el
  aviso, el reporte se guarda igual y el error queda en el log.
- **La campana** está en la barra superior, al lado del selector de tema, con
  la cantidad sin leer. Pregunta cada minuto mientras la pestaña está a la vista
  y al volver a ella. Tocar un aviso lo marca como leído y abre Seguimiento con
  ese reporte desplegado y resaltado (`/seguimiento?reporte=<id>`).
- **Instalación:** ejecutar `supabase/migracion-12-notificaciones.sql` en
  Supabase. Hasta entonces la campana no aparece y los reportes se guardan sin
  avisar. Los avisos se borran junto con su reporte.

Si la página muestra «No se pudieron cargar los datos» con `fetch failed`, casi
siempre es `SUPABASE_URL` mal copiado: tiene que ser
`https://<id-del-proyecto>.supabase.co`, con el id que aparece en la dirección
del panel (`supabase.com/dashboard/project/<id>`).

## Asistente (beta)

> **Beta.** Está en prueba con el equipo: puede equivocarse al interpretar una
> pregunta o elegir una consulta que no era, y el tono de las respuestas se
> sigue ajustando. Lo que contesta sale de los datos del tablero y del sistema,
> pero conviene verificar antes de actuar sobre un caso. Los límites de
> seguridad —solo lectura, qué datos salen, quién lo usa— no están en prueba.

Al lado de **Añadir seguimiento**, en todas las pantallas, está la pestaña
**Asistente**: un chat que contesta preguntas sobre los datos del tablero
—«¿en qué estado está el 30448011?», «¿cuántos abiertos hay este mes?»,
«reportes sin tomar», «¿cómo va tal repartidor?»—. Lo ven admin y operador,
igual que Seguimiento. La conversación sobrevive a la navegación y se reinicia
con **Nueva conversación**.

**Solo consulta.** El modelo no tiene acceso a la base: le pide al servidor
una de ocho consultas —paquete por ID, historial del viaje en el sistema, casos
con filtros, métricas del mes, reportes de seguimiento, repartidor en vivo,
asignación de colectas y colectas realizadas— y el servidor las responde con
las mismas funciones que usan las pantallas. Por eso cuenta los casos igual que
el tablero, y por eso no puede modificar nada.

**Cómo busca un paquete.** Primero en el sistema de Rapiboy, a través del
flujo 11 de n8n (`../n8n/11-historial-viaje.json`): estado actual, tienda, zona
y últimos movimientos. En paralelo lo cruza con el tablero —si es un caso de
entrega fallida, si está siniestrado y cobrado, el reclamo y aviso de la
tienda, los reportes de seguimiento, si se canceló y la ruta del día— y avisa
cuando el estado del tablero quedó atrás del sistema, que es lo normal entre
un refresco y el siguiente. Si el paquete no está en el tablero, explica por
qué: otra localidad o modalidad, o que nunca fue una entrega fallida. Para
habilitar la consulta al sistema, importar y activar el flujo y cargar `N8N_WEBHOOK_HISTORIAL_VIAJE`
(la Production URL) y `N8N_TOKEN_HISTORIAL_VIAJE` (el valor de su credencial
Header Auth, cuyo *Name* tiene que ser exactamente `ChatBot-Rapiboy-Token`). Sin
eso, contesta solo con el tablero y avisa que no pudo consultar el sistema. Si
avisa «token rechazado», n8n respondió 403 («Authorization data is wrong!»):
el nombre del encabezado o el valor no coinciden entre n8n y el tablero.

**Qué no le llega a OpenAI:** teléfonos, ubicaciones y domicilios de clientes,
coordenadas y domicilios de repartidores. Si hace falta uno de esos datos, la
respuesta remite a la ficha del caso.

**Costo.** Cada pregunta hace de una a seis llamadas al modelo. Con
`gpt-5-mini` ronda medio centavo de dólar por pregunta. Cada herramienta
devuelve como mucho 50 filas, y el log del servidor anota por respuesta quién
preguntó y cuántos tokens usó (`[asistente]`). Conviene fijar además un límite
mensual en la cuenta de OpenAI (Settings ▸ Limits).

Usa la misma `OPENAI_API_KEY` que el resumen de seguimiento; sin ella la
pestaña aparece y explica que falta configurarla.

**Uso y costo, para el administrador.** Al pie de *Perfiles* está **Uso del
asistente**: por mes y por persona, cuántas preguntas hizo, cuántas fallaron,
los tokens y el costo estimado, con navegación a meses anteriores. Se guarda
una fila por pregunta en `asistente_uso` —sin el texto de la pregunta ni de la
respuesta— y con eso se aplica también un **tope diario** por persona
(`ASISTENTE_TOPE_DIARIO`, 150 por defecto), que frena un bucle, un abuso o una
sesión robada antes de que llegue a la factura. Instalar
`supabase/migracion-14-asistente-uso.sql`; sin la tabla el asistente funciona
igual, pero no registra ni frena.

**Qué puede y qué no puede filtrar.** Pide sesión de admin u operador, igual
que el resto del tablero, y no muestra nada que esa persona no pueda ver ya en
las pantallas: un viaje de otra localidad o modalidad no se detalla. Sí manda a
OpenAI lo necesario para contestar —estados, tiendas, repartidores, zonas,
comentarios de los reportes y el enlace a la foto de evidencia— y OpenAI, por
su política de API, no lo usa para entrenar pero puede conservarlo hasta 30
días para control de abuso. Los comentarios de Seguimiento son texto libre: si
alguien escribe un teléfono ahí, ese teléfono viaja.

## Gráficos atados a la tabla

Las secciones con listado de casos abren con un gráfico configurable: se elige
por qué dimensión agrupar —estado, comercio, zona, repartidor— y qué medir
—casos, abiertos, % sin resolver, visitas promedio—.

El gráfico **comparte los filtros con su tabla**: filtrar por una zona o buscar
un comercio lo recalcula al instante. No hay un contexto que los envuelva ni
props entre medio: los dos llaman a `useVista` con el mismo `id`, y el estado
vive en el store de preferencias, que avisa a sus suscriptores cuando algo
cambia (`src/components/useVista.ts`).

## Límites conocidos

- **Los rankings piden 30 casos como mínimo** (`MINIMO_CASOS` en
  `src/lib/metricas.ts`). Está calibrado para un mes de datos: el repartidor con
  más viajes ronda los 90 casos. Con ese volumen una tasa de devolución arrastra
  unos 6 puntos de ruido, así que los rankings sirven para ver los extremos, no
  para ordenar a los del medio.

- `Mensual` tiene que incluir los casos cerrados. Si queda filtrada solo con los
  abiertos, la tasa de recuperación se muestra en 0% porque no hay ningún
  `Entregado` con qué compararla.
- La caché es de una hora. Si el equipo actualiza el sheet y quiere verlo al
  instante, hay que bajar `SHEET_REVALIDATE`.

### De las colectas en vivo

- **La ruta que le falta a cada repartidor es calculada**, no del sistema:
  `dbo.Colecta` no tiene orden de paradas. Se muestra como «orden calculado» y
  las distancias son en línea recta.
- **El camino recorrido tiene la resolución del flujo 12.** RapiboyData no guarda
  historial de posiciones, así que el rastro es lo que guardó el flujo cada 5
  minutos desde que se instaló la migración 16, unido en línea recta. Un
  teléfono que no reporta deja un tramo recto entre dos puntos lejanos.
- **La hora de paso por una tienda** es la del historial de la colecta (cuando
  entró «En local» o, si no quedó, cuando la retiró), no una posición GPS.
- **`FechaColecta` no es la hora de retiro**: el sistema la escribe al cerrar en
  bodega. Por eso no se usa para el recorrido ni se marca como inconsistencia.
- **`IdDeposito` no tiene nombre**: no hay catálogo confirmado, se guarda el
  número tal cual.
- **Fuera del horario del flujo** (7:00 a 16:55, lunes a sábado) la foto no se
  renueva sola; el botón **Actualizar posiciones y estados** la rehace cuando
  haga falta.

### Del Live tracker

- **`Motoboy.UltimaActualizacion` está en hora de Argentina (UTC−3).** Se
  comprobó contra la base el 2026-09-21: el servidor corre en UTC, pero esa
  columna y `HistorialViaje.Fecha` van tres horas por detrás. Las consultas del
  tracker declaran `@ZonaOrigen = 'UTC'` y el nodo **Corregir zona de posición**
  del flujo 08 suma las tres horas. De eso depende toda la antigüedad que muestra
  el mapa: con la zona corrida, o está todo en verde o está todo en rojo.
- **El universo de paquetes se acota por comercio**: `Usuario.IdModalidad = 5`
  y `Usuario.IdLocalidad = 9`, el mismo alcance que Mensual, Ayer y Cancelados.
  Así los totales del tracker se pueden comparar con los de las otras
  pantallas. Los repartidores, en cambio, salen de `ReservaxMotoboy` filtrando
  `IdLocalidad = 9` y `Cancelada = 0`: ahí la tabla es la reserva del
  repartidor y no el comercio, así que la modalidad no aplica igual. Puede
  aparecer un repartidor sin paquetes en el panel si toda su carga era de otra
  modalidad.
- **No hay polígono del repartidor que venga del sistema.** Ni `Motoboy` ni
  `ReservaxMotoboy` exponen uno verificado, así que el que muestra el panel lo
  resuelve `ubicarPunto()` con las coordenadas contra el KMZ. Es un dato real,
  pero es del tablero y no del sistema: puede no coincidir con la asignación de
  zona que tenga cargada la operación.
- **La ruta del repartidor se deriva de sus paquetes.** `ReservaxMotoboy` no
  tiene `IdRuta` —probado, ver `supabase/colectas.sql`— así que un repartidor
  sin paquetes cargados aparece sin ruta.
- **Una jornada sin paquetes no desactiva nada.** Es deliberado: una consulta
  que devuelve cero es indistinguible de una que no llegó a correr. El efecto
  es que, si a un repartidor le sacan el último paquete del día y no queda
  ninguno en toda la operación, ese paquete sigue figurando en ruta hasta la
  corrida siguiente que sí lea algo.
- **El mapa no tiene calles.** El fondo son los polígonos de reparto, que
  ubican bien dentro de la zona conocida pero no sirven para leer una dirección
  puntual. Para eso está el destino escrito en la ficha del paquete.
