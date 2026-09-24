-- Migración 26: retirar los catálogos reemplazados por drivers_activos.
-- Ejecutar después de correr al menos una vez el workflow 13 actualizado y
-- comprobar que drivers_activos contiene los drivers esperados.

begin;

drop table if exists public.directorio_drivers;
drop table if exists public.tracker_choferes;

commit;
