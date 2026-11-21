export function toCents(value) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

export function fromCents(value) {
  return Number.isSafeInteger(value) ? value / 100 : 0;
}

export function formatMoneyFromCents(cents, currency = 'BRL', locale = 'pt-BR') {
  if (!Number.isSafeInteger(cents)) cents = 0;
  const decimals = currency === 'JPY' ? 0 : 2;
  const amount = fromCents(cents);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount);
}
