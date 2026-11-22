import { describe, expect, it } from "vitest";

import { bootstrapInputSchema, createTenantInputSchema, loginInputSchema } from "@/lib/auth.schemas";

describe("Qa3aty account input rules", () => {
  it("accepts the chosen first developer username", () => {
    expect(loginInputSchema.safeParse({ username: "Ahmed Elshora", password: "a-secure-password" }).success).toBe(true);
  });

  it("rejects mismatched passwords during the one-time developer setup", () => {
    const result = bootstrapInputSchema.safeParse({
      setupSecret: "secure-secret-key-123",
      username: "ahmed.elshora",
      fullName: "Ahmed Elshora",
      password: "long-password-123",
      passwordConfirmation: "different-password",
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty setupSecret for developer bootstrap", () => {
    const withoutSecret = bootstrapInputSchema.safeParse({
      username: "ahmed.elshora",
      fullName: "Ahmed Elshora",
      password: "long-password-123",
      passwordConfirmation: "long-password-123",
    });
    expect(withoutSecret.success).toBe(false);

    const withSecret = bootstrapInputSchema.safeParse({
      setupSecret: "my-bootstrap-secret",
      username: "ahmed.elshora",
      fullName: "Ahmed Elshora",
      password: "long-password-123",
      passwordConfirmation: "long-password-123",
    });
    expect(withSecret.success).toBe(true);
  });

  it("requires at least twelve characters for a newly provisioned tenant password", () => {
    const result = createTenantInputSchema.safeParse({
      fullName: "Hall Manager", tenantName: "First Hall Company", primaryHallName: "Main Hall",
      username: "hall.manager", password: "short", phone: "", plan: "monthly",
      startsAt: "2026-11-20T00:00:00.000Z", endsAt: "2026-12-20T00:00:00.000Z",
      subscriptionPrice: 0, status: "active", notes: "",
    });
    expect(result.success).toBe(false);
  });
});