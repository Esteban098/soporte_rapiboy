-- Detalle de Viaje para el modal del Live Tracker.
--
-- El flujo 09 lo llena desde RapiboyData (Viaje, Direccion, Poligono,
-- HistorialViaje y FotoViaje). Así el mapa no depende de Mensual para mostrar
-- el estado, el destinatario ni la evidencia.
begin;

alter table public.tracker_paquetes
  add column if not exists referencia_auxiliar text,
  add column if not exists id_usuario bigint,
  add column if not exists tienda text,
  add column if not exists telefono text,
  add column if not exists ciudad text,
  add column if not exists barrio text,
  add column if not exists codigo_postal text,
  add column if not exists observacion_direccion text,
  add column if not exists poligono text,
  add column if not exists nombre_recibe text,
  add column if not exists comentario_motoboy text,
  add column if not exists comentario_estado text,
  add column if not exists motivo_no_entregado text,
  add column if not exists motivo_no_devuelto text,
  add column if not exists evidencia_foto text,
  add column if not exists evidencia_tipo text,
  add column if not exists fecha_evidencia timestamptz;

commit;
