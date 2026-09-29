-- Reemplaza las alertas históricas de demora por paquete por el formato
-- agrupado por estado. Las nuevas alertas se recrean automáticamente al abrir
-- la campana.

begin;

delete from public.notificaciones
where tipo = 'demora_paquete'
  and clave like 'demora-paquete:%';

commit;
