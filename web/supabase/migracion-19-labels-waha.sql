-- Migración 19: labels de WhatsApp asociados al grupo del seller.
-- El responsable oficial continúa viviendo en sellers_activos.soporte_asignado.

begin;

alter table public.whatsapp_grupos
  add column if not exists labels_waha jsonb not null default '[]'::jsonb;

create index if not exists whatsapp_grupos_labels_idx
  on public.whatsapp_grupos using gin (labels_waha);

commit;
