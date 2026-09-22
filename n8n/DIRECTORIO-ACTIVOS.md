# Directorio activo de sellers, drivers y grupos de WhatsApp

OBJETIVO
--------
Reemplazar las hojas de Google Sheets del flujo original por tablas propias
de la plataforma en Supabase/PostgreSQL.

La sincronización incluye:
- Sellers activos de México.
- Drivers de México que tomaron al menos una reserva válida en los últimos
  14 días.
- Grupos vigentes de la sesión WAHA.
- Asociación automática de grupos cuyo nombre comience con el ID de la
  entidad, por ejemplo: #694864 Luis Javier León García - Utilitario Grande.

## Archivos

1. `../web/supabase/migracion-17-directorio-activos-whatsapp.sql`
2. `13-directorio-activos-whatsapp.json`

ORDEN DE INSTALACIÓN
--------------------
1. Ejecutar `web/supabase/migracion-17-directorio-activos-whatsapp.sql` una sola vez en el SQL
   Editor de Supabase.
2. Importar `n8n/13-directorio-activos-whatsapp.json` en n8n.
3. Seleccionar en los nodos Microsoft SQL la credencial de la base Rapiboy.
4. Seleccionar en los nodos Postgres la credencial de Supabase/plataforma.
5. Configurar WAHA_API_KEY como variable de entorno de n8n. No colocar la
   clave directamente dentro del workflow.
6. Ejecutar el flujo manualmente y revisar el resultado del último nodo.
7. Verificar los grupos que requieren revisión con:

   select *
   from public.whatsapp_grupos_diagnostico
   where estado <> 'VINCULABLE'
   order by estado, nombre_grupo;

8. Cuando la prueba sea correcta, activar el workflow. Se ejecutará a las
   09:00, hora de Ciudad de México, de lunes a sábado.

TABLAS DE LA PLATAFORMA
-----------------------
public.directorio_sellers
  Catálogo operativo de tiendas/sellers. Una fila por id_seller.

public.directorio_drivers
  Catálogo operativo de repartidores. Una fila por id_motoboy.

public.whatsapp_grupos
  Grupos obtenidos de WAHA y el ID numérico extraído del nombre.

public.whatsapp_asignaciones
  Vínculos entre seller/driver y grupo. El campo origen distingue vínculos
  AUTOMATICO y MANUAL.

public.directorio_sync_ejecuciones
  Auditoría y cantidades de cada ejecución.

VISTAS
------
public.directorio_contactos_whatsapp
  Directorio unificado que la aplicación puede consultar.

public.whatsapp_grupos_diagnostico
  Identifica grupos SIN_ID, SIN_COINCIDENCIA, VINCULABLES o AMBIGUOS.

REGLAS IMPORTANTES
------------------
- No se modifican tracker_tiendas ni tracker_choferes; son referencias
  geográficas y tienen otra finalidad.
- Un grupo se asocia automáticamente únicamente si el ID extraído coincide
  con exactamente una entidad activa.
- Seller y driver se diferencian por tipo_entidad, aunque tengan el mismo ID.
- Los vínculos MANUAL no se eliminan ni se reemplazan durante la sincronización.
- Si WAHA no devuelve grupos válidos, el flujo se detiene antes de desactivar
  registros anteriores.
- Los registros que ya no aparecen en una ejecución exitosa se conservan como
  historial con activo = false; no se borran.
- El filtro R.IdUsuario = 4211 se conserva del flujo original. Si ese ID es una
  configuración por entorno, cambiarlo en el nodo "Drivers activos ultimos 14
  dias" antes de activar el workflow.

CONSULTAS ÚTILES
----------------
Directorio activo completo:

select *
from public.directorio_contactos_whatsapp
where activo
order by tipo_entidad, nombre;

Última sincronización:

select *
from public.directorio_sync_ejecuciones
order by iniciado_en desc
limit 10;

Crear o corregir una asignación manual:

insert into public.whatsapp_asignaciones
  (tipo_entidad, id_entidad, grupo_jid, origen)
values
  ('DRIVER', 694864, 'REEMPLAZAR@g.us', 'MANUAL')
on conflict (tipo_entidad, id_entidad) do update
set grupo_jid = excluded.grupo_jid,
    origen = 'MANUAL',
    actualizado_en = now();

SEGURIDAD
---------
Las tablas tienen RLS habilitado y no se crean políticas públicas. n8n debe
conectarse con una credencial backend autorizada. La clave de WAHA y las
credenciales de las bases no están incluidas en el JSON entregado.
