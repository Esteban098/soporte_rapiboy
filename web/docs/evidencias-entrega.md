# Revisión de evidencias de entrega · México

## Fuentes verificadas

El flujo 19 busca exclusivamente fotografías no vacías de
`dbo.HistorialViaje.Foto` cuyo propio evento ocurrió ese día en México. Enlaza
`HistorialViaje.IdViaje -> Viaje.Id` y `Viaje.IdUsuario -> Usuario.Id`, filtra
`Usuario.IdLocalidad = 9` y `Usuario.IdModalidad IN (5, 7)`. No exige
`Entregado`: admite cualquier estado excepto `Cancelado` y deduplica una misma
URL dentro del viaje. `FotoViaje.Foto` y `Viaje.Foto` se excluyen porque no
permiten demostrar que la fotografía haya sido cargada ese día.

La consulta arma primero `#ViajesHoy` con `Viaje.FechaProgramado` dentro del día
mexicano y los sellers de la operación. Crea un índice temporal por viaje y
busca su historial mediante `IX_HistorialViaje_IdViaje`, con `INNER LOOP JOIN`.
Después filtra la fecha UTC del evento, `IdEstado <> 14` y foto no vacía. La
consulta conserva una foto por URL y viaje; el nodo Code vuelve a deduplicar
mediante una huella técnica antes de aplicar `maximo_por_corrida`.

El driver se obtiene desde la asignación histórica del propio evento:
`HistorialViaje.IdReserva -> ReservaxMotoboy.IdMotoboy -> Motoboy.Id`. Si esa
reserva no permite mostrar el nombre, se usa `HistorialViaje.Repartidor` solo
como texto de respaldo. Nunca se consulta `Viaje.IdReserva` ni la asignación
actual del viaje.

## Instalación

1. Ejecutar `supabase/migracion-38-evidencias-entrega.sql` en Supabase. En una
   instalación que ya la ejecutó, aplicar después
   `supabase/migracion-41-evidencias-valor-probatorio.sql` y
   `supabase/migracion-45-evidencias-reabrir.sql` y
   `supabase/migracion-48-evidencias-geografia.sql` y
   `supabase/migracion-49-evidencias-visitas-domicilio.sql`.
   Orden del cambio geográfico: migraciones 48 y 49, despliegue de la web y, por último,
   importar el flujo 19 actualizado. No actualizar el flujo activo antes.
   La RPC nueva debe permitir ejecución solo a `service_role`: se revocan
   explícitamente `PUBLIC`, `anon` y `authenticated`, porque los permisos
   predeterminados de Supabase pueden otorgar acceso directo a esos roles.
2. Configurar `OPENAI_API_KEY`, `EVIDENCIAS_WEBHOOK_SECRET`,
   `OPENAI_MODELO_EVIDENCIAS`, `EVIDENCIAS_ORIGEN_HOSTS` y
   `EVIDENCIAS_MAX_BYTES`. `EVIDENCIAS_ORIGEN_HOSTS` debe contener el host real
   de `HistorialViaje.Foto`; para Rapiboy es `files.rapiboy.com`. El secreto debe
   ser aleatorio y no puede ser la `SUPABASE_SERVICE_KEY`.
3. Importar `n8n/19-revision-evidencias-entrega.json`, seleccionar las
   credenciales existentes de SQL Server y Supabase, y crear una credencial
   n8n `HTTP Header Auth` llamada `Evidencias · bearer privado`, con nombre de
   header `Authorization` y valor `Bearer <EVIDENCIAS_WEBHOOK_SECRET>`. El
   servidor bloquea `$env` dentro de nodos, por lo que el secreto no debe
   escribirse directamente en el workflow.
4. Confirmar la zona del workflow `America/Argentina/Buenos_Aires`, probar
   manualmente y activar. Los cron argentinos equivalen a cada 10 minutos de
   15:00 a 22:50 de México y una última vez a las 23:00. La limpieza corre a
   las 23:15 de México.
5. Mantener `OBSERVACION` inicialmente. Revisar una muestra y medir falsos
   positivos antes de pasar a `ACTIVO` desde `/evidencias`.

## Reintentos, privacidad y retención

La RPC de reclamo deduplica atómicamente la clave de origen de cada foto. Antes
de aplicar el máximo por corrida, n8n consulta las claves terminales que ya
están guardadas; así un lote grande se continúa en las corridas siguientes sin
quedar bloqueado por las primeras filas. Los errores usan
backoff y hasta cuatro intentos; una ejecución abandonada se retoma después de
20 minutos. Fuera de la ventana el endpoint no reclama ni analiza, y el caso
queda para la próxima ventana.

La copia privada y la fila operativa vencen a los siete días. La limpieza borra
primero el objeto y después la fila; nunca modifica la evidencia original. El
historial durable guarda solo driver, viaje, fechas, tipo de problema y decisión
humana y una clave técnica de origen para impedir análisis repetidos: ninguna
imagen, ruta o URL. No deben registrarse cuerpos HTTP, fotos,
URLs de evidencia o secretos. Los enlaces de vista previa vencen en 15 minutos.
La bandeja muestra por defecto solo los pendientes cuya evidencia pertenece al
día operativo actual de México. Los pendientes de jornadas previas siguen
disponibles en un desplegable separado hasta que se revisen o venza su retención;
el historial no vuelve a exponer imágenes.

## Modelo, costo y decisión humana

Cada imagen se evalúa primero con detalle `low`, JSON estricto y hasta 180
tokens de salida. Solo cuando esa primera pasada devuelve `DUDOSA` se hace una
segunda evaluación independiente con detalle `high`; la alerta se conserva
únicamente si esa verificación también la considera dudosa. Antes se aplican
deduplicación, máximo configurable por corrida, allowlist HTTPS, límite de bytes
y MIME JPEG/PNG/WebP. Se guardan los
tokens acumulados de ambas llamadas para medir consumo, no el contenido. Así el
costo de alta resolución se paga solo en posibles alertas. El costo se puede
limitar bajando `maximo_por_corrida` o eligiendo otro
`OPENAI_MODELO_EVIDENCIAS` compatible.

`DUDOSA` señala que la imagen completa no permite reconocer una evidencia útil;
no demuestra fraude ni una entrega incorrecta. Soporte confirma, descarta o marca inconclusa.
No se avisa al comprador, seller o driver, ni se aplican sanciones automáticas.

Cada decisión se guarda al pulsar su botón, sin una segunda confirmación. Las
últimas 50 revisadas permanecen visibles mientras su copia operativa exista y
pueden volver a pendientes durante esos siete días. Cada revisión y reapertura
queda registrada en `evidencias_entrega_decisiones`, sin fotografía ni URL; así
corregir un clic accidental no elimina la trazabilidad.

### Criterio de utilidad visual

La clasificación no exige que la imagen demuestre una entrega. Es **aceptable**
si permite reconocer un paquete o etiqueta, un chat, una captura de Mercado
Libre, un registro o pantalla de llamada, o un domicilio, fachada, puerta o
acceso. En chats, Mercado Libre y llamadas basta reconocer el tipo de captura:
el texto puede ser ilegible o estar cortado y no necesita mencionar una
entrega. Un domicilio visible también es suficiente sin numeración, persona o
paquete.

La poca luz, el desenfoque y el recorte solo vuelven la evidencia **dudosa**
cuando son tan severos que impiden reconocer cualquier elemento útil. No se
exige contexto de entrega ni una persona receptora. El modelo no transcribe ni
repite nombres, teléfonos, direcciones ni textos de chats. Los motivos
`SOLO_PAQUETE` y `SIN_CONTEXTO_DE_ENTREGA` se conservan únicamente para leer el
historial anterior; el clasificador nuevo ya no puede generarlos.

Las muestras locales clasificadas por operación se usaron para calibrar este
criterio; no se suben a Supabase, n8n ni al historial de producción.

## Validación geográfica

La revisión visual sigue evaluándose por separado. El flujo 19 agrega
`HistorialViaje.Latitud/Longitud` del **mismo evento que contiene la foto**,
el nombre del estado de ese evento y `Viaje.LatitudDestino/LongitudDestino`.
Estos campos ya se usan en las consultas del tracker. No se ha realizado una
consulta nueva contra SQL Server para este cambio: debe validarse una corrida
manual del flujo antes de activarlo. No se usa la posición actual de Motoboy,
EXIF ni geocodificación externa; el GPS histórico es una señal, no una prueba
de presencia ni de precisión del dispositivo.

El servidor calcula la distancia en línea recta y la RPC de finalización
consulta por ID Mensual e Histórico. Si cualquiera tiene **ubicación o teléfono
no vacío**, guarda `OMITIDA_DATOS_TIENDA` sin distancia; un reclamo tipificado
sin esos datos no provoca la omisión, igual que `tieneDatosTienda` en la web.
La presencia del ID, por sí sola, no impide comparar; no hace falta que el
paquete esté registrado en esas tablas.

Se compara cuando el evento de la foto se llama **Entregado**, o cuando ese
mismo evento tiene **`HistorialViaje.VisitadoMotoboy = 1`**, aunque no haya
terminado entregado. No se usa `Viaje.VisitadoMotoboy`, porque una visita
posterior no debe convertir retroactivamente otro evento en una visita.
Los eventos sin esa condición quedan `NO_ES_ENTREGA` (etiqueta «sin visita
evaluable» por compatibilidad), los pares ausentes/inválidos o `(0,0)` quedan
`SIN_COORDENADAS`, y las entradas del flujo anterior sin el objeto geográfico
quedan `NO_EVALUADA`. No se infiere una entrega fallida por falta de GPS.

El radio operativo es **2.000 metros**, ajustable por admin entre 50 y 5.000 en
Configuración. Una distancia igual al límite está dentro. El radio aplicado y
el resultado quedan guardados; cambiarlo no recalcula evaluaciones antiguas.
`FUERA_DEL_RANGO` genera revisión humana incluso con una foto visualmente
aceptable; no cambia `calidad_modelo`, no notifica automáticamente a terceros
ni afecta el score hasta que se confirma el problema según la regla existente.
El cálculo no usa OpenAI ni le envía coordenadas. Finalizar foto y geografía
ocurre en la misma transacción; errores al consultar información de tienda
interrumpen el guardado y permiten reintentar, no se interpretan como ausencia.

Las tarjetas pendientes/revisadas muestran el resultado. El desplegable de
geografía presenta las últimas 50 procesadas con retención vigente en una
tabla ordenable y compacta. El historial durable guarda únicamente resultado,
distancia y radio: **ninguna coordenada**, dirección ni teléfono. Las filas
anteriores a la migración no se reanalizan ni generan alertas retroactivas.

La migración 49 conserva la RPC 48 para clientes anteriores y añade
`evidencia_entrega_finalizar_visita`. En la fila operativa guarda el domicilio
de `Viaje.Direccion`, el nombre del estado y la marca de visita del evento.
Estos datos vencen junto con la fila a los siete días; **el historial durable
no guarda domicilios**. En entradas anteriores sin domicilio se consulta por
lotes el ID en `tracker_paquetes` y, si hay dirección, se muestra como
**referencia actual del tracker**: no se presenta como dato histórico ni se
usa su GPS, estado o visita para recalcular. Sin coincidencia se indica no
informado, sin inventar ni geocodificar direcciones.

La pantalla se organiza en Pendientes (hoy por defecto, anteriores opcionales),
Coordenadas (últimas 50 procesadas), Revisadas (últimas 50) y Drivers (score
30 días). La búsqueda por ID/driver/domicilio/estado y el filtro por alerta
visual, geográfica o ambas se comparten entre las tres primeras vistas. Las
tarjetas muestran foto completa sin recorte, domicilio, estado del evento y
dos señales separadas; confirman cada decisión antes de guardar. Los IDs de
tarjetas y tablas abren el operador Rapiboy en una nueva pestaña. Listas de
tarjetas y tablas comienzan con hasta diez filas; se amplían a pedido. Las
explicaciones extensas y la configuración quedan plegadas.

Pruebas: `npm run test:evidencias` verifica distancia, puntos inválidos y el
contrato del flujo. `scripts/evidencias-geografia-sql.test.mts` prueba la
migración real en PostgreSQL en memoria sin credenciales de Supabase:
instalar `@electric-sql/pglite` en un directorio temporal y ejecutar desde
`web/` con `PGLITE_MODULE=<directorio>/node_modules/@electric-sql/pglite/dist/index.js
node --import tsx scripts/evidencias-geografia-sql.test.mts`. Cubre
idempotencia, omisiones, límite exacto, cambio de radio, rollback, permisos,
no entregados visitados/no visitados y retención del domicilio solo operativa.

## Score

La ventana móvil es de 30 días y solo usa casos del modo activo con driver
resuelto:

`proporción mala = confirmadas por soporte / total de evidencias analizadas`

`score de calidad = 100 × (1 - proporción mala)`

El numerador nunca incluye una duda sin confirmación. El score se oculta hasta
alcanzar `minimo_muestra_score` (20 por defecto). El historial mínimo se conserva
para auditoría. Los casos capturados en observación no alimentan el score.

## Validación humana antes de activar

- Confirmar que `HistorialViaje.IdReserva` esté poblado en todos los eventos que
  contienen una foto; cuando falte, el caso queda sin ID de driver y no entra al
  score aunque pueda mostrar `HistorialViaje.Repartidor` como respaldo.
- Confirmar que `HistorialViaje.Fecha` representa el momento en que se creó el
  evento que contiene `HistorialViaje.Foto`. No se usan fotos persistentes de
  `FotoViaje` o `Viaje.Foto` para completar huecos.
- Validar la allowlist real de hosts de fotos.
- Medir falsos positivos por tipo y revisar la confianza informada por el
  modelo. En modo activo toda foto clasificada como dudosa genera alerta.
- Auditar una muestra de aceptables para medir falsos negativos.
- Acordar el uso informativo del score y la ausencia de sanciones automáticas.
