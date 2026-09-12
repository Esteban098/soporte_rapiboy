-- Clasificación explícita del destino para el Live Tracker.
-- El flujo 09 toma el dato de Viaje.ObservacionDestino en RapiboyData.
begin;

alter table public.tracker_paquetes
  add column if not exists es_laboral boolean not null default false;

commit;
