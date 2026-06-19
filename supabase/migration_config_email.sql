-- ============================================================
--  Migración: plantilla de email editable (sección Mails)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.config_email (
  id int primary key default 1,
  asunto text not null default 'Tu Gift Card {codigo}',
  titulo text not null default '🎁 Tu Gift Card de {empresa}',
  intro text not null default 'Hola {nombre}, te enviamos tu Gift Card.',
  instrucciones text not null default 'Presentá este código o el QR adjunto en la caja para usar tu saldo (podés usarlo en compras parciales).',
  updated_at timestamptz not null default now(),
  constraint config_email_unica check (id = 1)
);

insert into public.config_email (id) values (1) on conflict (id) do nothing;

alter table public.config_email enable row level security;

drop policy if exists "config_email select" on public.config_email;
create policy "config_email select" on public.config_email
  for select using (true);

drop policy if exists "config_email admin" on public.config_email;
create policy "config_email admin" on public.config_email
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
