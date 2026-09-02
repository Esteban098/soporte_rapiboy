# Tablero de Operación · México

Web con los tableros de entregas fallidas, demoras y cancelaciones. Los casos
salen de dos tablas de Supabase que n8n rearma todos los días: la app las lee,
calcula las métricas y las muestra. No hay que cargar nada dos veces.

## Cómo está armado

```
n8n  ──►  Supabase   ──►  servidor Next.js  ──►  navegador
          mensual         lee, normaliza,        solo agregados,
          ayer            agrega y cachea        sin datos de clientes
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
| `/comercios` | De dónde salen los casos y a qué zonas van. |

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
   | `OPENAI_API_KEY` | opcional: resume los reportes de seguimiento |

   `SHEET_ID` ya no hace falta. Si se carga igual, queda como respaldo: con
   `ORIGEN_DATOS=sheet` el tablero vuelve al libro sin tocar código.

3. En Google Cloud → Credenciales, creá un cliente OAuth de tipo *Aplicación
   web* y agregá como URI de redirección autorizada:
   `https://TU-DOMINIO/api/auth/callback/google`.

La `service_role` key saltea RLS: lee y escribe las tres tablas enteras. Solo se
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

Dos roles:

| Rol | Puede |
|---|---|
| `admin` | todo el tablero, más crear perfiles, desactivarlos y resetear contraseñas |
| `operador` | todo el tablero y cambiar su propia contraseña |

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

Dos vistas, se lean de donde se lean:

| Vista | Tabla | Pestaña | Para qué |
|---|---|---|---|
| `mensual` | `mensual` | `Mensual` | Los casos del mes en curso. Alimenta Mes en curso, Demorados, Reclamos y Comercios. |
| `ayer` | `ayer` | `Ayer` | Lo que quedó abierto del día anterior. Alimenta la sección Ayer. |

No comparten esquema a propósito: `ayer` sale del sistema sin pasar por soporte,
así que no tiene reclamo, aviso ni caso. Cada tabla del tablero arma sus columnas
con los campos que su vista realmente trae, así que **agregar una columna en
Supabase alcanza para que aparezca en la web**, sin tocar código.

### Montar la base

1. Correr `supabase/schema.sql` en el SQL Editor de Supabase. Crea `mensual` y
   `ayer` con sus índices y deja RLS activo.
2. Copiar `SUPABASE_URL` y la **`service_role`** key desde Project Settings ▸ API
   a `.env.local` (o a las variables de Vercel).

### Lo que n8n tiene que hacer

Usar el nodo de **Postgres** contra el connection string de Supabase, no el nodo
de Supabase: el de Postgres tiene `Insert or Update` (upsert) y escritura en
lote, que es lo que hace falta.

La corrida diaria es un upsert por `id` que **lista solo las columnas del
sistema**:

```sql
insert into mensual (id, fecha_creacion, fecha_programado, estado,
                     repartidor, tienda, destino, poligono, visitas)
values (...)
on conflict (id) do update set
  fecha_creacion = excluded.fecha_creacion,
  fecha_programado = excluded.fecha_programado,
  estado = excluded.estado,
  repartidor = excluded.repartidor,
  tienda = excluded.tienda,
  destino = excluded.destino,
  poligono = excluded.poligono,
  visitas = excluded.visitas;
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

## Seguimiento

La única parte del tablero donde el equipo escribe texto libre. La pestaña de
abajo a la derecha está en **todas** las pantallas, porque el momento de
reportar algo casi nunca coincide con estar parado en la pantalla de reportes:
se encuentra algo raro mirando Demorados o el mes en curso.

Se carga el id del caso, un comentario y, si hace falta, fotos o archivos. El
reporte queda **abierto** hasta que alguien lo toma; al tomarlo o cerrarlo se
registra quién fue, y eso es lo que alimenta el gráfico de la sección.

Tres cosas que conviene saber:

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

Esta sección no usa el componente `Tabla`: cada fila tiene un selector que
escribe en la base, adjuntos que abrir y un comentario que se despliega, y meter
eso en la tabla común la llenaría de casos especiales de una sola pantalla.

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

- **No hay historial entre meses.** El sheet muestra el estado actual, así que
  el tablero muestra el mes en curso día a día. Para tener tendencia mensual hay
  que guardar una foto diaria (una GitHub Action que commitee un JSON, o una
  base de datos); todavía no está hecho.
- **La columna `AVISO` no sirve para medir avisos.** Se calcula con
  `=IF(RECLAMO TIENDA <> ""; "NO AVISADO"; "")`, así que marca como pendiente
  todo caso con datos cargados y nada la vuelve a poner en blanco cuando el
  aviso se manda. El tablero lo muestra, pero el número es igual al de casos con
  reclamo. Para que mida algo hace falta una casilla que soporte marque al avisar.
- `Mensual` tiene que incluir los casos cerrados. Si queda filtrada solo con los
  abiertos, la tasa de recuperación se muestra en 0% porque no hay ningún
  `Entregado` con qué compararla.
- Los nombres de zona salen tal cual están cargados en el sheet, con sus
  variantes de acento y sufijo. Normalizarlos en la planilla mejora los
  rankings de `/comercios`.
- La caché es de una hora. Si el equipo actualiza el sheet y quiere verlo al
  instante, hay que bajar `SHEET_REVALIDATE`.
