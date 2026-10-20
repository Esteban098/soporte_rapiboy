-- Ejecutar después de desplegar la versión que ya usa solo comentario_original.
-- Elimina únicamente resúmenes automáticos antiguos; conserva los reportes,
-- comentarios originales, adjuntos, responsables y estados.
alter table public.seguimiento drop column if exists resumen_llm;
