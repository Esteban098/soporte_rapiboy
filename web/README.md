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
- **Al navegador solo viajan agregados.** Teléfonos, domicilios y links de Maps
  no salen del servidor. Las páginas que muestran pedidos individuales lo hacen
  con id, estado, repartidor, comercio y zona: nada de datos del cliente.
- **Las columnas se leen por posición, no por nombre.** Los encabezados del
  libro no son confiables: `Junio` no tiene fila de encabezado y el de `Sep` es
  un bloque de HTML pegado desde WhatsApp. Las nueve primeras columnas, en
  cambio, están siempre en el mismo orden. `src/lib/normalizar.ts` concentra eso
  y la conversión de fechas, que llegan en `M/D/AAAA` desde el endpoint gviz.

## Secciones

| Ruta | Qué muestra |
|---|---|
| `/` | Volumen y tasa de devolución día a día del mes en curso, y las tres variables que deciden el resultado: visitas, demora y repartidor. |
| `/operacion` | La cola del día: demorados, demorados sin entregar y abiertos de ayer, con el mismo semáforo que la columna `DEMORA` de la planilla. |
| `/repartidores` | Dispersión del equipo, ranking por tasa de devolución y cuántas devoluciones evitaría llevar a los críticos a la mediana. |
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

Solo cuatro, más la de cancelaciones:

| Pestaña | Para qué |
|---|---|
| `Mensual` | Los casos del mes en curso. Es la única fuente de pedidos. |
| `Ayer` | Lo que quedó abierto del día anterior. |
| `Demorados` | Los que pasaron su fecha y siguen abiertos. |
| `DemoradoNoEntregado` | Demorados que además están sin entregar. |
| `Cancelados` | Cancelaciones de Mercado Libre. |

Las pestañas de meses anteriores quedaron como archivo y varias fueron vaciadas
o reutilizadas, así que no se leen: no son una fuente confiable de historial. Si
alguna vez cambia el nombre de la pestaña viva, se ajusta con `SHEET_TAB_MENSUAL`
sin tocar el código.

## Límites conocidos

- **No hay historial entre meses.** El sheet muestra el estado actual, así que
  el tablero muestra el mes en curso día a día. Para tener tendencia mensual hay
  que guardar una foto diaria (una GitHub Action que commitee un JSON, o una
  base de datos); todavía no está hecho.
- `Mensual` tiene que incluir los casos cerrados. Si queda filtrada solo con los
  abiertos, la tasa de recuperación se muestra en 0% porque no hay ningún
  `Entregado` con qué compararla.
- Los nombres de zona salen tal cual están cargados en el sheet, con sus
  variantes de acento y sufijo. Normalizarlos en la planilla mejora los
  rankings de `/comercios`.
- La caché es de una hora. Si el equipo actualiza el sheet y quiere verlo al
  instante, hay que bajar `SHEET_REVALIDATE`.
