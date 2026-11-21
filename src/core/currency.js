import { fromCents, toCents } from './money.js';
import { dateKey, normalizeDate } from './finance.js';

export const BASE_CURRENCY = 'BRL';
export const FX_RATE_SCALE = 1000000;

export const SUPPORTED_CURRENCIES = Object.freeze({
  BRL: { label: 'Real', locale: 'pt-BR' },
  USD: { label: 'Dólar', locale: 'en-US' },
  EUR: { label: 'Euro', locale: 'pt-BR' },
  GBP: { label: 'Libra', locale: 'en-GB' },
  JPY: { label: 'Iene', locale: 'ja-JP' },
  CAD: { label: 'Dólar Canadense', locale: 'en-CA' }
});

export function getExchangeRate(fxRates = [], currency, asOfDate, baseCurrency = BASE_CURRENCY) {
  if (currency === baseCurrency) {
    return { currency, rateToBaseMicros: FX_RATE_SCALE, effectiveDate: asOfDate || '' };
  }
  if (!Array.isArray(fxRates) || !normalizeDate(asOfDate)) return null;
  const rates = fxRates
    .filter((item) => item.currency === currency
      && Number.isSafeInteger(item.rateToBaseMicros)
      && item.rateToBaseMicros > 0
      && normalizeDate(item.effectiveDate)
      && item.effectiveDate <= asOfDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const selected = rates[0];
  return selected
    ? { currency, rateToBaseMicros: selected.rateToBaseMicros, effectiveDate: selected.effectiveDate }
    : null;
}

export function convertBaseCentsToDisplayAmount(
  baseCents,
  currency,
  fxRates = [],
  asOfDate,
  baseCurrency = BASE_CURRENCY
) {
  if (!Number.isSafeInteger(baseCents)) throw new TypeError('O valor base precisa estar em centavos inteiros.');
  const rate = getExchangeRate(fxRates, currency, asOfDate, baseCurrency);
  if (!rate) return null;
  return fromCents(baseCents) * FX_RATE_SCALE / rate.rateToBaseMicros;
}

export function convertDisplayAmountToBaseCents(
  amount,
  currency,
  fxRates = [],
  asOfDate,
  baseCurrency = BASE_CURRENCY
) {
  if (!Number.isFinite(amount) || !normalizeDate(asOfDate)) return null;
  const rate = getExchangeRate(fxRates, currency, asOfDate, baseCurrency);
  if (!rate) return null;
  const nativeCents = toCents(amount);
  const numerator = BigInt(nativeCents) * BigInt(rate.rateToBaseMicros);
  const scale = BigInt(FX_RATE_SCALE);
  const rounded = numerator >= 0n
    ? (numerator + scale / 2n) / scale
    : (numerator - scale / 2n) / scale;
  const baseCents = Number(rounded);
  return Number.isSafeInteger(baseCents) ? baseCents : null;
}

export function changeDisplayCurrency(state, currency, asOfDate = dateKey(new Date())) {
  if (!SUPPORTED_CURRENCIES[currency]) throw new Error('Moeda não suportada');
  const baseCurrency = state.settings?.baseCurrency || BASE_CURRENCY;
  if (!getExchangeRate(state.fxRates, currency, asOfDate, baseCurrency)) {
    throw new Error(`Cadastre uma taxa de câmbio válida para ${currency} antes de selecioná-la.`);
  }
  return {
    ...state,
    settings: {
      ...state.settings,
      currency,
      updatedAt: new Date().toISOString()
    }
  };
}
