# Revisión de evidencias de entrega · México

## Fuentes verificadas

El flujo 17 busca exclusivamente fotografías no vacías de
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
   `supabase/migracion-41-evidencias-valor-probatorio.sql`.
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
