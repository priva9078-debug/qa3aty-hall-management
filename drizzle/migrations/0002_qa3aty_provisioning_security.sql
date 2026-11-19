CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(_user_id UUID, _username TEXT, _full_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE created_profile_id UUID;
BEGIN
  IF lower(trim(_username)) <> 'ahmed.elshora' THEN
    RAISE EXCEPTION 'BOOTSTRAP_USERNAME_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'BOOTSTRAP_ALREADY_COMPLETED' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.profiles (user_id, tenant_id, username, full_name, is_active)
  VALUES (_user_id, NULL, lower(trim(_username)), trim(_full_name), true)
  RETURNING user_id INTO created_profile_id;
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (created_profile_id, NULL, 'super_admin'::public.app_role);
  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (created_profile_id, 'super_admin.bootstrapped', 'profile', created_profile_id,
    jsonb_build_object('username', lower(trim(_username)), 'full_name', trim(_full_name)));
  RETURN created_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_tenant_bundle(
  _actor_user_id UUID,
  _admin_user_id UUID,
  _username TEXT,
  _full_name TEXT,
  _tenant_name TEXT,
  _primary_hall_name TEXT,
  _phone TEXT,
  _tenant_status TEXT,
  _plan TEXT,
  _starts_at TIMESTAMPTZ,
  _ends_at TIMESTAMPTZ,
  _subscription_price NUMERIC,
  _notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE created_tenant_id UUID; created_subscription_id UUID; subscription_status TEXT;
BEGIN
  IF _tenant_status NOT IN ('active', 'suspended') OR _plan NOT IN ('monthly', 'yearly', 'custom') OR _ends_at <= _starts_at OR _subscription_price < 0 THEN
    RAISE EXCEPTION 'INVALID_TENANT_SUBSCRIPTION_INPUT' USING ERRCODE = '22023';
  END IF;
  IF lower(trim(_username)) !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'INVALID_USERNAME' USING ERRCODE = '22023';
  END IF;
  subscription_status := CASE WHEN _tenant_status = 'active' THEN 'active' ELSE 'suspended' END;
  INSERT INTO public.tenants (name, primary_hall_name, phone, status, notes, created_by)
  VALUES (trim(_tenant_name), trim(_primary_hall_name), nullif(trim(_phone), ''), _tenant_status, nullif(trim(_notes), ''), _actor_user_id)
  RETURNING id INTO created_tenant_id;
  INSERT INTO public.profiles (user_id, tenant_id, username, full_name, phone, is_active)
  VALUES (_admin_user_id, created_tenant_id, lower(trim(_username)), trim(_full_name), nullif(trim(_phone), ''), _tenant_status = 'active');
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_admin_user_id, created_tenant_id, 'tenant_admin'::public.app_role);
  INSERT INTO public.tenant_settings (tenant_id) VALUES (created_tenant_id);
  INSERT INTO public.subscriptions (tenant_id, plan, status, starts_at, ends_at, price, notes, created_by)
  VALUES (created_tenant_id, _plan, subscription_status, _starts_at, _ends_at, _subscription_price, nullif(trim(_notes), ''), _actor_user_id)
  RETURNING id INTO created_subscription_id;
  INSERT INTO public.subscription_history (tenant_id, subscription_id, action, new_ends_at, details, actor_user_id)
  VALUES (created_tenant_id, created_subscription_id, 'created', _ends_at,
    jsonb_build_object('plan', _plan, 'status', subscription_status), _actor_user_id);
  INSERT INTO public.expense_categories (tenant_id, name, is_default)
  VALUES (created_tenant_id, 'Electricity', true), (created_tenant_id, 'Water', true),
    (created_tenant_id, 'Fuel', true), (created_tenant_id, 'Transportation', true),
    (created_tenant_id, 'Maintenance', true), (created_tenant_id, 'Cleaning', true),
    (created_tenant_id, 'Supplies', true), (created_tenant_id, 'Other', true);
  INSERT INTO public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (created_tenant_id, _actor_user_id, 'tenant.created', 'tenant', created_tenant_id,
    jsonb_build_object('name', trim(_tenant_name), 'username', lower(trim(_username)), 'plan', _plan));
  RETURN created_tenant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_tenant_bundle(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_bundle(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, TEXT) TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT, UPDATE (full_name, phone) ON public.profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT INSERT (tenant_id, hall_id, customer_id, event_name, event_type, event_date, start_time, end_time, total_price, advance_payment, status, drinks_cake_responsibility, notes, created_by) ON public.bookings TO authenticated;
GRANT UPDATE (hall_id, customer_id, event_name, event_type, event_date, start_time, end_time, total_price, status, drinks_cake_responsibility, notes) ON public.bookings TO authenticated;
REVOKE UPDATE, DELETE ON public.inventory_movements FROM authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_bundle(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, TEXT) FROM anon, authenticated;