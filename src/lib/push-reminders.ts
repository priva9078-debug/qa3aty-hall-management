export type ReminderBookingState = {
  status: string;
  remaining_balance: number | string | null;
  event_date: string;
};

export const reminderDaysBefore = [3, 2, 1] as const;

function reminderDateForEvent(eventDate: string, daysBefore: number) {
  if (!reminderDaysBefore.includes(daysBefore as (typeof reminderDaysBefore)[number])) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!parts) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

export function getReminderDatesForEvent(eventDate: string) {
  return reminderDaysBefore
    .map((daysBefore) => reminderDateForEvent(eventDate, daysBefore))
    .filter((date): date is string => date !== null);
}

export function isReminderBookingEligible(
  booking: ReminderBookingState,
  todayInCairo: string,
  daysBefore: number,
) {
  const remainingBalance = Number(booking.remaining_balance);

  return (
    booking.status === "confirmed" &&
    Number.isFinite(remainingBalance) &&
    remainingBalance > 0 &&
    booking.event_date >= todayInCairo &&
    reminderDateForEvent(booking.event_date, daysBefore) === todayInCairo
  );
}

export function nextReminderRetryDelayMs(attempt: number) {
  const boundedAttempt = Math.max(1, Math.min(Math.trunc(attempt) || 1, 8));
  return Math.min(6 * 60 * 60_000, 5 * 60_000 * 2 ** (boundedAttempt - 1));
}