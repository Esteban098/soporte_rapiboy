-- Migración 20: la distribución manual queda reemplazada por
-- sellers_activos.soporte_asignado, identificado por Usuario.Id.

begin;

drop table if exists public.tiendas_responsables;

commit;
