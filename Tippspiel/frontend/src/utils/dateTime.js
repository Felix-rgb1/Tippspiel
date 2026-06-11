function pad2(value) {
  return String(value).padStart(2, '0');
}

export function parseDateTimeLocal(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const raw = String(value).trim();

  // Parse date-time strings as local wall clock time to avoid implicit UTC shifts.
  const dateTimeMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (dateTimeMatch) {
    const year = Number.parseInt(dateTimeMatch[1], 10);
    const month = Number.parseInt(dateTimeMatch[2], 10);
    const day = Number.parseInt(dateTimeMatch[3], 10);
    const hour = Number.parseInt(dateTimeMatch[4], 10);
    const minute = Number.parseInt(dateTimeMatch[5], 10);
    const second = Number.parseInt(dateTimeMatch[6] || '0', 10);
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTimeDe(value, includeWeekday = true) {
  const parsed = parseDateTimeLocal(value);
  if (!parsed) return '-';

  return parsed.toLocaleString('de-DE', {
    ...(includeWeekday ? { weekday: 'short' } : {}),
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function toDateTimeLocalInputValue(value) {
  const parsed = parseDateTimeLocal(value);
  if (!parsed) return '';

  const year = parsed.getFullYear();
  const month = pad2(parsed.getMonth() + 1);
  const day = pad2(parsed.getDate());
  const hour = pad2(parsed.getHours());
  const minute = pad2(parsed.getMinutes());

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toTimestamp(value) {
  const parsed = parseDateTimeLocal(value);
  return parsed ? parsed.getTime() : Number.NaN;
}