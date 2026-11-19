# قاعتي | Qa3aty implementation plan

## Goal
Deliver a production-oriented multi-tenant backend for Flutter plus a private Arabic RTL developer dashboard. Do not build tenant-facing web management pages or public registration.

## Stages
1. **Security-first database:** Create tenant, profile, protected role, settings, subscription/history, halls, customers, bookings/payments, expenses, workers/payments, inventory, notifications, device tokens, and audit tables. Add foreign keys, numeric money fields, indexes, booking-overlap protection, explicit Data API grants, RLS, and tenant-aware database functions.
2. **Authentication and provisioning:** Use password auth with an internal username identity; disable public signup. Protect developer operations by a database-backed super-admin role. Provide secure developer-only tenant/account creation, activation/suspension, password reset, subscription actions, and audit records. Hold initial super-admin provisioning until the requested username is confirmed.
3. **Flutter API:** Add versioned JSON endpoints with server-side auth, tenant ownership, subscription checks, validation, consistent errors, pagination, and CRUD for tenant operations. Keep privileged keys server-only.
4. **Developer dashboard:** Build only the private super-admin sign-in and customer/subscription administration pages in Arabic RTL; do not expose a tenant dashboard.
5. **Business operations:** Implement payments and accounting, stock and waste tracking, worker records, reminders/device-token support, reporting, and Excel downloads using transaction-safe server-side rules.
6. **Delivery and verification:** Write Flutter API/schema documentation and focused tests; inspect Cloud state, run relevant tests, verify preview behavior, review logs, and commit the completed changes.

## Technical boundaries
- Use Lovable Cloud PostgreSQL/Auth/Storage with migrations through the managed database migration tool.
- Keep app logic in TanStack Start server functions and HTTP routes; do not create new Supabase Edge Functions.
- Use `public.user_roles` for roles, never editable user metadata; enforce tenant isolation in RLS and server checks.
- Do not seed demo tenants or customer data.
