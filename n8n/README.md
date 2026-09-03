# Flujos de n8n

Siete workflows. Los tres primeros reemplazan al único que escribía en el
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

## Antes de importar

Hace falta **una credencial nueva**: `Postgres` apuntando a Supabase.

En Supabase, **Project Settings ▸ Database ▸ Connection string ▸ Session
pooler**. De ahí salen host, puerto, base, usuario y contraseña. En n8n se crea
como credencial de tipo *Postgres*, con SSL activado.

Los archivos la referencian con el id `REEMPLAZAR`: al abrir cada nodo morado
hay que elegir la credencial de la lista. Es una sola vez por nodo.

Las credenciales de SQL Server, Google Sheets y OpenAI ya existen y se
referencian por el id que tienen hoy, así que esas se enganchan solas. El flujo
07 también necesita una credencial **Header Auth**: nombre
`X-Rapiboy-Token` y un valor largo aleatorio. El mismo valor se carga en las
opciones de la extensión; así el webhook que escribe datos no queda público.

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
  lo resuelve la clave primaria con *Skip on Conflict*.
- **El borrado de `Ayer` antes del `If`**, que los domingos la dejaba vacía todo
  el día sin volver a llenarla. Ahora va después.
- **Las fórmulas `CASO`, `DEMORA`, `AVISO`, `COPIAR` e `IDS`.** Las tres
  primeras las calcula Postgres o la web; `COPIAR` es ahora
  `informacion_enviar`, columna generada.

## Límites conocidos

Cada refresco arma un `IN (...)` con los ids de su tabla. Los históricos ya lo
acotan al período seleccionado; el refresco global queda limitado por el corte
mensual de la tabla operativa.
