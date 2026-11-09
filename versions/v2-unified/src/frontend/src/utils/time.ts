const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const ISO_NO_TZ_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function toValidDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseBackendDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  if (SQLITE_DATETIME_RE.test(text)) {
    return toValidDate(`${text.replace(' ', 'T')}Z`);
  }

  if (ISO_NO_TZ_RE.test(text)) {
    return toValidDate(`${text}Z`);
  }

  return toValidDate(text);
}

export function formatDateTime(value: string | null | undefined, fallback = '-'): string {
  const date = parseBackendDate(value);
  return date ? date.toLocaleString() : fallback;
}

export function formatDate(value: string | null | undefined, fallback = '-'): string {
  const date = parseBackendDate(value);
  return date ? date.toLocaleDateString() : fallback;
}

export function formatDateTimeShort(value: string | null | undefined, fallback = '-'): string {
  const date = parseBackendDate(value);
  if (!date) {
    return fallback;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}:${second}`;
}
