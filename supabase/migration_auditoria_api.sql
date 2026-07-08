-- ============================================================
--  Migración: auditoría de altas por API
--
--  Las altas de clientes y gift cards vía las REST API externas
--  (api/clientes.js y api/giftcards.js) usan la service_role key,
--  por lo que auth.uid() es null. En ese caso el trigger de
--  giftcards registraba la 'creacion' sin usuario_email.
--
--  Ahora ambas API insertan su propio movimiento de auditoría con
--  la atribución del admin llamante. Para evitar un registro
--  duplicado en gift cards, el trigger omite el alta automática
--  cuando no hay auth.uid (creación por service role / API).
--
--  Las altas desde el front (usuario autenticado, con auth.uid)
--  siguen registrándose por el trigger, sin cambios.
--
--  Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- ============================================================

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_rol text;
  v_accion text;
  v_codigo text;
  v_empresa text;
  v_cliente text;
  v_detalle text;
begin
  select email, role into v_email, v_rol from public.profiles where id = auth.uid();

  if (tg_op = 'INSERT') then
    -- Las altas por API (service role, sin auth.uid) registran su propia
    -- auditoría con la atribución del admin llamante. Evitamos el duplicado.
    if auth.uid() is null then
      return new;
    end if;
    v_codigo := new.codigo;
    v_accion := 'creacion';
    v_detalle := 'Monto máximo ' || new.monto_max ||
                 case when new.cliente_id is not null then ' (asignada al crear)' else '' end;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

  elsif (tg_op = 'UPDATE') then
    v_codigo := new.codigo;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

    if (new.cliente_id is distinct from old.cliente_id and old.cliente_id is null) then
      v_accion := 'asignacion';
      v_detalle := 'Cliente asignado: ' || coalesce(v_cliente, '');
    elsif (new.estado = 'anulada' and old.estado <> 'anulada') then
      v_accion := 'anulacion';
      v_detalle := 'Gift card anulada';
    elsif (new.saldo is distinct from old.saldo) then
      v_accion := 'uso';
      v_detalle := 'Saldo ' || old.saldo || ' -> ' || new.saldo;
    else
      v_accion := 'modificacion';
      v_detalle := 'Modificación de datos';
    end if;

  elsif (tg_op = 'DELETE') then
    v_codigo := old.codigo;
    v_accion := 'eliminacion';
    v_detalle := 'Gift card eliminada';
    select nombre into v_empresa from public.empresas where id = old.empresa_id;
  end if;

  insert into public.auditoria (usuario_email, usuario_rol, accion, giftcard_codigo, empresa, cliente, detalle)
  values (v_email, v_rol, v_accion, v_codigo, v_empresa, v_cliente, v_detalle);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;
