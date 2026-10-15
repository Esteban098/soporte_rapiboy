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
4. Confirmar la zona `America/Mexico_City`, probar manualmente y activar. Corre
   cada 10 minutos de 15:00 a 22:50 y por última vez a las 23:00. La limpieza
   corre a las 23:15.
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

Se envía una imagen por llamada, con detalle `low`, JSON estricto y hasta 180
tokens de salida. Antes se aplican deduplicación, máximo configurable por
corrida, allowlist HTTPS, límite de bytes y MIME JPEG/PNG/WebP. Se guardan los
tokens de entrada/salida para medir consumo, no el contenido. El costo se puede
limitar bajando `maximo_por_corrida` o eligiendo otro
`OPENAI_MODELO_EVIDENCIAS` compatible.

`DUDOSA` señala una debilidad visual o falta de contexto probatorio; no demuestra
fraude ni una entrega incorrecta. Soporte confirma, descarta o marca inconclusa.
No se avisa al comprador, seller o driver, ni se aplican sanciones automáticas.

### Criterio de valor probatorio

La clasificación no exige una foto perfecta. Es **aceptable** si se distingue
al menos una prueba de la entrega: una persona que recibe o sostiene el
paquete, un chat de confirmación o registro de llamada, o el domicilio/fachada
o su numeración claramente identificable. Una escena con ese contexto no debe
marcarse dudosa solo por iluminación baja, desenfoque leve o encuadre imperfecto.

Es **dudosa** si solo muestra el paquete o su etiqueta (`SOLO_PAQUETE`), si no
hay contexto que vincule la entrega (`SIN_CONTEXTO_DE_ENTREGA`), o si el único
contexto probatorio es demasiado oscuro, borroso, cortado o ilegible. El modelo
no transcribe ni repite nombres, teléfonos, direcciones ni textos de chats.

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
