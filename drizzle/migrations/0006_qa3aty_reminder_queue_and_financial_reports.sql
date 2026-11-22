CREATE OR REPLACE FUNCTION public.sync_booking_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_customer TEXT;
  booking_hall TEXT;
  due_days SMALLINT;
  due_time TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'cancelled' OR NEW.remaining_balance <= 0 THEN
    UPDATE public.notifications
      SET status = 'cancelled'
      WHERE tenant_id = NEW.tenant_id AND booking_id = NEW.id AND status = 'pending';
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;

  SELECT c.full_name, h.name INTO booking_customer, booking_hall
    FROM public.customers c, public.halls h
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id
      AND h.id = NEW.hall_id AND h.tenant_id = NEW.tenant_id;

  FOREACH due_days IN ARRAY ARRAY[3,2,1]::SMALLINT[] LOOP
    due_time := ((NEW.event_date - due_days + NEW.start_time) AT TIME ZONE 'Africa/Cairo');
    IF due_time > now() THEN
      INSERT INTO public.notifications (
        tenant_id, booking_id, notification_type, reminder_days_before,
        title, message, payload, scheduled_for, status
      ) VALUES (
        NEW.tenant_id, NEW.id, 'booking_payment_reminder', due_days,
        'تذكير بموعد المناسبة',
        format('العميل %s · القاعة %s · متبقي %s أيام · الرصيد %s', booking_customer, booking_hall, due_days, NEW.remaining_balance),
        jsonb_build_object(
          'customer_name', booking_customer,
          'hall_name', booking_hall,
          'event_date', NEW.event_date,
          'remaining_balance', NEW.remaining_balance,
          'days_remaining', due_days
        ),
        due_time, 'pending'
      )
      ON CONFLICT (tenant_id, booking_id, reminder_days_before)
      DO UPDATE SET
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        payload = EXCLUDED.payload,
        scheduled_for = EXCLUDED.scheduled_for,
        status = 'pending'
      WHERE public.notifications.status <> 'sent';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_reminders_sync
AFTER INSERT OR UPDATE OF status, event_date, start_time, remaining_balance, customer_id, hall_id
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_booking_reminders();

CREATE OR REPLACE FUNCTION public.audit_sensitive_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_tenant UUID;
  target_actor UUID;
  target_entity TEXT;
BEGIN
  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  target_actor := auth.uid();
  target_entity := TG_TABLE_NAME;
  INSERT INTO public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    target_tenant,
    target_actor,
    lower(replace(TG_TABLE_NAME, '_', '.')) || '.' || lower(TG_OP),
    target_entity,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER booking_change_audit
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_record();
CREATE TRIGGER expense_change_audit
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_record();
CREATE TRIGGER worker_payment_change_audit
AFTER INSERT OR UPDATE OR DELETE ON public.worker_payments
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_record();
CREATE TRIGGER inventory_movement_change_audit
AFTER INSERT OR DELETE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_record();

CREATE OR REPLACE FUNCTION public.financial_report(
  _tenant_id UUID,
  _start_date DATE,
  _end_date DATE,
  _hall_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report JSONB;
BEGIN
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'INVALID_REPORT_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF NOT public.tenant_accessible(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _hall_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.halls h WHERE h.tenant_id = _tenant_id AND h.id = _hall_id
  ) THEN
    RAISE EXCEPTION 'HALL_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  WITH booked AS (
    SELECT b.id, b.hall_id, b.total_price, b.total_paid, b.remaining_balance
    FROM public.bookings b
    WHERE b.tenant_id = _tenant_id
      AND b.event_date >= _start_date AND b.event_date <= _end_date
      AND b.status <> 'cancelled'
      AND (_hall_id IS NULL OR b.hall_id = _hall_id)
  ),
  booking_revenue AS (
    SELECT COALESCE(sum(total_price),0)::NUMERIC(14,2) AS revenue,
           COALESCE(sum(remaining_balance),0)::NUMERIC(14,2) AS receivables
    FROM booked
  ),
  collected AS (
    SELECT COALESCE(sum(p.amount),0)::NUMERIC(14,2) AS collected
    FROM public.booking_payments p
    JOIN public.bookings b ON b.id = p.booking_id AND b.tenant_id = p.tenant_id
    WHERE p.tenant_id = _tenant_id AND p.status = 'confirmed'
      AND p.payment_date >= _start_date::TIMESTAMPTZ
      AND p.payment_date < (_end_date + 1)::TIMESTAMPTZ
      AND (_hall_id IS NULL OR b.hall_id = _hall_id)
  ),
  operating AS (
    SELECT COALESCE(sum(e.amount),0)::NUMERIC(14,2) AS total
    FROM public.expenses e
    LEFT JOIN public.bookings b ON b.id = e.booking_id AND b.tenant_id = e.tenant_id
    WHERE e.tenant_id = _tenant_id AND e.expense_date >= _start_date AND e.expense_date <= _end_date
      AND (_hall_id IS NULL OR COALESCE(e.hall_id,b.hall_id) = _hall_id)
  ),
  labor AS (
    SELECT (COALESCE(sum(amount) FILTER (WHERE payment_type <> 'deduction'),0)
      - COALESCE(sum(amount) FILTER (WHERE payment_type = 'deduction'),0))::NUMERIC(14,2) AS total
    FROM public.worker_payments
    WHERE tenant_id = _tenant_id AND payment_date >= _start_date AND payment_date <= _end_date
      AND _hall_id IS NULL
  ),
  event_items AS (
    SELECT COALESCE(sum(i.quantity_consumed * i.purchase_unit_price),0)::NUMERIC(14,2) AS consumed,
           COALESCE(sum(i.waste_cost),0)::NUMERIC(14,2) AS waste
    FROM public.booking_items i
    JOIN public.bookings b ON b.id = i.booking_id AND b.tenant_id = i.tenant_id
    WHERE i.tenant_id = _tenant_id AND b.event_date >= _start_date AND b.event_date <= _end_date
      AND b.status <> 'cancelled' AND i.responsibility = 'tenant'
      AND (_hall_id IS NULL OR b.hall_id = _hall_id)
  ),
  stock AS (
    SELECT COALESCE(sum(abs(m.quantity_delta) * m.unit_cost) FILTER (WHERE m.movement_type = 'consumption'),0)::NUMERIC(14,2) AS consumed,
           COALESCE(sum(abs(m.quantity_delta) * m.unit_cost) FILTER (WHERE m.movement_type = 'waste'),0)::NUMERIC(14,2) AS waste
    FROM public.inventory_movements m
    LEFT JOIN public.bookings b ON b.id = m.booking_id AND b.tenant_id = m.tenant_id
    WHERE m.tenant_id = _tenant_id
      AND m.movement_date >= _start_date::TIMESTAMPTZ
      AND m.movement_date < (_end_date + 1)::TIMESTAMPTZ
      AND (_hall_id IS NULL OR b.hall_id = _hall_id)
  )
  SELECT jsonb_build_object(
    'booking_revenue', booking_revenue.revenue,
    'collected_payments', collected.collected,
    'outstanding_receivables', booking_revenue.receivables,
    'operating_expenses', operating.total,
    'worker_costs', labor.total,
    'drinks_cake_costs', event_items.consumed,
    'inventory_costs', stock.consumed,
    'actual_waste_costs', (event_items.waste + stock.waste),
    'net_profit', (booking_revenue.revenue - operating.total - labor.total - event_items.consumed - stock.consumed - event_items.waste - stock.waste),
    'period_start', _start_date,
    'period_end', _end_date,
    'hall_id', _hall_id
  ) INTO report
  FROM booking_revenue, collected, operating, labor, event_items, stock;
  RETURN report;
END;
$$;
REVOKE ALL ON FUNCTION public.financial_report(UUID, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_report(UUID, DATE, DATE, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_booking_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_sensitive_record() FROM PUBLIC, anon, authenticated;