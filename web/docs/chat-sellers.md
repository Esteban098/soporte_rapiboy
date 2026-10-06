# Chat de soporte para sellers

## Responsabilidades

- Next.js recibe los webhooks de Meta, valida su firma, identifica el número
  configurado, cifra los datos personales y persiste los eventos de forma
  idempotente.
- n8n procesa eventos ya persistidos, consulta RapiboyData con acceso de solo
  lectura y coordina las respuestas del bot.
- La bandeja operativa, contactos, reportes y usuarios usan las tablas de
  Supabase propias del chat. No comparten estados ni ciclo de vida con
  `seguimiento`.
- El contacto vive en `seller_chat_conversaciones`; cada apertura o reapertura
  genera un registro histórico en `seller_chat_ciclos`. Los reportes leen esos
  ciclos, por lo que un mensaje nuevo no borra las métricas del cierre anterior.
- Cuando una conversación es asignada a un operador, el servidor bloquea las
  respuestas automáticas. Al cerrarla, vuelve a estar disponible para el bot
  cuando llega un mensaje nuevo.
- El dueño puede cerrar su conversación aunque hayan vencido las 24 horas de
  respuesta. Un chat asignado solo puede eliminarlo su dueño o un administrador;
  los chats libres y cerrados pueden eliminarlos los operadores.
- Al tomar una conversación, la bandeja cambia a **Míos · Asignado**, conserva
  abierto el detalle y habilita el compositor para responder desde la plataforma.
- La bandeja usa la distribución y los colores reconocibles de WhatsApp. Enter
  envía, Shift+Enter agrega una línea y `/` abre el buscador de mensajes rápidos.
  Elegir uno lo inserta en el compositor para poder revisarlo antes de enviarlo.
- Los mensajes rápidos se administran desde la pestaña **Mensajes rápidos** y
  viven en `seller_chat_respuestas_rapidas`. El atajo es único, se escribe sin
  la barra y puede desactivarse sin borrarlo.

## Seguridad y límites

- El webhook POST valida `X-Hub-Signature-256`, `object`,
  `messaging_product` y `metadata.phone_number_id` antes de procesar un evento.
- El GET de verificación compara `META_WEBHOOK_VERIFY_TOKEN` y devuelve el
  challenge solicitado por Meta; rechaza una verificación inválida con HTTP
  403.
- Los endpoints internos `/api/whatsapp/worker/*` requieren el secreto
  compartido como Bearer. Meta y el token de envío permanecen en Next.js.
- Los teléfonos y el contenido se cifran con AES-256-GCM. El índice de
  búsqueda usa HMAC. Rotar las claves de cifrado o de índice requiere un plan
  de migración compatible con los datos existentes; no regenerarlas de forma
  aislada.
- El bot solo consulta datos del seller vinculado al contacto y el paquete
  validado. No genera SQL. Casos ambiguos, mensajes no soportados o respuestas
  inválidas deben quedar para atención humana.
- Solo se envía texto libre dentro de la ventana de atención de WhatsApp. El
  envío de plantillas aprobadas no está implementado.
- No incluir PII, payloads, firmas, tokens ni secretos en logs, capturas o
  documentación. La cuenta de SQL Server de n8n debe ser de solo lectura.

## Configuración de una instalación

1. Aplicar las migraciones que falten, en orden:
   `supabase/migracion-32-chat-sellers.sql`,
   `supabase/migracion-33-chat-sellers-estados.sql`,
   `supabase/migracion-34-chat-contactos-reportes.sql`,
   `supabase/migracion-35-chat-ciclos.sql` y
   `supabase/migracion-36-chat-respuestas-rapidas.sql`. No volver a ejecutar
   sobre una base cambios que ya se aplicaron.
2. Crear secretos independientes para las variables `WHATSAPP_*` y `META_*`
   definidas en `.env.example`. Configurarlas en Vercel Production. El secreto
   `N8N_WEBHOOK_WHATSAPP_SECRET` debe coincidir con la credencial de n8n.
3. Importar `../n8n/15-chat-sellers.json` en n8n. Configurar Header Auth para
   `Authorization: Bearer <N8N_WEBHOOK_WHATSAPP_SECRET>` en el webhook y en sus
   llamadas a Next.js. Configurar las credenciales de SQL Server y OpenAI.
4. Activar el workflow y copiar su Production URL a `N8N_WEBHOOK_WHATSAPP` en
   Vercel; desplegar de nuevo para cargar el cambio.
5. En Meta, usar `https://<dominio>/api/whatsapp/webhook`, el mismo
   `META_WEBHOOK_VERIFY_TOKEN` y suscribir el campo `messages`.
6. Validar por separado la verificación GET, la llegada de mensajes reales, la
   persistencia en la bandeja, la derivación a un operador, el envío humano, el
   cierre, la reapertura, los contactos, los mensajes rápidos y los reportes.

## Diagnóstico de recepción

La prueba sintética de Meta puede llegar al endpoint con un Phone Number ID de
ejemplo. Si no coincide con `META_WHATSAPP_PHONE_NUMBER_ID`, el handler la
omite deliberadamente con HTTP 200. Ese resultado solo confirma que el endpoint
respondió; no confirma que haya creado una conversación. El GET
`/api/whatsapp/chats` es polling de la interfaz, no un webhook de entrada.

Seguir el evento real en Meta y la invocación correspondiente en los logs de
Vercel:

- Sin una invocación POST en Vercel, el mensaje no llegó a la aplicación; n8n
  todavía no participa. Revisar los intentos de entrega del webhook en Meta y
  los eventos de Firewall/Security de Vercel.
- HTTP 401 en el POST indica que falló la validación de firma.
- HTTP 400 indica JSON inválido y HTTP 413 que el cuerpo excedió el límite.
- HTTP 503 indica que falta configurar `META_WHATSAPP_PHONE_NUMBER_ID` para
  recibir mensajes.
- HTTP 500 indica que falló el procesamiento o la persistencia.
- HTTP 200 puede ser un evento ignorado. Verificar que el payload corresponda a
  `whatsapp_business_account`, `messaging_product: whatsapp` y al Phone Number
  ID configurado. No registrar el payload para hacer esta comprobación; usar
  diagnóstico estructurado sin datos del contacto.
- Si el mensaje ya está persistido pero no hay respuesta automática, revisar el
  estado del workflow 15, sus credenciales y la respuesta de sus endpoints.
- Si al responder aparece que el token venció o fue revocado, generar un token
  vigente de WhatsApp Cloud API y reemplazar `META_WHATSAPP_ACCESS_TOKEN` en
  Vercel. El código `190` con subcódigo `463` de Meta indica expiración.

Los datos de cuenta, números de solicitud, fechas de Vercel y estados observados
durante pruebas son temporales; no se mantienen aquí como configuración.
