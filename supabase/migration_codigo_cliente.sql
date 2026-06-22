-- ============================================================
--  Migración: código de cliente (alfanumérico, 5 caracteres, opcional)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

alter table public.clientes add column if not exists codigo_cliente text;

alter table public.clientes drop constraint if exists clientes_codigo_cliente_check;
alter table public.clientes
  add constraint clientes_codigo_cliente_check
  check (codigo_cliente is null or codigo_cliente ~ '^[A-Za-z0-9]{5}$');

-- Único (los NULL no cuentan: varios clientes pueden quedar sin código)
alter table public.clientes drop constraint if exists clientes_codigo_cliente_key;
alter table public.clientes
  add constraint clientes_codigo_cliente_key unique (codigo_cliente);
