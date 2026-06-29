-- ============================================================
--  Migración: template PNG y posición QR por comercio
--  Ejecutar en Supabase → SQL Editor → Run.
-- ============================================================

-- Template PNG de la tarjeta (URL pública en Storage)
alter table public.comercios add column if not exists template_url text;

-- Posición del QR sobre el template: 'izquierda' | 'derecha'
alter table public.comercios add column if not exists qr_posicion text not null default 'izquierda';
