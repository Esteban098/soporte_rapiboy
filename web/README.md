# Tablero de Operación · México

Web con los tableros de entregas fallidas, demoras y cancelaciones. La base de
datos es el Google Sheet que el equipo ya actualiza todos los días: la app lo
lee, calcula las métricas y las muestra. No hay que cargar nada dos veces.

## Cómo está armado

```
Google Sheet  ──►  servidor Next.js  ──►  navegador
(pestañas CSV)     lee, normaliza,        solo agregados,
                   agrega y cachea        sin datos de clientes
```

Tres decisiones que vale la pena tener presentes:

- **El sheet se lee solo desde el servidor.** La URL del documento vive en una
  variable de entorno y nunca llega al navegador. Por eso el login protege de
  verdad: no hay forma de saltearlo pidiendo el CSV por afuera.
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
- **Las columnas se leen por posición, no por nombre.** Los encabezados del
  libro no son confiables: `Junio` no tiene fila de encabezado y el de `Sep` es
  un bloque de HTML pegado desde WhatsApp. Las nueve primeras columnas, en
  cambio, están siempre en el mismo orden. `src/lib/normalizar.ts` concentra eso
  y la conversión de fechas, que llegan en `M/D/AAAA` desde el endpoint gviz.

## Secciones

| Ruta | Qué muestra |
|---|---|
| `/` | **Mes en curso**: abiertos contra cerrados —la métrica principal—, el desglose de estados, los demorados, las devoluciones por día de la semana y las visitas antes de cerrar. |
| `/operacion` | **Ayer**: los casos de la pestaña `Ayer`, lo que quedó sin cerrar la jornada anterior. |
| `/demorados` | **Demorados**: las pestañas `Demorados` y `DemoradoNoEntregado`, la cola de escalamiento. |
| `/reclamos` | Casos donde la tienda aportó datos, con el dato tal cual y la información del viaje. Se filtra por avisado / no avisado. |
| `/comercios` | De dónde salen los casos y a qué zonas van. |
| `/cancelaciones` | Tiempo en ruta antes de que Mercado Libre cancele. El tablero recalcula los minutos que la hoja de 2026 dejó de calcular. |

## Correrlo local

Sin configurar nada, la app arranca con los fixtures y sin login:

```bash
npm install
npm run fixtures       # requiere XLSX=/ruta/al/libro.xlsx y pandas + openpyxl
npm run dev
```

Los fixtures se generan desde el libro real pero **sin teléfonos, domicilios ni
nombres de repartidor**: conservan los volúmenes y las fechas para que los
tableros se vean como en producción. No se versionan.

Para probar contra el sheet de verdad, copiá `.env.example` a `.env.local` y
completá `SHEET_ID`.

Comandos útiles:

```bash
npm run typecheck    # TypeScript
npm run verificar    # imprime todas las métricas por consola, contra fixtures
npm run build        # build de producción
```

## Publicar el sheet

El documento tiene que ser legible por la app. La opción más simple es
**Compartir → Cualquiera con el enlace → Lector**. Con eso alcanza: la app pide
cada pestaña por nombre al endpoint `gviz` de Google.

> Cuidado: mientras el documento esté compartido por enlace, cualquiera que
> tenga la URL puede abrirlo con todo su contenido, teléfonos incluidos. El
> login del tablero no cambia eso. Si en algún momento querés cerrarlo del todo,
> hay que pasar a una cuenta de servicio de Google Cloud; el único archivo a
> tocar es `src/lib/csv.ts`.

## Desplegar en Vercel

1. Importá el repo en Vercel y elegí `web` como **Root Directory**.
2. Cargá las variables de entorno de `.env.example`. Como mínimo: `SHEET_ID`,
   `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y una de
   `ALLOWED_EMAIL_DOMAIN` / `ALLOWED_EMAILS`.
3. En Google Cloud → Credenciales, creá un cliente OAuth de tipo *Aplicación
   web* y agregá como URI de redirección autorizada:
   `https://TU-DOMINIO/api/auth/callback/google`.

Sin `GOOGLE_CLIENT_ID` cargado, en producción no entra nadie: el ingreso falla
en vez de quedar abierto.

### Quién puede entrar

- `ALLOWED_EMAIL_DOMAIN=tuempresa.com` habilita a todo el dominio de Workspace.
- `ALLOWED_EMAILS=ana@gmail.com,juan@gmail.com` habilita cuentas sueltas.
- Se pueden usar las dos a la vez. Si no se configura ninguna, no entra nadie.

## Qué pestañas lee

Cuatro:

| Pestaña | Para qué |
|---|---|
| `Mensual` | Los casos del mes en curso. Alimenta la sección Mes en curso. |
| `Ayer` | Lo que quedó abierto del día anterior. Alimenta la sección Ayer. |
| `Demorados` | Los que pasaron su fecha y siguen abiertos. |
| `DemoradoNoEntregado` | Demorados que además siguen sin entregarse. |

Las pestañas de meses anteriores quedaron como archivo y varias fueron vaciadas
o reutilizadas, así que no se leen: no son una fuente confiable de historial. Si
alguna vez cambia el nombre de la pestaña viva, se ajusta con `SHEET_TAB_MENSUAL`
sin tocar el código.

## Tablas

Todas las tablas del proyecto usan el mismo componente (`src/components/Tabla.tsx`):

- Se ordenan haciendo clic en cualquier encabezado.
- Varias traen filtros por estado, caso o aviso.
- El menú **Columnas** deja ocultar las que no interesen, tabla por tabla.
- Las celdas de texto largo se muestran acortadas y se despliegan con un clic;
  otro clic las vuelve a acortar.

Los estados van siempre con el mismo color, definido en `src/lib/estados.ts`.

Como la tabla es un componente de cliente, las páginas le pasan filas planas
—valores serializables— y una descripción de las columnas; nunca funciones de
render, que no cruzan el límite entre servidor y cliente.

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
