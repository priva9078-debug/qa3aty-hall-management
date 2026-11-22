import { z } from "zod";

export const bootstrapInputSchema = z.object({
  setupSecret: z.string().min(1).max(256),
  username: z.string().trim().min(3).max(32),
  fullName: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(128),
  passwordConfirmation: z.string().min(12).max(128),
}).refine((value) => value.password === value.passwordConfirmation, {
  message: "كلمتا المرور غير متطابقتين.",
  path: ["passwordConfirmation"],
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(1).max(128),
});

export const createTenantInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  tenantName: z.string().trim().min(2).max(160),
  primaryHallName: z.string().trim().min(2).max(160),
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  plan: z.enum(["monthly", "yearly", "custom"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  subscriptionPrice: z.number().min(0).max(999_999_999_999),
  status: z.enum(["active", "suspended"]),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;