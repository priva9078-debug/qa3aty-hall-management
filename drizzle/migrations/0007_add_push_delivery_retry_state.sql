ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dispatch_attempts INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_attempts >= 0);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notifications_dispatch_queue_idx ON public.notifications (scheduled_for, next_attempt_at) WHERE status = 'pending';
COMMENT ON COLUMN public.notifications.dispatch_attempts IS 'Number of push delivery attempts; managed by the scheduled dispatcher.';
COMMENT ON COLUMN public.notifications.next_attempt_at IS 'Next retry time / short dispatch lease; managed by the scheduled dispatcher.';