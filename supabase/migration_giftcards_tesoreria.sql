-- ============================================================
--  Migración: habilita al rol tesoreria la gestión de gift cards
--  La página GiftCards hace insert (emisión individual/masiva),
--  update (asignar cliente, anular) y delete sobre public.giftcards.
--  Correr en Supabase SQL Editor.
-- ============================================================

create or replace function public.is_tesoreria()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tesoreria');
$$;

drop policy if exists "giftcards tesoreria" on public.giftcards;
create policy "giftcards tesoreria" on public.giftcards
  for all to authenticated using (public.is_tesoreria()) with check (public.is_tesoreria());
