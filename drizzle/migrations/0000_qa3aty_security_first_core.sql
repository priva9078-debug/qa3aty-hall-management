CREATE TYPE public.app_role AS ENUM ('super_admin', 'tenant_admin');

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  primary_hall_name TEXT NOT NULL CHECK (length(trim(primary_hall_name)) BETWEEN 2 AND 160),
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT,
  username TEXT NOT NULL UNIQUE CHECK (username = lower(username) AND username ~ '^[a-z0-9._-]{3,32}$'),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_tenant_role_shape CHECK (tenant_id IS NOT NULL OR username <> '')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
REVOKE UPDATE (user_id, tenant_id, username, is_active) ON public.profiles FROM authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role),
  CONSTRAINT user_roles_tenant_shape CHECK ((role = 'super_admin' AND tenant_id IS NULL) OR (role = 'tenant_admin' AND tenant_id IS NOT NULL))
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
CREATE UNIQUE INDEX user_roles_single_super_admin_idx ON public.user_roles (role) WHERE role = 'super_admin';
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL DEFAULT 'EGP' CHECK (currency_code ~ '^[A-Z]{3}$'),
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  reminder_days SMALLINT[] NOT NULL DEFAULT ARRAY[3,2,1]::SMALLINT[],
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly', 'custom')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'renewed', 'extended', 'suspended', 'reactivated', 'cancelled', 'plan_changed')),
  previous_ends_at TIMESTAMPTZ,
  new_ends_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT,
  address TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  contact_phone TEXT,
  default_booking_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (default_booking_price >= 0),
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halls TO authenticated;
GRANT ALL ON public.halls TO service_role;
ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;
CREATE INDEX halls_tenant_idx ON public.halls (tenant_id, is_active, name);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone TEXT NOT NULL CHECK (length(trim(phone)) BETWEEN 3 AND 40),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX customers_tenant_phone_idx ON public.customers (tenant_id, phone);
CREATE INDEX customers_tenant_name_idx ON public.customers (tenant_id, full_name);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  hall_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  event_name TEXT NOT NULL CHECK (length(trim(event_name)) BETWEEN 1 AND 160),
  event_type TEXT NOT NULL CHECK (event_type IN ('wedding', 'engagement', 'birthday', 'conference', 'other')),
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_price NUMERIC(14,2) NOT NULL CHECK (total_price >= 0),
  advance_payment NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advance_payment >= 0),
  total_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_balance >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  drinks_cake_responsibility TEXT NOT NULL DEFAULT 'tenant' CHECK (drinks_cake_responsibility IN ('tenant', 'customer')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  CHECK (advance_payment <= total_price),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, hall_id) REFERENCES public.halls(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id) ON DELETE RESTRICT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX bookings_tenant_date_idx ON public.bookings (tenant_id, event_date, status);
CREATE INDEX bookings_hall_date_idx ON public.bookings (tenant_id, hall_id, event_date, start_time, end_time);
CREATE INDEX bookings_customer_idx ON public.bookings (tenant_id, customer_id, event_date);

CREATE TABLE public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL DEFAULT 'other' CHECK (payment_method IN ('cash', 'bank_transfer', 'other')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'voided')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated;
GRANT ALL ON public.booking_payments TO service_role;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX booking_payments_booking_idx ON public.booking_payments (tenant_id, booking_id, payment_date);

CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 240),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hall_id UUID,
  booking_id UUID,
  receipt_path TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, hall_id) REFERENCES public.halls(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX expenses_tenant_date_idx ON public.expenses (tenant_id, expense_date);

CREATE TABLE public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone TEXT,
  job_title TEXT,
  salary_type TEXT NOT NULL CHECK (salary_type IN ('fixed', 'daily')),
  fixed_salary NUMERIC(14,2) CHECK (fixed_salary IS NULL OR fixed_salary >= 0),
  daily_wage NUMERIC(14,2) CHECK (daily_wage IS NULL OR daily_wage >= 0),
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK ((salary_type = 'fixed' AND fixed_salary IS NOT NULL) OR (salary_type = 'daily' AND daily_wage IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE INDEX workers_tenant_status_idx ON public.workers (tenant_id, status, full_name);

CREATE TABLE public.worker_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('salary', 'daily_wage', 'bonus', 'deduction')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, worker_id) REFERENCES public.workers(tenant_id, id) ON DELETE RESTRICT,
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT ALL ON public.worker_payments TO service_role;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX worker_payments_tenant_date_idx ON public.worker_payments (tenant_id, payment_date, worker_id);

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  unit TEXT NOT NULL DEFAULT 'unit' CHECK (length(trim(unit)) BETWEEN 1 AND 30),
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX inventory_items_tenant_name_idx ON public.inventory_items (tenant_id, is_active, name);

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  inventory_item_id UUID NOT NULL,
  booking_id UUID,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'consumption', 'waste', 'adjustment')),
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  movement_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, inventory_item_id) REFERENCES public.inventory_items(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((movement_type IN ('purchase', 'adjustment') AND quantity_delta > 0) OR (movement_type IN ('consumption', 'waste') AND quantity_delta < 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX inventory_movements_tenant_date_idx ON public.inventory_movements (tenant_id, movement_date DESC, inventory_item_id);

CREATE TABLE public.booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL,
  product_name TEXT NOT NULL CHECK (length(trim(product_name)) BETWEEN 1 AND 160),
  responsibility TEXT NOT NULL DEFAULT 'tenant' CHECK (responsibility IN ('tenant', 'customer')),
  quantity_purchased NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_purchased >= 0),
  purchase_unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_unit_price >= 0),
  quantity_consumed NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_consumed >= 0),
  quantity_wasted NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_wasted >= 0),
  waste_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (waste_cost >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT,
  CHECK (quantity_consumed + quantity_wasted <= quantity_purchased OR quantity_purchased = 0),
  CHECK (responsibility = 'tenant' OR (quantity_purchased = 0 AND purchase_unit_price = 0 AND waste_cost = 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_items TO authenticated;
GRANT ALL ON public.booking_items TO service_role;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX booking_items_booking_idx ON public.booking_items (tenant_id, booking_id);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  booking_id UUID,
  notification_type TEXT NOT NULL DEFAULT 'booking_payment_reminder',
  reminder_days_before SMALLINT CHECK (reminder_days_before IS NULL OR reminder_days_before > 0),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, booking_id, reminder_days_before)
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX notifications_tenant_created_idx ON public.notifications (tenant_id, created_at DESC);

CREATE TABLE public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  booking_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'fcm')),
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'failed', 'skipped')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, booking_id) REFERENCES public.bookings(tenant_id, id) ON DELETE RESTRICT
);
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'fcm' CHECK (provider = 'fcm'),
  token TEXT NOT NULL CHECK (length(token) BETWEEN 20 AND 4096),
  device_label TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, token),
  UNIQUE (tenant_id, user_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX device_tokens_user_idx ON public.device_tokens (tenant_id, user_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id UUID,
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 120),
  entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) BETWEEN 1 AND 80),
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_logs_tenant_created_idx ON public.audit_logs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.tenant_accessible(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.user_id = auth.uid() AND p.is_active = true AND p.tenant_id = _tenant_id AND t.status = 'active'
        AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id AND s.status = 'active' AND now() >= s.starts_at AND now() < s.ends_at)
    )
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.check_booking_conflict()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('pending', 'confirmed') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.hall_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.tenant_id = NEW.tenant_id AND b.hall_id = NEW.hall_id AND b.event_date = NEW.event_date
        AND b.status IN ('pending', 'confirmed') AND b.id <> NEW.id
        AND NEW.start_time < b.end_time AND NEW.end_time > b.start_time
    ) THEN
      RAISE EXCEPTION 'BOOKING_TIME_CONFLICT' USING ERRCODE = '23P01';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.total_price < OLD.total_paid THEN
    RAISE EXCEPTION 'BOOKING_PRICE_BELOW_CONFIRMED_PAYMENTS' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_booking_overpayment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE booking_total NUMERIC(14,2); paid_before NUMERIC(14,2);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.booking_id <> OLD.booking_id THEN
    RAISE EXCEPTION 'PAYMENT_BOOKING_CANNOT_CHANGE' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.bookings b WHERE b.id = NEW.booking_id AND b.tenant_id = NEW.tenant_id FOR UPDATE;
  SELECT b.total_price INTO booking_total FROM public.bookings b WHERE b.id = NEW.booking_id AND b.tenant_id = NEW.tenant_id;
  IF booking_total IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  SELECT COALESCE(sum(p.amount), 0) INTO paid_before FROM public.booking_payments p
    WHERE p.tenant_id = NEW.tenant_id AND p.booking_id = NEW.booking_id AND p.status = 'confirmed' AND p.id <> NEW.id;
  IF NEW.status = 'confirmed' AND paid_before + NEW.amount > booking_total THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING_BALANCE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_booking_payment_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_tenant UUID; target_booking UUID; paid NUMERIC(14,2);
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_booking := COALESCE(NEW.booking_id, OLD.booking_id);
  SELECT COALESCE(sum(p.amount), 0) INTO paid FROM public.booking_payments p
    WHERE p.tenant_id = target_tenant AND p.booking_id = target_booking AND p.status = 'confirmed';
  UPDATE public.bookings SET total_paid = paid, remaining_balance = greatest(total_price - paid, 0), updated_at = now()
    WHERE tenant_id = target_tenant AND id = target_booking;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_initial_advance_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.advance_payment > 0 THEN
    INSERT INTO public.booking_payments (tenant_id, booking_id, amount, payment_method, notes, created_by)
    VALUES (NEW.tenant_id, NEW.id, NEW.advance_payment, 'other', 'دفعة مقدمة عند إنشاء الحجز', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_quantity NUMERIC(14,3);
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'INVENTORY_MOVEMENTS_ARE_IMMUTABLE'; END IF;
  UPDATE public.inventory_items i SET quantity_on_hand = i.quantity_on_hand + NEW.quantity_delta, updated_at = now()
    WHERE i.id = NEW.inventory_item_id AND i.tenant_id = NEW.tenant_id AND i.quantity_on_hand + NEW.quantity_delta >= 0
    RETURNING quantity_on_hand INTO next_quantity;
  IF next_quantity IS NULL THEN RAISE EXCEPTION 'INVENTORY_STOCK_CANNOT_BE_NEGATIVE' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_booking_payment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (COALESCE(NEW.tenant_id, OLD.tenant_id), auth.uid(), CASE WHEN TG_OP = 'INSERT' THEN 'payment.created' WHEN TG_OP = 'UPDATE' THEN 'payment.updated' ELSE 'payment.deleted' END,
    'booking_payment', COALESCE(NEW.id, OLD.id), CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END, CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tenant_settings_touch_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER subscriptions_touch_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER halls_touch_updated_at BEFORE UPDATE ON public.halls FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER bookings_touch_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER expenses_touch_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER workers_touch_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER inventory_items_touch_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER booking_items_touch_updated_at BEFORE UPDATE ON public.booking_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER device_tokens_touch_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER booking_conflict_guard BEFORE INSERT OR UPDATE OF hall_id, event_date, start_time, end_time, status, total_price ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.check_booking_conflict();
CREATE TRIGGER payment_overpayment_guard BEFORE INSERT OR UPDATE OF amount, status, tenant_id, booking_id ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_overpayment();
CREATE TRIGGER payment_totals_sync AFTER INSERT OR UPDATE OR DELETE ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION public.sync_booking_payment_totals();
CREATE TRIGGER initial_advance_payment AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.record_initial_advance_payment();
CREATE TRIGGER inventory_movement_apply AFTER INSERT OR UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();
CREATE TRIGGER booking_payment_audit AFTER INSERT OR UPDATE OR DELETE ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION public.audit_booking_payment_change();

CREATE POLICY tenants_read_own ON public.tenants FOR SELECT TO authenticated USING (id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY tenants_admin_manage ON public.tenants FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY profiles_read_own_or_admin ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_active) WITH CHECK (user_id = auth.uid() AND is_active);
CREATE POLICY profiles_admin_manage ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY roles_read_own_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY tenant_settings_scoped ON public.tenant_settings FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY subscriptions_read_scoped ON public.subscriptions FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY subscriptions_admin_manage ON public.subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY subscription_history_read_scoped ON public.subscription_history FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY subscription_history_admin_manage ON public.subscription_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY halls_scoped ON public.halls FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY customers_scoped ON public.customers FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY bookings_scoped ON public.bookings FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY booking_payments_scoped ON public.booking_payments FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY expense_categories_read_scoped ON public.expense_categories FOR SELECT TO authenticated USING (tenant_id IS NULL OR tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY expense_categories_manage_own ON public.expense_categories FOR ALL TO authenticated USING (tenant_id IS NOT NULL AND public.tenant_accessible(tenant_id)) WITH CHECK (tenant_id IS NOT NULL AND public.tenant_accessible(tenant_id));
CREATE POLICY expense_categories_admin_manage ON public.expense_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY expenses_scoped ON public.expenses FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY workers_scoped ON public.workers FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY worker_payments_scoped ON public.worker_payments FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY inventory_items_scoped ON public.inventory_items FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY inventory_movements_scoped ON public.inventory_movements FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY booking_items_scoped ON public.booking_items FOR ALL TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY notifications_read_scoped ON public.notifications FOR SELECT TO authenticated USING (public.tenant_accessible(tenant_id));
CREATE POLICY notifications_mark_read_scoped ON public.notifications FOR UPDATE TO authenticated USING (public.tenant_accessible(tenant_id)) WITH CHECK (public.tenant_accessible(tenant_id));
CREATE POLICY notification_logs_read_scoped ON public.notification_logs FOR SELECT TO authenticated USING (public.tenant_accessible(tenant_id));
CREATE POLICY device_tokens_own_scoped ON public.device_tokens FOR ALL TO authenticated USING (user_id = auth.uid() AND public.tenant_accessible(tenant_id)) WITH CHECK (user_id = auth.uid() AND public.tenant_accessible(tenant_id));
CREATE POLICY audit_logs_read_scoped ON public.audit_logs FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tenant_accessible(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_accessible(UUID) TO authenticated, service_role;

CREATE POLICY tenant_files_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'qa3aty-private' AND public.tenant_accessible(((storage.foldername(name))[2])::uuid));
CREATE POLICY tenant_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'qa3aty-private' AND (storage.foldername(name))[1] = 'tenants' AND public.tenant_accessible(((storage.foldername(name))[2])::uuid));
CREATE POLICY tenant_files_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'qa3aty-private' AND public.tenant_accessible(((storage.foldername(name))[2])::uuid)) WITH CHECK (bucket_id = 'qa3aty-private' AND (storage.foldername(name))[1] = 'tenants' AND public.tenant_accessible(((storage.foldername(name))[2])::uuid));
CREATE POLICY tenant_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'qa3aty-private' AND public.tenant_accessible(((storage.foldername(name))[2])::uuid));