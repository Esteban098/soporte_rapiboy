# Flujos de n8n

Tres workflows que reemplazan al único que escribía en el Google Sheet. Se
importan desde n8n con **Workflows ▸ Import from File**.

| Archivo | Qué hace | Cuándo corre |
|---|---|---|
| `01-ingesta-diaria.json` | Trae los casos fallidos del día y los cancelados, y reabre la cola de avisos | 8:00, todos los días menos domingo |
| `02-refresco-estados.json` | Vuelve a preguntarle a SQL Server en qué estado están los casos que ya tenemos | 6:00, 15:13, 18:55 y cada vez que alguien toca **Actualizar** en el tablero |
| `03-whatsapp-apagado.json` | Avisa al repartidor y reclama a los grupos | **Apagado.** Ver más abajo |

## Antes de importar

Hace falta **una credencial nueva**: `Postgres` apuntando a Supabase.

En Supabase, **Project Settings ▸ Database ▸ Connection string ▸ Session
pooler**. De ahí salen host, puerto, base, usuario y contraseña. En n8n se crea
como credencial de tipo *Postgres*, con SSL activado.

Los tres archivos la referencian con el id `REEMPLAZAR`: al abrir cada nodo
morado hay que elegir la credencial de la lista. Es una sola vez por nodo.

Las credenciales de SQL Server, Google Sheets y OpenAI ya existen y se
referencian por el id que tienen hoy, así que esas se enganchan solas.

## El botón Actualizar del tablero

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

El refresco arma un `IN (...)` con todos los ids de la tabla. Con los volúmenes
de hoy funciona, pero es la parte que primero va a molestar cuando `mensual`
crezca: conviene partirlo en tandas antes de llegar a los ~10.000 casos.
