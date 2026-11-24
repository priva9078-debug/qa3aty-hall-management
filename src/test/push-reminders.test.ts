import { describe, expect, it } from "vitest";

import { getReminderDatesForEvent, isReminderBookingEligible, nextReminderRetryDelayMs } from "@/lib/push-reminders";

const today = "2026-11-23";

describe("Qa3aty push reminder eligibility", () => {
  it("allows only confirmed bookings with an outstanding balance", () => {
    expect(isReminderBookingEligible({ status: "confirmed", remaining_balance: "2500.00", event_date: "2026-11-26" }, "2026-11-23", 3)).toBe(true);
    expect(isReminderBookingEligible({ status: "pending", remaining_balance: 2500, event_date: "2026-11-26" }, "2026-11-23", 3)).toBe(false);
    expect(isReminderBookingEligible({ status: "cancelled", remaining_balance: 2500, event_date: "2026-11-26" }, "2026-11-23", 3)).toBe(false);
    expect(isReminderBookingEligible({ status: "confirmed", remaining_balance: 0, event_date: "2026-11-26" }, "2026-11-23", 3)).toBe(false);
  });

  it("does not send a reminder after the event date", () => {
    expect(isReminderBookingEligible({ status: "confirmed", remaining_balance: 1, event_date: "2026-11-22" }, today, 1)).toBe(false);
  });

  it("sends on the 17th, 18th, and 19th for an event on the 20th", () => {
    expect(getReminderDatesForEvent("2026-11-20")).toEqual([
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
  });

  it("retries failed delivery with capped backoff", () => {
    expect(nextReminderRetryDelayMs(1)).toBe(5 * 60_000);
    expect(nextReminderRetryDelayMs(2)).toBe(10 * 60_000);
    expect(nextReminderRetryDelayMs(20)).toBe(6 * 60 * 60_000);
  });
});