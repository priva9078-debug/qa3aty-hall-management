CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
      AND (_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.user_roles own_role
        WHERE own_role.user_id = auth.uid() AND own_role.role = 'super_admin'::public.app_role
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.tenant_accessible(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      _tenant_id = public.current_tenant_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.tenants t ON t.id = p.tenant_id
        WHERE p.user_id = auth.uid() AND p.is_active = true AND p.tenant_id = _tenant_id AND t.status = 'active'
          AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id AND s.status = 'active' AND now() >= s.starts_at AND now() < s.ends_at)
      )
    )
  )
$$;

CREATE INDEX IF NOT EXISTS profiles_tenant_idx ON public.profiles (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_roles_tenant_idx ON public.user_roles (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_tenant_ends_idx ON public.subscriptions (tenant_id, ends_at DESC, status);
CREATE INDEX IF NOT EXISTS subscription_history_tenant_idx ON public.subscription_history (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_tenant_booking_idx ON public.expenses (tenant_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_tenant_hall_idx ON public.expenses (tenant_id, hall_id) WHERE hall_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON public.inventory_movements (tenant_id, inventory_item_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_booking_idx ON public.inventory_movements (tenant_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_logs_notification_idx ON public.notification_logs (notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_logs_tenant_booking_idx ON public.notification_logs (tenant_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS worker_payments_worker_idx ON public.worker_payments (tenant_id, worker_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses (category_id) WHERE category_id IS NOT NULL;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tenant_accessible(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_accessible(UUID) TO authenticated, service_role;