-- ============================================================
--  Migración: administración de usuarios
--   - Permite al admin cambiar el rol de cualquier perfil
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

drop policy if exists "perfiles admin update" on public.profiles;
create policy "perfiles admin update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Auditoría: registra los cambios de rol
create or replace function public.auditar_cambio_rol()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_rol text;
begin
  if new.role is distinct from old.role then
    select email, role into v_email, v_rol from public.profiles where id = auth.uid();
    insert into public.auditoria (usuario_email, usuario_rol, accion, detalle)
    values (v_email, v_rol, 'rol_cambiado',
            'Usuario ' || coalesce(new.email, '') || ': ' || old.role || ' -> ' || new.role);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auditar_cambio_rol on public.profiles;
create trigger trg_auditar_cambio_rol
  after update of role on public.profiles
  for each row execute procedure public.auditar_cambio_rol();
