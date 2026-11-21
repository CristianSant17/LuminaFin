import { normalizeDate } from './finance.js';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthParts(month) {
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    throw new RangeError('Ciclo de fatura inválido.');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, month: monthNumber };
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextMonth(month) {
  const { year, month: monthNumber } = monthParts(month);
  return monthNumber === 12 ? monthKey(year + 1, 1) : monthKey(year, monthNumber + 1);
}

export function getCreditInvoiceMonth(purchaseDate, closingDay) {
  const date = normalizeDate(purchaseDate);
  if (!date || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new RangeError('Data de compra ou dia de fechamento inválido.');
  }
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  if (date.getDate() > closingDay) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return monthKey(year, month);
}

export function getCreditInvoiceCycles(card, installments, asOfDate) {
  if (!card || !Array.isArray(installments) || !normalizeDate(asOfDate)) {
    throw new TypeError('Cartão, parcelas e data de referência válidos são obrigatórios.');
  }
  const referenceDate = normalizeDate(asOfDate);
  const currentMonth = monthKey(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
  const upcomingMonth = nextMonth(currentMonth);
  const summarize = (invoiceMonth) => {
    const dates = getCreditInvoiceDates(invoiceMonth, card.closingDay, card.dueDay);
    const items = installments
      .filter((item) => item.cardId === card.id && item.invoiceMonth === invoiceMonth)
      .map((item) => ({ ...item, remainingCents: Math.max(0, item.amountCents - item.paidCents) }));
    return {
      cardId: card.id,
      invoiceMonth,
      ...dates,
      items,
      totalCents: items.reduce((sum, item) => sum + item.remainingCents, 0)
    };
  };
  return {
    current: summarize(currentMonth),
    upcoming: summarize(upcomingMonth)
  };
}

export function getCreditInvoiceDates(invoiceMonth, closingDay, dueDay) {
  const { year, month } = monthParts(invoiceMonth);
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31
    || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError('Dias de fechamento e vencimento devem estar entre 1 e 31.');
  }
  const closeDate = new Date(year, month, 0).getDate();
  let dueYear = year;
  let dueMonth = month;
  if (dueDay <= closingDay) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  const dueDate = new Date(dueYear, dueMonth, 0).getDate();
  return {
    closingDate: `${invoiceMonth}-${String(Math.min(closingDay, closeDate)).padStart(2, '0')}`,
    dueDate: `${monthKey(dueYear, dueMonth)}-${String(Math.min(dueDay, dueDate)).padStart(2, '0')}`
  };
}

export function buildCreditInstallmentSchedule({
  card,
  purchaseId,
  purchaseDate,
  amountCents,
  installmentCount,
  createId
}) {
  if (!card || typeof card.id !== 'string' || !card.id
    || typeof purchaseId !== 'string' || !purchaseId
    || !normalizeDate(purchaseDate)
    || !Number.isSafeInteger(amountCents) || amountCents <= 0
    || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 24
    || typeof createId !== 'function') {
    throw new TypeError('Cartão, compra, data, valor e quantidade de parcelas válidos são obrigatórios.');
  }
  const firstInvoiceMonth = getCreditInvoiceMonth(purchaseDate, card.closingDay);
  const baseCents = Math.floor(amountCents / installmentCount);
  const remainingCents = amountCents - baseCents * installmentCount;
  const [startYear, startMonth] = firstInvoiceMonth.split('-').map(Number);
  const now = new Date().toISOString();

  return Array.from({ length: installmentCount }, (_, index) => {
    const absoluteMonth = startMonth + index;
    const year = startYear + Math.floor((absoluteMonth - 1) / 12);
    const month = ((absoluteMonth - 1) % 12) + 1;
    const invoiceMonth = monthKey(year, month);
    return {
      id: createId(index + 1),
      cardId: card.id,
      purchaseId,
      invoiceId: `${card.id}:${invoiceMonth}`,
      purchaseDate,
      invoiceMonth,
      installmentNumber: index + 1,
      installmentCount,
      amountCents: baseCents + (index < remainingCents ? 1 : 0),
      paidCents: 0,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1
    };
  });
}

export function applyInvoicePayment(installments, invoiceId, paymentCents) {
  if (!Array.isArray(installments) || typeof invoiceId !== 'string'
    || !Number.isSafeInteger(paymentCents) || paymentCents <= 0) {
    throw new TypeError('Parcelas, fatura e valor de pagamento válidos são obrigatórios.');
  }
  const matching = installments
    .filter((item) => item.invoiceId === invoiceId)
    .sort((left, right) => left.installmentNumber - right.installmentNumber);
  const dueCents = matching.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0);
  if (matching.length === 0 || paymentCents > dueCents) {
    throw new RangeError('Pagamento excede o saldo desta fatura.');
  }

  let remainingCents = paymentCents;
  const timestamp = new Date().toISOString();
  return installments.map((item) => {
    if (item.invoiceId !== invoiceId || remainingCents === 0) return item;
    const balanceCents = item.amountCents - item.paidCents;
    const paymentForItem = Math.min(balanceCents, remainingCents);
    remainingCents -= paymentForItem;
    const paidCents = item.paidCents + paymentForItem;
    return {
      ...item,
      paidCents,
      status: paidCents === item.amountCents ? 'paid' : 'partial',
      updatedAt: timestamp,
      version: (item.version || 1) + 1
    };
  });
}

export function calculateCreditCardUsage(card, installments) {
  if (!card || !Number.isSafeInteger(card.limitCents) || !Array.isArray(installments)) {
    throw new TypeError('Cartão e lista de parcelas válidos são obrigatórios.');
  }
  const usedCents = installments
    .filter((item) => item.cardId === card.id)
    .reduce((sum, item) => sum + Math.max(0, item.amountCents - item.paidCents), 0);
  return {
    limitCents: card.limitCents,
    usedCents,
    availableCents: card.limitCents - usedCents
  };
}

export function summarizeCreditInvoice(invoice, installments, asOfDate) {
  if (!invoice || !Array.isArray(installments) || !normalizeDate(asOfDate)) {
    throw new TypeError('Fatura, parcelas e data de referência válidas são obrigatórias.');
  }
  const invoiceItems = installments.filter((item) => item.invoiceId === invoice.id);
  const totalCents = invoiceItems.reduce((sum, item) => sum + item.amountCents, 0);
  const paidCents = invoiceItems.reduce((sum, item) => sum + item.paidCents, 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const status = remainingCents === 0
    ? 'paid'
    : asOfDate > invoice.closingDate ? 'closed' : 'open';
  return { ...invoice, totalCents, paidCents, remainingCents, status };
}

export function filterCreditInvoices(invoices, cardId = '', invoiceMonth = '') {
  if (!Array.isArray(invoices)) throw new TypeError('Lista de faturas válida é obrigatória.');
  return invoices.filter((invoice) => (!cardId || invoice.cardId === cardId)
    && (!invoiceMonth || invoice.invoiceMonth === invoiceMonth));
}