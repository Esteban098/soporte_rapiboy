# Flujos de n8n

Catorce workflows. Los tres primeros reemplazan al único que escribía en el
Google Sheet; los siguientes cubren los botones Actualizar y la carga de datos
de tienda desde Firefox. Se importan desde n8n con **Workflows ▸ Import from
File**.

| Archivo | Qué hace | Cuándo corre |
|---|---|---|
| `01-ingesta-diaria.json` | Rota períodos, trae los casos fallidos del día y los cancelados, y reabre la cola de avisos | 8:00 todos los días; la ingesta se saltea el domingo, la rotación no |
| `02-refresco-estados.json` | Vuelve a preguntarle a SQL Server en qué estado están los casos que ya tenemos | 6:00, 15:13, 18:55 y cada vez que alguien toca **Actualizar** en el tablero |
| `03-whatsapp-apagado.json` | Avisa al repartidor y reclama a los grupos | **Apagado.** Ver más abajo |
| `04-refresco-historico.json` | Relee el estado de los casos de un rango de meses | Solo a pedido, desde **Histórico** |
| `05-refresco-cancelados-historico.json` | Ídem para las cancelaciones | Solo a pedido, desde **Cancelados históricos** |
| `06-colectas.json` | Calcula quién colecta cada comercio y trae las colectas de 30 días | 12:00 de lunes a viernes, y desde **Colectas** |
| `07-firefox-gestiones.json` | Interpreta el ID y los datos aportados por la tienda, y actualiza solo las columnas de soporte de `mensual` | Al enviar una selección desde la extensión de Firefox |
| `08-tracker-drivers.json` | Repartidores de la ruta visible y su última posición conocida | 6:45; cada 30 min de 15:00 a 23:30, lunes a sábado; y desde **Actualizar** del live tracker, después de los paquetes |
| `09-tracker-paquetes.json` | Actualiza la última ruta operativa —el sábado si es lunes— o reconcilia la ruta de hoy, y copia el detalle del viaje desde RapiboyData | 7:15; cada 30 min de 15:00 a 23:30, lunes a sábado; y desde **Actualizar** del live tracker, antes de las posiciones |
| `11-historial-viaje.json` | Devuelve el estado y el historial de un viaje desde RapiboyData, para el asistente del tablero. Solo lee | Cada vez que alguien pregunta por un paquete en el asistente |
| `12-colectas-vivo.json` | Las colectas de hoy con su estado, su historial y la última posición de cada repartidor, y guarda cada posición nueva para dibujar el recorrido, para el mapa de **Tiendas**. Solo lee SQL Server | Cada 5 min de 7:00 a 16:55, lunes a sábado, y desde **Actualizar posiciones y estados** en Tiendas |
| `13-directorio-activos-whatsapp.json` | Sincroniza en Supabase los sellers activos de México, los drivers con reserva válida en los últimos 14 días y sus grupos de WhatsApp | 9:00 de lunes a sábado, manualmente desde n8n y desde los botones de Sellers/Drivers |
| `14-asistencia-supabase.json` | Plantilla de reemplazo: recibe el voto de la encuesta y lo registra en la plataforma; no usa Google Sheets | Webhook de votos |

## Asistencia sin Google Sheets

1. Ejecutar `web/supabase/migracion-27-asistencia.sql`. Si se instaló una
   versión inicial que guardaba `SI`/`NO`, ejecutar también la migración 28.
2. Cargar en `asistencia_contactos` la relación verificada entre cada teléfono y
   su `id_motoboy`. Esa tabla es privada: el teléfono no viaja a la pantalla ni
   queda duplicado en los votos.
3. Configurar en **n8n** `ASISTENCIA_PLATAFORMA_URL` con
   `https://TU-DOMINIO/api/asistencia/votos` y el mismo
   `ASISTENCIA_WEBHOOK_SECRET` largo y aleatorio en n8n y en la web.
4. La opción recomendada es editar el workflow activo **[MX-SD] - Asistencia**:
   reemplazar su último nodo **agregar a sheets** por el HTTP Request
   **Guardar voto en plataforma** de `14-asistencia-supabase.json`. Conserva el
   webhook `encuestacande`, que ya recibe los votos.
5. No activar el flujo 14 mientras el anterior siga activo: los dos usan
   `POST /encuestacande` y n8n solo permite un workflow activo por método y
   path. Para una transición corta se puede bifurcar desde `limpiar datos` a
   Sheets y a la plataforma; después se elimina la rama de Sheets.

El endpoint valida el secreto, normaliza el teléfono y resuelve su IdMotoboy
en Supabase. Si el teléfono no tiene vínculo, responde 422 y no inventa una
asistencia. Cada nuevo voto del mismo repartidor para la misma jornada actualiza
esa respuesta de forma atómica. Los votos permitidos son **Ruta y colecta**,
**Ruta** y **No asiste**; los drivers activos sin fila aparecen en la plataforma
como **No votó**.

Los votos históricos ya existentes en la hoja se importan una sola vez con el
mismo endpoint, enviando `idMotoboy`, `voto`, `timestamp`, `idPoll` y la
`fechaOperacion` correcta. El endpoint acepta el ID directo para esa migración
controlada; la operación diaria continúa resolviendo teléfono a ID en Supabase.

## Antes de importar

Hace falta **una credencial nueva**: `Postgres` apuntando a Supabase.

En Supabase, **Project Settings ▸ Database ▸ Connection string ▸ Session
pooler**. De ahí salen host, puerto, base, usuario y contraseña. En n8n se crea
como credencial de tipo *Postgres*, con SSL activado.

Los archivos la referencian con el id `REEMPLAZAR`: al abrir cada nodo morado
hay que elegir la credencial de la lista. Es una sola vez por nodo.

Las credenciales de SQL Server y OpenAI ya existen y se
referencian por el id que tienen hoy, así que esas se enganchan solas. El flujo
07 también necesita una credencial **Header Auth**: nombre
`X-Rapiboy-Token` y un valor largo aleatorio. El mismo valor se carga en las
opciones de la extensión; así el webhook que escribe datos no queda público.

El flujo 13 se entrega sin secretos: después de importarlo hay que seleccionar
la credencial existente de SQL Server y la credencial Postgres de Supabase en
los nodos marcados como `REEMPLAZAR`. También requiere `WAHA_API_KEY` como
variable de entorno de n8n. La guía completa está en
`DIRECTORIO-ACTIVOS.md`.

## Directorio activo y grupos de WhatsApp

`13-directorio-activos-whatsapp.json` reemplaza las hojas del workflow
`[MX - SM] - DB_Webhook - Esteban` por tablas propias de la plataforma. Antes
de importarlo se ejecutan las migraciones 17 a 25. Después de verificar una
corrida correcta se ejecuta la migración 26, que elimina los catálogos antiguos
`directorio_drivers` y `tracker_choferes`.

El snapshot consolidado de sellers se instala con las migraciones 18 y 19 en
`sellers_activos`. Los labels de soporte se resuelven desde los chats de los
labels WAHA `Cande` (id 9) y `Esteban` (id 17), no desde el endpoint inverso
por chat, que puede devolver labels operativos como `Drivers`. La migración 21
realiza la carga inicial de `soporte_asignado`; después la plataforma conserva
las correcciones manuales.

La corrida hace upsert de sellers de México y de drivers que tomaron una
reserva válida durante los últimos 14 días en `sellers_activos` y
`drivers_activos`. Los drivers conservan además el label `Drivers` y la
ubicación manual del KMZ. Después consulta WAHA, extrae el ID
de nombres como `#694864 Nombre - Vehículo` y crea la asignación solo cuando el
ID coincide con exactamente una entidad activa. Los IDs se califican por
`SELLER` o `DRIVER`, de modo que el mismo número en ambos catálogos queda
ambiguo y nunca se vincula automáticamente.

La sincronización no borra directorios: marca como inactivos los registros que
dejaron de aparecer. Tampoco reemplaza asignaciones con origen `MANUAL`. Si
WAHA no devuelve ningún grupo válido, se detiene antes del cierre y conserva
la última foto operativa.

El filtro `ReservaxMotoboy.IdUsuario = 4211` se conserva del workflow fuente.
Es una regla operativa, no el identificador de localidad; México se limita con
`IdLocalidad = 9`. Si cambia el usuario que representa esas reservas, hay que
ajustarlo en el nodo **Drivers activos ultimos 14 dias**.

## Carga desde Firefox

1. Importar `07-firefox-gestiones.json`.
2. En **Firefox**, elegir la credencial Header Auth y, en **Guardar en
   Mensual**, la misma credencial Postgres de los demás flujos.
3. Confirmar la credencial de OpenAI y activar el workflow.
4. Instalar y configurar lo que está en `../firefox-extension/README.md`.

El flujo acepta solamente IDs internos de 7 a 9 dígitos. Si la interpretación
no supera la validación, no escribe nada y la extensión pide revisión manual.
Cuando sí escribe, un campo vacío conserva lo que ya tenía el caso: cargar una
ubicación no borra el teléfono anterior. El caso queda en `NO AVISADO` y con
`editado_por` / `editado_en` actualizados.

La lectura del tablero tiene caché. Para ver la carga inmediatamente se puede
usar el botón **Actualizar**; sin hacerlo aparece sola al vencer
`SHEET_REVALIDATE`.

## Los botones Actualizar del tablero

El tablero tiene tres botones distintos y cada uno dispara sus propios flujos.
Están separados porque tardan cosas distintas: el global refresca lo que la
operación mira todo el día, y los de histórico revisan meses cerrados, que son
muchos más casos y no tiene sentido consultar cada vez que alguien abre la cola
de hoy.

| Variable del tablero | Flujo | Path del webhook |
|---|---|---|
| `N8N_WEBHOOKS` | `02-refresco-estados` | `actualizar-tablero` |
| `N8N_WEBHOOKS_HISTORICO` | `04-refresco-historico` | `actualizar-historico` |
| `N8N_WEBHOOKS_CANCELADOS_HISTORICO` | `05-refresco-cancelados-historico` | `actualizar-cancelados-historico` |
| `N8N_WEBHOOKS_COLECTAS` | `06-colectas` | `actualizar-colectas` |
| `N8N_WEBHOOKS_TRACKER_POSICIONES` | `08-tracker-drivers` | `tracker-posiciones` |
| `N8N_WEBHOOKS_TRACKER_PAQUETES` | `09-tracker-paquetes` | `tracker-paquetes` |
| `N8N_WEBHOOKS_COLECTAS_VIVO` | `12-colectas-vivo` | `colectas-en-vivo` |
| `N8N_WEBHOOKS_DIRECTORIO` | `13-directorio-activos-whatsapp` | `actualizar-directorio` |

Las de histórico pueden quedar vacías: el botón avisa que no hay flujos y la
pantalla sigue mostrando lo que ya está guardado.

### Qué recibe cada webhook

El tablero manda siempre este cuerpo:

```json
{
  "origen": "tablero",
  "momento": "2026-09-02T17:33:26.302Z",
  "alcance": "historico",
  "desde": "2026-08",
  "hasta": "2026-09"
}
```

`desde` y `hasta` son los meses del selector, y los usan los flujos 04 y 05
para acotar la consulta en vez de releer la tabla entera. Vienen en `null`
cuando el botón es el global, y ahí el filtro no se aplica.

Eso resuelve el límite que está anotado al final de este archivo: el `IN (...)`
deja de crecer con la tabla y pasa a depender del rango que se pidió.

### La columna que ningún refresco de histórico toca

Los flujos 04 y 05 leen y escriben exclusivamente `mensual_historico` y
`cancelados_historico`. **No escriben la columna que define a qué mes pertenece
el caso**: `fecha_creacion` y `fecha_colectado`, respectivamente.

No es una omisión. El tablero agrupa el histórico por esas fechas, así que
reescribirlas podría mover un caso a otro mes justo cuando alguien lo está
mirando: abrís agosto, apretás Actualizar y agosto vuelve con menos casos de
los que tenía. Ninguna de las dos cambia nunca —son el alta y la colecta—, así
que no hay nada que ganar reescribiéndolas.

El refresco diario (`02`) sí escribe `fecha_programado`, y está bien: esa fecha
se pisa en cada movimiento y es la que alimenta «hace cuánto que no se mueve».

## Rotación del día 10

### Valor del producto y Siniestrados

Los flujos 01, 02 (rama Mensual) y 04 leen
`CAST(V.ValorDeclaradoCompleto AS DECIMAL(18, 2)) AS ValorProducto` y escriben
`valor_producto`. No cambian los filtros de ingreso, las ramas de Ayer y
Cancelados ni los campos protegidos de soporte. Los valores ausentes quedan
en `null`, no en cero.

En una base ya instalada, correr primero
`web/supabase/migracion-02-valor-producto.sql` e importar después esos tres
workflows. La migración no mueve filas y hace que la rotación conserve el
importe. El flujo 02 completa los valores operativos; el 04 completa los del
período histórico seleccionado.

Para habilitar también el 70% y Cobrado, ejecutar la migración
`web/supabase/migracion-03-cobros-siniestrados.sql` (incluye la columna de valor
si aún falta). No aplicar la migración 02 después de la 03. `valor_70` es
generada por Postgres y `cobrado` es manual: ningún nodo debe escribirlas.
La rotación conserva la marca de cobro al pasar a Histórico.

En los nodos Postgres **Guardar en Mensual**, **Actualizar Mensual** y
**Guardar** del histórico, usar `Define Below` y dejar `valor_70` fuera de
Columns to Send. Solo se envía `valor_producto`. Si se incluye la columna
generada, PostgreSQL rechaza todo el upsert con
`cannot insert a non-DEFAULT value into column "valor_70"`.

Las pantallas Siniestrados usan los webhooks existentes: global para Mensual,
histórico para el rango cerrado. No requieren workflows ni tablas adicionales.

### Instalación de la rotación

Antes de importar los workflows actualizados hay que correr
`web/supabase/historico.sql`. El nodo **Rotar históricos** del flujo 01 llama la
función instalada por ese script antes de evaluar si hubo jornada:

- del día 1 al 9 no mueve nada;
- desde el día 10 archiva todo lo anterior al mes actual;
- corre también los domingos y, si una ejecución falla, vuelve a intentarlo al
  día siguiente;
- la copia y el borrado son una sola transacción, por lo que una falla no puede
  dejar filas perdidas ni a medio mover.

Los flujos 01 y 02 siguen trabajando sobre `mensual` y `cancelados`. Solo los
flujos 04 y 05 trabajan sobre las tablas históricas y mantienen el filtro
`desde` / `hasta` que manda el selector del tablero.

## El botón Actualizar global

En `02-refresco-estados.json` hay un nodo **Webhook** con el path
`actualizar-tablero`. Su *Production URL* es la única que va en `N8N_WEBHOOKS`
del tablero:

```
N8N_WEBHOOKS=https://TU-N8N/webhook/actualizar-tablero
```

Dos cosas que hacen fallar esto y son difíciles de ver:

- Tiene que ser la URL de **producción**, no la del editor (`/workflow/...`),
  que devuelve la interfaz de n8n y no ejecuta nada.
- El workflow tiene que estar **activo**. Si quedó en modo prueba, n8n responde
  404 y el tablero lo muestra como flujo fallido.

El nodo está en *Response Mode: Last Node* a propósito. El tablero espera a que
el flujo termine para recién ahí descartar su caché; con la respuesta inmediata
leería los datos viejos y los nuevos aparecerían recién al refrescar de nuevo.

La ingesta **no** tiene webhook, y es a propósito: el botón actualiza lo que ya
está en las tablas, no trae casos nuevos. Si hace falta correrla a mano, se
ejecuta desde n8n.

## Colectas

`06-colectas.json` sale del flujo `[MX - SD] - DB_Colecta`, que escribía en un
Google Sheet. Dos diferencias:

- **Escribe en Supabase, no en el sheet.** El original vaciaba la pestaña y la
  reescribía entera; acá es un upsert, así que una corrida a medias no deja la
  tabla en blanco.
- **Tiene dos ramas.** La de asignación es la consulta original con la ventana
  llevada de 15 a 30 días. La de colectas realizadas es nueva: devuelve una fila
  por día, chofer y comercio, que es lo que alimenta la vista por día.

Las dos ramas cuelgan del mismo trigger y del mismo webhook, y corren en
paralelo. Antes de la primera corrida hay que crear las tablas con
`web/supabase/colectas.sql`.

Un detalle del grano: la rama de colectas agrupa por `(fecha, chofer, comercio)`
en vez de traer cada registro suelto. Es lo que se mira —«quién fue el martes a
este comercio»— y además hace que el upsert sea idempotente sin depender de que
`dbo.Colecta` tenga un id estable, que es algo que no pudimos verificar.

## Colectas en vivo

`12-colectas-vivo.json` alimenta la pestaña **Colectas de hoy** del mapa de
Tiendas. Antes de importarlo hay que crear sus dos tablas con
`web/supabase/migracion-15-colectas-vivo.sql` y
`web/supabase/migracion-16-colectas-vivo-recorrido.sql`. Escribe **solo** sus
tres tablas —`colectas_vivo`, `colectas_vivo_drivers` y
`colectas_vivo_posiciones`— y no comparte nada con el flujo 06
ni con el live tracker, así que se puede importar, apagar o rehacer sin mirar el
resto.

Es una sola consulta a SQL Server: las colectas del día en México
(`Usuario.IdLocalidad = 9`, modalidades 5 y 7), con la tienda, el repartidor de
la colecta o de su reserva, la última posición de ese repartidor
(`Motoboy.Latitud/Longitud`) y, del historial, la primera vez que la colecta
entró a cada estado. De ahí salen tres ramas que hacen upsert: una fila por
colecta, una por repartidor y una por cada **reporte de posición nuevo** —clave
(repartidor, `posicion_en`), así que si el teléfono no volvió a reportar no se
agrega nada—. Esa última es el recorrido del mapa, porque RapiboyData no guarda
historial de posiciones; solo entran posiciones válidas reportadas ese día en
México. Después, **Recortar recorrido viejo** borra de esa tabla —y solo de esa—
lo de más de 30 días.

Tres cosas que conviene saber antes de tocarlo:

- **La zona.** RapiboyData guarda las fechas en hora de Argentina —las vistas
  del propio sistema les restan tres horas para llevarlas a México—, aunque el
  servidor corre en UTC. El nodo **Día de operación** resuelve el día en
  `America/Mexico_City` y lo convierte al reloj del sistema con `Intl` (el 21 en
  México va de las 03:00 del 21 a las 03:00 del 22), y la consulta devuelve cada
  fecha como instante con `AT TIME ZONE 'Argentina Standard Time'`. Si algún día
  la base pasara a guardar otra zona, se cambia en esos dos lugares.
- **El historial.** `HistorialColecta` es un heap de millones de filas con un
  solo índice, por `Id`. La consulta lo acota a los últimos 50.000 ids antes de
  filtrar por colecta —un día de México deja unas 5.000— y lo agrega antes de
  unirlo, para no duplicar colectas.
- **Lo que no hace.** No borra filas: la web filtra por `fecha_operacion`. No
  guarda la lista de `IdPedidos`, solo cuántos ids distintos trae. No inventa un
  nombre para `IdDeposito`, que no tiene catálogo confirmado.

El webhook recibe `{ origen, momento, alcance: "colectasVivo", dia, zona }`; el
día se valida con una expresión regular antes de usarlo y es lo único del
cuerpo que llega a la consulta.

## Live tracker

`08-tracker-drivers.json` y `09-tracker-paquetes.json` alimentan la pantalla
**Live tracker**. Antes de la primera corrida hay que crear las tablas con
`web/supabase/live-tracker.sql`. En una instalación existente, antes de
importar el flujo 09 actualizado se corren además
`web/supabase/migracion-07-tracker-detalle-sistema.sql` y
`web/supabase/migracion-08-tracker-destino-laboral.sql`.

Para congelar los pendientes de la jornada anterior, correr también
`web/supabase/migracion-09-tracker-snapshot-pendientes.sql` y agregar el nodo
Postgres **Congelar foto de pendientes de ayer** entre **Abrir sincronización**
y **Paquetes y detalle del sistema**. Su consulta es:

```sql
select public.tracker_congelar_pendientes_anteriores('{{ $json.dia }}'::date);
select '{{ $json.sync_id }}'::uuid as sync_id, '{{ $json.dia }}'::date as dia;
```

Cada flujo tiene entradas independientes que comparten la misma cadena de
nodos: uno o más horarios y un webhook, que es el botón del tablero. El flujo
de posiciones corre a las 06:45 y el de paquetes a las 07:15 para actualizar
la ruta guardada. Entre las 15:00 y las 23:30, de lunes a sábado, ambos corren
cada 30 minutos para refrescar posiciones y paquetes de la ruta actual. Las
entregas de ayer se conservan en la foto de la ruta; la actualización cambia
su estado, no el total.
Los dos workflows fijan `America/Mexico_City` en sus ajustes para que esos
horarios no dependan de la zona configurada en el servidor de n8n.

### Cómo funciona una corrida

1. **Día de operación.** Se toma el `dia` que manda el tablero, ya resuelto en
   hora de Ciudad de México. En paquetes, antes de las 15:00 es la última
   jornada operativa —los lunes toma el sábado porque el domingo no hay
   operación— y desde las 15:00 es hoy. Si el flujo arrancó por horario, se
   calcula la misma regla con `Intl`, sin restar una cantidad fija de horas.
2. **Abrir sincronización.** `tracker_abrir_sync()` toma el lock del tipo y
   devuelve un `sync_id`. Si ya hay otra corrida del mismo tipo en curso, falla
   acá y no se toca ni una fila. El lock es por tipo: posiciones y paquetes
   pueden correr a la vez.
3. **Consulta a SQL Server**, siempre de solo lectura. El flujo de paquetes
   obtiene su ficha desde `Viaje`, `Direccion`, `Poligono`, `HistorialViaje` y
   `FotoViaje`; no consulta `mensual`. `Viaje.Id` es el identificador visible
   del paquete en la web; `ReferenciaExterna` queda guardada como trazabilidad.
4. **A columnas**, que valida coordenadas y clasifica.
5. **Upsert** por `id_motoboy` o por `id_viaje`.
6. **Cerrar sincronización.** Desactiva lo que la corrida no vio y marca la
   ejecución como `success`, todo en la misma transacción.

La lista de la web muestra después solamente los repartidores que tengan al
menos un paquete activo en `tracker_paquetes`. El flujo de posiciones puede
seguir guardando otras reservas: ese filtro se hace al leer para no mezclar una
posición conocida con una ruta inexistente. El flujo de paquetes guarda también
el detalle operativo desde RapiboyData: `Viaje`, `Direccion`, `Poligono`,
`HistorialViaje` y `FotoViaje`. La web lo lee desde `tracker_paquetes`; no
consulta `mensual` ni `mensual_historico` para la ficha ni para la evidencia.
También clasifica el destino desde `Viaje.ObservacionDestino`: el prefijo
`Domicilio Laboral` marca el paquete como laboral, sin distinguir mayúsculas
ni acentos.

Si algo falla, la rama de error llama a `tracker_fallar_sync()`, que marca la
corrida como `failed` **sin tocar ningún dato**. El mapa se queda con lo último
que se supo, que es viejo pero cierto.

### Lo que hay que saber antes de tocarlos

- **La consulta de paquetes no lleva una lista de ids.** El universo son las
  reservas del día. Un `WHERE V.Id IN (...)` con los tracking id guardados
  devolvería siempre los mismos paquetes con los que arrancó la jornada, y el
  que le agregaron al repartidor a media mañana no aparecería nunca. Hay una
  prueba en `web/scripts/tracker.test.mts` que falla si alguien lo vuelve a
  poner.
- **La posición sale de `Motoboy.Latitud` / `.Longitud`.**
  `Viaje.LatitudDestino` es a dónde va el paquete. También hay prueba.
- **El punto del paquete es siempre el domicilio de entrega del viaje.**
  La web conserva `Viaje.LatitudDestino`, `Viaje.LongitudDestino` y `Viaje.Direccion`
  tal como llegan desde RapiboyData. La ubicación manual de `sellers_activos`
  solo sirve para las capas de tiendas de Colectas y Ruta y nunca reemplaza la
  parada de un paquete en el Live Tracker.
- **La zona de `Motoboy.UltimaActualizacion` es la de Argentina (UTC−3).**
  Comprobado contra la base el 2026-09-21: el servidor de SQL Server corre en
  UTC (`GETDATE()` = `GETUTCDATE()`), pero la última actualización de
  `Motoboy` y la de `HistorialViaje` iban tres horas por detrás del reloj UTC.
  Las vistas del sistema hacen lo mismo: les restan tres horas para llevarlas a
  México. Las consultas del tracker siguen declarando `@ZonaOrigen = 'UTC'` y
  el nodo **Corregir zona de posición** del flujo 08 suma las tres horas
  después; el resultado es el correcto. El flujo 12 lo resuelve en la misma
  consulta con `AT TIME ZONE 'Argentina Standard Time'`.
- **La zona de operación y la zona visible son distintas.** Los flujos y la
  web siguen usando `America/Mexico_City` para elegir el día y los cortes de
  ruta. Las horas que se muestran en la plataforma se convierten a
  `America/Argentina/Buenos_Aires` y se rotulan con `hs arg`, por ejemplo
  `13:29 hs arg`.
- **Ningún nodo lee a través del grafo.** No hay un solo `$('Otro nodo')`
  dentro de `{{ }}`, y no es casualidad: esa lectura depende de que n8n pueda
  rastrear la cadena de items hasta el nodo nombrado, y cuando la cadena se
  corta —se corta sola, por ejemplo cuando un Code node devuelve un item
  nuevo— n8n responde `Node 'X' hasn't been executed` y mata la corrida, con un
  mensaje que habla de un nodo que no tiene nada que ver. Rompió el flujo de
  paquetes mientras el de repartidores, idéntico, funcionaba.

  Cada nodo lee de su entrada directa, y lo que hace falta más abajo se
  arrastra en los datos: **Abrir sincronización** devuelve el día además del
  `sync_id`, la consulta de SQL Server pega `SyncId` y `Dia` en cada fila, y
  **Cerrar sincronización** los toma de ahí. Los dos Code nodes que sí lo usan
  lo tienen dentro de un `try/catch`, que es lo que una expresión no puede
  hacer. Hay una prueba que falla si alguien vuelve a meter uno.
- **La clasificación está escrita dos veces**: en el nodo `A columnas ·
  paquetes` y en `web/src/lib/tracker.ts`. La de n8n deja el resultado
  consultable desde SQL; la de la web se recalcula al leer porque `PROXIMO`
  depende de la ruta entera y cambia en cuanto el repartidor entrega. Si se
  cambia una regla hay que cambiar las dos, y `npm run test:tracker` compara
  las dos implementaciones sobre todas las combinaciones.
- **No hay una variable para correr la jornada a mano.** La web manda el día
  que muestra y ese valor gana en el webhook. En la entrada por horario, el
  flujo de paquetes calcula la última jornada operativa antes de las 15:00
  —sábado cuando corre un lunes— y hoy a partir de esa hora.
- Los dos se importan **apagados**, como todos.

## Historial de viaje para el asistente (beta)

`11-historial-viaje.json` lo usa la pestaña **Asistente** del tablero, que
está en beta, cada vez
que alguien pregunta por un paquete: es la primera consulta, y el tablero
cruza el resultado con lo suyo (siniestro, cobro, seguimiento). Es un webhook
que recibe `{ "id": "30543375" }` y devuelve, en la misma respuesta
(`Response Mode: Last Node`), el estado actual del viaje, su tienda y zona, y
sus últimos 60 movimientos de `HistorialViaje`.

- **Solo lee.** Una consulta a SQL Server con `NOLOCK`, sin escribir en
  ningún lado. Hay una prueba en `web/scripts/asistente.test.mts` que falla si
  aparece un `INSERT`, `UPDATE` o parecido.
- **El ID se valida antes de tocar SQL Server.** Es lo único que se interpola
  en la consulta, así que el nodo **Validar ID** exige de 5 a 12 dígitos y
  corta la corrida con cualquier otra cosa.
- **Pide token.** A diferencia de los botones Actualizar, este webhook devuelve
  datos, así que va con una credencial **Header Auth** (`ChatBot-Rapiboy-Token` y un
  valor largo aleatorio). El mismo valor va en `N8N_TOKEN_HISTORIAL_VIAJE` del
  tablero, y la Production URL en `N8N_WEBHOOK_HISTORIAL_VIAJE`.
- **Fechas.** Las del historial siguen la misma convención que los flujos 01,
  02 y 05: se les restan tres horas y viajan como texto.
- Se importa **apagado**. Para usarlo: elegir la credencial Header Auth en el
  nodo **Asistente**, confirmar la de SQL Server y activarlo.

## Lo que está apagado

`03-whatsapp-apagado.json` se importa con el workflow inactivo y con tres nodos
deshabilitados: los dos `httpRequest` que le pegan a WAHA y el que marca el caso
como avisado. Se puede abrir, revisar y hasta ejecutar a mano sin que salga
ningún mensaje.

Para prenderlo, después de las pruebas: sacar el *Disabled* de esos tres nodos y
activar el workflow.

El envío y el marcado se apagan juntos a propósito. Marcar `AVISADO` sin haber
mandado nada sacaría el caso de la cola sin que el repartidor se entere.

La API key de WAHA ya no viaja escrita en el nodo: se lee de la variable de
entorno `WAHA_API_KEY` de n8n. La que estaba hardcodeada conviene rotarla.

## Cómo funciona el ciclo de AVISO

Es la parte con más lógica, así que vale tenerla clara.

1. La ingesta de la mañana pone en `NO AVISADO` todo caso **abierto** que tenga
   datos de tienda cargados y no esté ya en ese estado.
2. A las 19:00 se le manda el mensaje al repartidor y el caso pasa a `AVISADO`.
3. Al otro día, si el paquete sigue abierto, el paso 1 lo devuelve a la cola.
4. Si cerró, nadie lo toca: conserva su `AVISADO` para siempre.

El paso 1 corre **aunque WhatsApp esté apagado**. Si no, `aviso` quedaría
siempre en nulo y el tablero mostraría cero pendientes.

Y el refresco de estados no nombra a `aviso` en su mapeo de columnas, así que no
puede pisarlo. Lo mismo vale para `reclamo_tienda`, `ubicacion` y `telefono`: el
trabajo de soporte sobrevive a las corridas. Eso es lo que el sheet no podía
garantizar, y el motivo de toda la migración.

## Lo que desapareció del flujo viejo

- **La hoja `DemoradoNoEntregado` y la rama de las 9am** que la rearmaba. El
  reclamo a los grupos ahora consulta la base con el mismo corte que usa el
  tablero, así que las dos listas no pueden discrepar.
- **`CompareIDs`**, que leía dos hojas enteras para saber qué era nuevo. Ahora
  el corte lo hacen «IDs ya vistos» y «Quitar los ya vistos» contra las cuatro
  tablas de Postgres, y la clave primaria de `mensual` queda como red por si
  algo se cuela entre la lectura y el insert.
- **El borrado de `Ayer` antes del `If`**, que los domingos la dejaba vacía todo
  el día sin volver a llenarla. Ahora va después.
- **Las fórmulas `CASO`, `DEMORA`, `AVISO`, `COPIAR` e `IDS`.** Las tres
  primeras las calcula Postgres o la web; `COPIAR` es ahora
  `informacion_enviar`, columna generada.

## Límites conocidos

Cada refresco arma un `IN (...)` con los ids de su tabla. Los históricos ya lo
acotan al período seleccionado; el refresco global queda limitado por el corte
mensual de la tabla operativa.
