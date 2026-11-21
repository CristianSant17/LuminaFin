import { describe, expect, it } from 'vitest';
import {
  applyInvoicePayment,
  buildCreditInstallmentSchedule,
  calculateCreditCardUsage,
  filterCreditInvoices,
  getCreditInvoiceCycles,
  getCreditInvoiceMonth
} from '../src/core/credit-cards.js';
import { createEmptyState, migrateState } from '../src/storage/schema.js';
import { validateStateShape } from '../src/core/validation.js';
import {
  calculateCategoryExpenseTotals,
  calculatePeriodTotals,
  calculateUnsettledPeriodTotals
} from '../src/core/finance.js';

const card = {
  id: 'card-1',
  name: 'Cartão principal',
  active: true,
  limitCents: 500000,
  closingDay: 25,
  dueDay: 10
};

describe('Cartões e faturas', () => {
  it('classifies purchases on and after the closing day into the right cycle', () => {
    expect(getCreditInvoiceMonth('2026-11-25', 25)).toBe('2026-11');
    expect(getCreditInvoiceMonth('2026-11-26', 25)).toBe('2026-12');
  });

  it('splits installment cents exactly and schedules future invoice cycles', () => {
    const installments = buildCreditInstallmentSchedule({
      card,
      purchaseId: 'purchase-1',
      purchaseDate: '2026-11-24',
      amountCents: 10000,
      installmentCount: 3,
      createId: (index) => `installment-${index}`
    });
    expect(installments.map((item) => item.amountCents)).toEqual([3334, 3333, 3333]);
    expect(installments.map((item) => item.invoiceMonth)).toEqual([
      '2026-11', '2026-12', '2027-01'
    ]);
    expect(installments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(10000);
  });

  it('separates the current invoice from the next cycle and lists their installments', () => {
    const installments = buildCreditInstallmentSchedule({
      card,
      purchaseId: 'purchase-cycles',
      purchaseDate: '2026-11-24',
      amountCents: 9000,
      installmentCount: 3,
      createId: (index) => `cycle-${index}`
    });

    const cycles = getCreditInvoiceCycles(card, installments, '2026-11-26');
    expect(cycles.current).toMatchObject({ invoiceMonth: '2026-11', totalCents: 3000 });
    expect(cycles.upcoming).toMatchObject({ invoiceMonth: '2026-12', totalCents: 3000 });
    expect(cycles.current.items[0].installmentNumber).toBe(1);
    expect(cycles.upcoming.items[0].installmentNumber).toBe(2);
  });

  it('releases card limit only by the amount paid against invoice installments', () => {
    const installments = buildCreditInstallmentSchedule({
      card,
      purchaseId: 'purchase-1',
      purchaseDate: '2026-11-24',
      amountCents: 10000,
      installmentCount: 3,
      createId: (index) => `installment-${index}`
    });
    const afterPayment = applyInvoicePayment(installments, 'card-1:2026-11', 1000);
    const usage = calculateCreditCardUsage(card, afterPayment);

    expect(afterPayment[0].paidCents).toBe(1000);
    expect(usage.usedCents).toBe(9000);
    expect(usage.availableCents).toBe(491000);
  });

  it('supports partial and full invoice payments and filters invoices by card and cycle', () => {
    const installments = buildCreditInstallmentSchedule({
      card,
      purchaseId: 'purchase-payment',
      purchaseDate: '2026-11-24',
      amountCents: 10000,
      installmentCount: 1,
      createId: () => 'payment-installment'
    });
    const partial = applyInvoicePayment(installments, 'card-1:2026-11', 4000);
    expect(partial[0]).toMatchObject({ paidCents: 4000, status: 'partial' });
    const complete = applyInvoicePayment(partial, 'card-1:2026-11', 6000);
    expect(complete[0]).toMatchObject({ paidCents: 10000, status: 'paid' });

    const invoices = [
      { id: 'a', cardId: 'card-1', invoiceMonth: '2026-11' },
      { id: 'b', cardId: 'card-2', invoiceMonth: '2026-11' },
      { id: 'c', cardId: 'card-1', invoiceMonth: '2026-12' }
    ];
    expect(filterCreditInvoices(invoices, 'card-1', '2026-12')).toEqual([invoices[2]]);
  });

  it('migrates empty credit-card collections and validates cards, invoices and installments', () => {
    const empty = createEmptyState();
    expect(empty.creditCards).toEqual([]);
    expect(empty.creditInvoices).toEqual([]);
    expect(empty.creditInstallments).toEqual([]);

    const migrated = migrateState({ creditCards: [card] });
    expect(validateStateShape(migrated)).toEqual([]);
  });

  it('counts credit purchases once by category and keeps invoice payments out of expenses/cash obligations', () => {
    const transactions = [
      { date: '2026-11-18', type: 'expense', status: 'pending', valueCents: 9000, sourceType: 'creditPurchase', category: 'shopping' },
      { date: '2026-11-20', type: 'transfer', status: 'paid', valueCents: 3000, sourceType: 'creditInvoicePayment', accountImpactCents: -3000 },
      { date: '2026-11-21', type: 'expense', status: 'paid', valueCents: 2000, category: 'food' }
    ];

    expect(calculatePeriodTotals(transactions, 2026, 11).expenseCents).toBe(2000);
    expect(calculateCategoryExpenseTotals(transactions, 2026, 11)).toBe(11000);
    expect(calculateUnsettledPeriodTotals(transactions, 2026, 11).pendingExpenseCents).toBe(0);
  });
});