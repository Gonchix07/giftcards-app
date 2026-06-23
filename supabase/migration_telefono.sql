-- ============================================================
--  Migración: teléfono del cliente (opcional)
--  Ejecutar en Supabase -> SQL Editor -> Run.
--  El email pasa a ser obligatorio desde la app (no se fuerza en la base
--  para no romper clientes existentes sin email).
-- ============================================================

alter table public.clientes add column if not exists telefono text;
