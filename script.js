import {
  calculatePeriodTotals,
  calculateCategoryExpenseTotals,
  calculateDailyExpenseAverage,
  calculateSavingsRate,
  calculateFilteredOpeningBalance,
  calculateAccountBalanceAt,
  calculateUnsettledPeriodTotals,
  dateKey,
  normalizeDate,
  periodMatches
} from './src/core/finance.js';
import { toCents, fromCents, formatMoneyFromCents } from './src/core/money.js';
import {
  createMissingFixedExpenseOccurrences,
  isFixedExpenseActiveInMonth,
  resolveFixedExpenseStartMonth
} from './src/core/fixed-expenses.js';
import { migrateState, createEmptyState, SCHEMA_VERSION, STORAGE_KEY } from './src/storage/schema.js';
import { validateCofferSettings, validateStateShape } from './src/core/validation.js';
import {
  BASE_CURRENCY,
  convertBaseCentsToDisplayAmount,
  convertDisplayAmountToBaseCents,
  FX_RATE_SCALE,
  SUPPORTED_CURRENCIES,
  changeDisplayCurrency,
  getExchangeRate
} from './src/core/currency.js';
import {
  calculateCofferBalance,
  calculateCofferBalances,
  createCofferOperation,
  getCofferRateDescription,
  resolveCofferTransition,
  simulateCofferYield
} from './src/core/coffers.js';
import { closeMobileNavigation } from './src/ui/navigation.js';
import {
  applyInvoicePayment,
  buildCreditInstallmentSchedule,
  calculateCreditCardUsage,
  getCreditInvoiceDates,
  getCreditInvoiceMonth,
  summarizeCreditInvoice
} from './src/core/credit-cards.js';
import {
  evaluatePurchaseDecision,
  simulateLongTermSavings,
  summarizeMonthlyBudget
} from './src/core/planning.js';


const defaultSettings = {
  themeMode: 'dark',
  currency: 'BRL',
  notificationsEnabled: true,
  notifyOnLimitReached: 80,
  colors: {
    background: '#0b1120',
    header: '#111827',
    card: '#111827',
    accent: '#38bdf8'
  }
};

const defaultCategories = [
  { id: 'moradia', name: 'Moradia', type: 'expense', icon: '🏠', subcategories: ['Aluguel', 'Condomínio', 'IPTU', 'Reformas', 'Água', 'Luz', 'Gás'], limit: 2000, preset: true },
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: '🍔', subcategories: ['Mercado', 'Ifood', 'Restaurante', 'Lanches', 'Padaria'], limit: 800, preset: true },
  { id: 'transporte', name: 'Transporte', type: 'expense', icon: '🚗', subcategories: ['Combustível', 'Uber', 'Manutenção', 'Estacionamento', 'Seguro'], limit: 500, preset: true },
  { id: 'salario', name: 'Salário', type: 'income', icon: '💼', subcategories: ['CLT', 'Freela', 'Bônus', 'Décimo', 'Férias'], limit: 0, preset: true },
  { id: 'investimentos', name: 'Investimentos', type: 'income', icon: '📈', subcategories: ['Dividendos', 'Rendimentos', 'Aluguéis'], limit: 0, preset: true },
  { id: 'saude', name: 'Saúde', type: 'expense', icon: '🏥', subcategories: ['Plano de saúde', 'Farmácia', 'Consultas', 'Exames'], limit: 400, preset: true },
  { id: 'educacao', name: 'Educação', type: 'expense', icon: '📚', subcategories: ['Curso', 'Faculdade', 'Material', 'Livros'], limit: 300, preset: true },
  { id: 'lazer', name: 'Lazer', type: 'expense', icon: '🎬', subcategories: ['Cinema', 'Viagem', 'Streaming', 'Shows', 'Jogos'], limit: 400, preset: true },
  { id: 'vestuario', name: 'Vestuário', type: 'expense', icon: '👕', subcategories: ['Roupas', 'Calçados', 'Acessórios'], limit: 200, preset: true },
  { id: 'imprevistos', name: 'Imprevistos', type: 'expense', icon: '⚠️', subcategories: ['Emergência', 'Conserto', 'Multas'], limit: 300, preset: true },
  { id: 'telefonia', name: 'Telefonia/Internet', type: 'expense', icon: '📱', subcategories: ['Celular', 'Internet fixa'], limit: 150, preset: true },
  { id: 'outros', name: 'Outros', type: 'both', icon: '📦', subcategories: ['...'], limit: 0, preset: true }
];



let state = {
  settings: { ...defaultSettings },
  categories: [...defaultCategories],
  transactions: [],
  fixedExpenses: [],
  initialBalances: [],
  coffers: [],
  cofferSettings: { ...createEmptyState().cofferSettings },
  scenarios: [],
  savingsGoals: [],
  deletedItems: [],
  sort: { key: 'date', order: 'desc' },
  pagination: { page: 1, pageSize: 10 },
  filters: { year: 'all', month: 'all', type: 'all', search: '', category: 'all' },
  reportYear: 'all',
  goals: []
};

let dom = {};

const charts = {
  incomeExpense: null,
  categorySpending: null,
  balanceTrend: null,
  topExpenses: null,
  reportCategory: null,
  reportMonthly: null,
  reportTopIncome: null,
  reportPayment: null,
  purchaseProjection: null,
  balanceProjection: null,
  savingsGoal: null,
  longTermProjection: null
};

const labelsMonths = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
let deferredInstallPrompt = null;
let activeModalTrigger = null;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then((registration) => {
        showToast('Service Worker registrado. Offline suportado.', 'success');
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nova versão disponível. Atualize o aplicativo.', 'info');
            }
          });
        });
      })
      .catch((error) => showToast(`Falha no Service Worker: ${error.message}`, 'error'));
  }
}

function setupPWAInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installBtn = document.getElementById('installAppButton');
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }
  });

  window.addEventListener('appinstalled', () => {
    showToast('LuminaFin instalado com sucesso!', 'success');
    const installBtn = document.getElementById('installAppButton');
    if (installBtn) installBtn.style.display = 'none';
  });
}

function installApp() {
  if (!deferredInstallPrompt) {
    showToast('Instalação não disponível no momento.', 'warning');
    return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      showToast('Instalação iniciada!', 'success');
    } else {
      showToast('Instalação cancelada.', 'warning');
    }
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('installAppButton');
    if (installBtn) installBtn.style.display = 'none';
  });
}

// ==================== PHASE 9: ESTRUTURAS DE CLASSE - PADRÕES OOP ====================

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2, 12);
}

/**
 * Formata valor monetário com suporte a múltiplas moedas
 * @function formatCurrency
 * @description Formata número conforme moeda selecionada (suporta BRL, USD, EUR, GBP, JPY, CAD)
 * @param {number} value - Valor a formatar
 * @param {string} currency - Código da moeda (padrão: BRL)
 * @returns {string} Valor formatado
 */
function formatCurrency(value, currency = state.settings?.currency || 'BRL') {
  return formatCurrencyFromCents(toCents(value), currency);
}

function formatCurrencyFromCents(cents, currency = state.settings?.currency || 'BRL') {
  const baseCurrency = state.settings?.baseCurrency || BASE_CURRENCY;
  const date = dateKey(new Date());
  const amount = convertBaseCentsToDisplayAmount(cents, currency, state.fxRates || [], date, baseCurrency);
  if (amount === null) return formatMoneyFromCents(cents, baseCurrency);
  if (currency === baseCurrency) return formatMoneyFromCents(cents, currency);
  const locale = SUPPORTED_CURRENCIES[currency]?.locale || 'pt-BR';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2
  }).format(amount);
}

function convertInputAmountToBaseCents(value, date = dateKey(new Date()), existing = null) {
  const currency = state.settings?.currency || BASE_CURRENCY;
  const converted = convertDisplayAmountToBaseCents(
    value,
    currency,
    state.fxRates || [],
    date,
    state.settings?.baseCurrency || BASE_CURRENCY
  );
  if (converted !== null) return converted;
  if (existing?.currencyAtEntry === currency
    && Number.isSafeInteger(existing.fxRateToBaseMicros)
    && existing.fxRateToBaseMicros > 0) {
    const numerator = BigInt(toCents(value)) * BigInt(existing.fxRateToBaseMicros);
    const scale = BigInt(FX_RATE_SCALE);
    const rounded = numerator >= 0n
      ? (numerator + scale / 2n) / scale
      : (numerator - scale / 2n) / scale;
    const cents = Number(rounded);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  return null;
}

function convertBaseCentsToInputValue(cents, date = dateKey(new Date())) {
  const currency = state.settings?.currency || BASE_CURRENCY;
  const amount = convertBaseCentsToDisplayAmount(
    cents,
    currency,
    state.fxRates || [],
    date,
    state.settings?.baseCurrency || BASE_CURRENCY
  );
  return amount === null ? fromCents(cents) : amount;
}

function currencySnapshot(nativeAmount, date, existing = null) {
  const currency = state.settings?.currency || BASE_CURRENCY;
  const rate = getExchangeRate(
    state.fxRates || [],
    currency,
    date,
    state.settings?.baseCurrency || BASE_CURRENCY
  ) || (existing?.currencyAtEntry === currency
    && Number.isSafeInteger(existing.fxRateToBaseMicros)
    ? {
      rateToBaseMicros: existing.fxRateToBaseMicros,
      effectiveDate: existing.fxRateEffectiveDate || date
    }
    : null);
  if (!rate) return null;
  return {
    currencyAtEntry: currency,
    amountCentsAtEntry: toCents(nativeAmount),
    fxRateToBaseMicros: rate.rateToBaseMicros,
    fxRateEffectiveDate: rate.effectiveDate
  };
}

// ==================== PHASE 11: SISTEMA DE NOTIFICAÇÕES ====================

const notificationSystem = {
  enablePushNotifications: async () => {
    if (!('Notification' in window)) {
      showToast('Notificações não suportadas neste navegador.', 'warning');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('Notificações já ativadas.', 'info');
      return;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showToast('✓ Notificações ativadas com sucesso!', 'success');
        state.settings.notificationsEnabled = true;
        saveState();
      }
    }
  },

  checkBudgetLimits: (year, month) => {
    if (!state.settings.notificationsEnabled) return;
    
    state.categories.forEach(category => {
      const limitCents = Number.isSafeInteger(category.limitCents)
        ? category.limitCents
        : toCents(category.limit);
      if (limitCents <= 0) return;
      const spentCents = state.transactions
        .filter((transaction) => periodMatches(transaction.date, year, month)
          && (transaction.status === 'paid' || transaction.sourceType === 'creditPurchase')
          && transaction.type === 'expense'
          && transaction.category === category.id)
        .reduce((sum, transaction) => sum + (
          Number.isSafeInteger(transaction.valueCents)
            ? transaction.valueCents
            : toCents(transaction.value)
        ), 0);
      const percentage = limitCents > 0 ? (spentCents / limitCents) * 100 : 0;
      const threshold = state.settings.notifyOnLimitReached || 80;
      
      if (percentage >= threshold && percentage < 100) {
        const notificationId = `budget:${year}-${String(month).padStart(2, '0')}:${category.id}:near`;
        if (state.notifications.some((item) => item.id === notificationId)) return;
        const title = `⚠️ Limite próximo: ${category.icon} ${category.name}`;
        const body = `Você gastou ${percentage.toFixed(0)}% do limite de ${formatCurrencyFromCents(limitCents)}`;
        state.notifications.push({
          id: notificationId,
          type: 'budget-limit',
          categoryId: category.id,
          period: `${year}-${String(month).padStart(2, '0')}`,
          level: 'near',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          version: 1
        });
        notificationSystem.sendNotification(title, body);
      } else if (percentage >= 100) {
        const notificationId = `budget:${year}-${String(month).padStart(2, '0')}:${category.id}:exceeded`;
        if (state.notifications.some((item) => item.id === notificationId)) return;
        const title = `🚨 Limite ultrapassado: ${category.icon} ${category.name}`;
        const body = `Você ultrapassou o limite em ${formatCurrencyFromCents(spentCents - limitCents)}!`;
        state.notifications.push({
          id: notificationId,
          type: 'budget-limit',
          categoryId: category.id,
          period: `${year}-${String(month).padStart(2, '0')}`,
          level: 'exceeded',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          version: 1
        });
        notificationSystem.sendNotification(title, body);
      }
    });
    saveState();
  },

  sendNotification: (title, body) => {
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: body,
          icon: 'icon.svg',
          badge: 'icon.svg',
          tag: 'LuminaFin-alert',
          requireInteraction: false,
          timestamp: Date.now()
        });
      });
    }
  }
};

// ==================== FASE 12: EXPORTAÇÃO AVANÇADA ====================

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

const exportManager = {
  exportToExcel: (year = null) => {
    const transactions = state.transactions.filter((transaction) => periodMatches(transaction.date, year));

    let csv = 'Data,Categoria,Subcategoria,Tipo,Descrição,Valor,Pagamento,Status\n';

    transactions.forEach((transaction) => {
      const category = getCategory(transaction.category);
      const categoryName = category ? category.name : transaction.category;
      const type = transaction.type === 'income' ? 'Entrada' : transaction.type === 'transfer' ? 'Transferência' : 'Saída';
      const status = formatStatus(transaction.status);
      const value = Number.isSafeInteger(transaction.valueCents)
        ? fromCents(transaction.valueCents)
        : transaction.value;
      const row = [
        transaction.date, categoryName, transaction.subcategory || '-', type,
        transaction.description, Number(value).toFixed(2), transaction.payment || '-', status
      ];
      csv += `${row.map(csvCell).join(',')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `LuminaFin-${year || 'todos'}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    showToast('✓ Arquivo CSV exportado com sucesso!', 'success');
  },

  generatePDFContent: (year = null) => {
    const realized = calculatePeriodTotals(state.transactions, year);
    const unsettled = calculateUnsettledPeriodTotals(state.transactions, year);
    const totalIncome = fromCents(realized.incomeCents);
    const totalExpense = fromCents(realized.expenseCents);
    const balance = totalIncome - totalExpense;
    const pendingNet = fromCents(unsettled.pendingIncomeCents - unsettled.pendingExpenseCents);
    const scheduledNet = fromCents(unsettled.scheduledIncomeCents - unsettled.scheduledExpenseCents);
    const forecast = renderForecastData(Number.isInteger(year) ? year : new Date().getFullYear());

    let rows = state.transactions
      .filter((transaction) => periodMatches(transaction.date, year))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((transaction) => {
        const category = getCategory(transaction.category);
        const type = transaction.type === 'income' ? '+ Entrada' : transaction.type === 'transfer' ? 'Transferência' : '- Saída';
        const valueCents = Number.isSafeInteger(transaction.valueCents)
          ? transaction.valueCents
          : toCents(transaction.value);
        return `<tr><td>${sanitizeHtml(transaction.date)}</td><td>${type}</td><td>${sanitizeHtml(category?.name || transaction.category)}</td><td>${sanitizeHtml(transaction.description)}</td><td>${formatCurrencyFromCents(valueCents)}</td><td>${sanitizeHtml(formatStatus(transaction.status))}</td></tr>`;
      }).join('');

    let projectionRows = forecast.map((item) => `
      <tr>
        <td>${labelsMonths[item.month - 1]}/${item.year}</td>
        <td>${formatCurrency(item.projectedIncome)}</td>
        <td>${formatCurrency(item.projectedExpense)}</td>
        <td>${formatCurrency(item.projectedBalance)}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório LuminaFin ${year}</title>
  <style>
    body { font-family: Inter, sans-serif; margin: 24px; color: #111; }
    h1,h2,h3 { margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 10px; border: 1px solid #d1d5db; text-align: left; }
    th { background: #0ea5e9; color: #fff; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 16px; }
    .summary-card { padding: 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; }
  </style>
</head>
<body>
  <h1>LuminaFin</h1>
  <h2>Relatório anual ${year}</h2>
  <div class="summary">
    <div class="summary-card"><strong>Entradas realizadas</strong><p>${formatCurrency(totalIncome)}</p></div>
    <div class="summary-card"><strong>Saídas realizadas</strong><p>${formatCurrency(totalExpense)}</p></div>
    <div class="summary-card"><strong>Saldo realizado</strong><p>${formatCurrency(balance)}</p></div>
    <div class="summary-card"><strong>Pendências (líquido)</strong><p>${formatCurrency(pendingNet)}</p></div>
    <div class="summary-card"><strong>Agendado (líquido)</strong><p>${formatCurrency(scheduledNet)}</p></div>
    <div class="summary-card"><strong>Projeção média</strong><p>${formatCurrency(forecast.reduce((sum, item) => sum + item.projectedBalance, 0) / Math.max(forecast.length, 1))}</p></div>
  </div>
  <h3>Transações</h3>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h3>Projeções futuras</h3>
  <table>
    <thead><tr><th>Período</th><th>Receitas</th><th>Despesas</th><th>Saldo projetado</th></tr></thead>
    <tbody>${projectionRows}</tbody>
  </table>
</body>
</html>`;
  },

  downloadPDF: (year = null) => {
    const content = exportManager.generatePDFContent(year);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.', 'error');
      return;
    }
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    showToast('✓ Relatório pronto para salvar como PDF via impressão do navegador.', 'info');
  }
};

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// ==================== UTILIDADES DE PERFORMANCE ====================

/**
 * Debounce: Reduz chamadas frequentes de função (ex: busca enquanto digita)
 * @param {Function} func - Função a ser executada
 * @param {number} delay - Atraso em ms (padrão: 300ms)
 * @returns {Function} Função com debounce aplicado
 */
function debounce(func, delay = 300) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Sistema de cache para cálculos custosos
 */
const calcCache = {
  data: {},
  
  /**
   * Gera chave de cache baseada em parâmetros
   */
  key(...params) {
    return params.map(p => typeof p === 'object' ? JSON.stringify(p) : p).join(':');
  },
  
  /**
   * Obtém valor do cache (retorna null se expirado)
   */
  get(key) {
    const cached = this.data[key];
    if (!cached) return null;
    
    // Expirar cache após 5 minutos
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
      delete this.data[key];
      return null;
    }
    return cached.value;
  },
  
  /**
   * Armazena valor em cache
   */
  set(key, value) {
    this.data[key] = { value, timestamp: Date.now() };
  },
  
  /**
   * Limpa todo o cache
   */
  clear() {
    this.data = {};
  }
};

/**
 * Sistema de Trash Bin - Recuperação de dados deletados
 */
const trashBin = {
  /**
   * Move item para lixeira (30 dias de retenção)
   * @param {string} type - Tipo: 'transaction', 'category', 'fixedExpense'
   * @param {Object} item - Item a ser movido
   */
  moveToTrash(type, item) {
    const timestamp = new Date().toISOString();
    const trashItem = {
      id: createId(),
      entityId: item.id,
      type,
      data: { ...item },
      deletedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 dias
    };
    
    state.deletedItems.push(trashItem);
    this.cleanExpired(); // Limpar itens expirados
    saveState();
  },
  
  /**
   * Recupera item da lixeira
   * @param {string} id - ID do item na lixeira
   * @returns {Object|null} Item recuperado ou null se não encontrado
   */
  restoreFromTrash(id) {
    const index = state.deletedItems.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    const trashItem = state.deletedItems.splice(index, 1)[0];
    saveState();
    
    return trashItem.data;
  },
  
  /**
   * Lista itens na lixeira por tipo
   * @param {string} type - Tipo opcional para filtrar
   * @returns {Array} Itens na lixeira
   */
  listTrash(type = null) {
    this.cleanExpired();
    let items = state.deletedItems.slice();
    
    if (type) {
      items = items.filter(item => item.type === type);
    }
    
    return items;
  },
  
  /**
   * Limpa itens expirados da lixeira
   */
  cleanExpired() {
    const now = new Date();
    state.deletedItems = state.deletedItems.filter(item => 
      new Date(item.expiresAt) > now
    );
  },
  
  /**
   * Deleta permanentemente item da lixeira
   * @param {string} id - ID do item na lixeira
   */
  permanentDelete(id) {
    const index = state.deletedItems.findIndex(item => item.id === id);
    if (index !== -1) {
      state.deletedItems.splice(index, 1);
      saveState();
    }
  }
};

function renderTrashStatus() {
  const items = trashBin.listTrash();
  const count = items.length;
  const statusText = count === 0 ? 'Lixeira vazia' : `${count} item${count === 1 ? '' : 's'} na lixeira`;
  const statusElement = document.getElementById('trashStatusText');
  if (statusElement) statusElement.textContent = statusText;
  const list = document.getElementById('trashItemsList');
  if (!list) return;
  list.innerHTML = items.map((item) => {
    const data = item.data || {};
    const label = data.name || data.description || data.title || item.type;
    return `<div class="trash-item">
      <span>${sanitizeHtml(label)} · ${sanitizeHtml(item.type)} · ${sanitizeHtml(item.deletedAt?.slice(0, 10) || '')}</span>
      <button type="button" class="secondary-button small" data-action="restore-trash" data-id="${sanitizeHtml(item.id)}" aria-label="Restaurar ${sanitizeHtml(label)}">Restaurar</button>
    </div>`;
  }).join('');
}

function restoreLastTrashItem() {
  const items = trashBin.listTrash();
  if (items.length === 0) {
    showToast('Lixeira vazia.', 'warning');
    return;
  }

  const lastItem = items[items.length - 1];
  restoreTrashItem(lastItem.id);
}

function restoreTrashItem(trashId) {
  const lastItem = trashBin.listTrash().find((item) => item.id === trashId);
  if (!lastItem) {
    showToast('Item não encontrado na lixeira.', 'error');
    return;
  }
  if (['transaction', 'fixedExpense'].includes(lastItem.type)
    && lastItem.data?.category
    && !state.categories.some((category) => category.id === lastItem.data.category)) {
    showToast('Restaure ou recrie a categoria vinculada antes de restaurar este item.', 'warning');
    return;
  }
  const restored = trashBin.restoreFromTrash(lastItem.id);
  if (!restored) {
    showToast('Não foi possível restaurar o item.', 'error');
    return;
  }

  const alreadyExists = [
    state.transactions,
    state.categories,
    state.fixedExpenses,
    state.coffers
  ].some((collection) => collection.some((item) => item.id === restored.id));
  if (alreadyExists) {
    state.deletedItems.push(lastItem);
    saveState();
    showToast('Já existe um item com este ID; o item permaneceu na lixeira.', 'error');
    return;
  }
  if (lastItem.type === 'transaction') {
    state.transactions.push(restored);
  } else if (lastItem.type === 'category') {
    state.categories.push(restored);
    rebuildCategoryDropdowns();
  } else if (lastItem.type === 'fixedExpense') {
    state.fixedExpenses.push(restored);
  } else if (lastItem.type === 'coffer') {
    state.coffers.push(restored);
  }

  saveState();
  renderAllUI();
  showToast('Item restaurado da lixeira.', 'success');
}

function emptyTrash() {
  showDangerConfirmModal(
    'Esvaziar lixeira',
    'Deseja esvaziar permanentemente a lixeira?',
    'ESVAZIAR',
    () => {
      state.deletedItems = [];
      saveState();
      renderTrashStatus();
      showToast('Lixeira esvaziada permanentemente.', 'success');
    }
  );
}

/**
 * Valida e sanitiza dados de entrada
 * @param {string} type - Tipo de validação: 'currency', 'email', 'date', 'number', 'text'
 * @param {any} value - Valor a validar
 * @returns {boolean} True se válido
 */
function validateInput(type, value) {
  const validators = {
    currency: (v) => !isNaN(parseFloat(v)) && isFinite(v) && v >= 0,
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)),
    number: (v) => !isNaN(parseFloat(v)) && isFinite(v),
    text: (v) => typeof v === 'string' && v.trim().length > 0,
    day: (v) => !isNaN(v) && v >= 1 && v <= 28,
    month: (v) => !isNaN(v) && v >= 1 && v <= 12,
    year: (v) => !isNaN(v) && v >= 2000 && v <= 2100
  };
  
  return validators[type] ? validators[type](value) : true;
}

/**
 * Sanitiza string para evitar XSS
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizada
 */
function sanitizeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// ==================== PHASE 3: FUNÇÕES AUXILIARES - ELIMINANDO DUPLICAÇÃO ====================

/**
 * Renderiza todos os componentes da UI (consolidando múltiplas chamadas)
 * PHASE 3: Elimina duplicação de renderização
 */
function renderAllUI(options = {}) {
  const { dashboard = true, transactions = true, categories = true, fixed = true, coffers = true, creditCards = true, reports = true, limits = true, editor = true, trash = true } = options;
  calcCache.clear();
  if (dashboard) renderDashboard();
  if (transactions) renderTransactionTable();
  if (categories) renderCategoryTable();
  if (fixed) renderFixedTable();
  if (coffers) renderCoffers();
  if (creditCards) renderCreditCards();
  if (reports) renderReportPage();
  if (limits) renderLimitsTable();
  if (editor) updateRawEditor();
  if (trash) renderTrashStatus();
}

/**
 * Fecha modais e renderiza UI (padrão comum em submissões)
 * PHASE 3: Consolida closeModals() + renderAllUI()
 */
function closeAndRender(renderOptions = { transactions: true, categories: true, fixed: true, reports: true }) {
  closeModals();
  renderAllUI(renderOptions);
}

/**
 * Abre modal genérica com título (consolida padrão repetido)
 * PHASE 3: Reduz duplicação de abertura de modais
 */
function openModal(modalId, titleId, titleText) {
  const modal = document.getElementById(modalId);
  if (modal) {
    activateModal(modal);
    const titleEl = document.getElementById(titleId);
    if (titleEl) titleEl.textContent = titleText;
  }
}

function activateModal(modal) {
  activeModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('active');
  modal.setAttribute('tabindex', '-1');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'false');
  const title = modal.querySelector('h2, h3, h4');
  if (title) {
    if (!title.id) title.id = `${modal.id || 'modal'}Title`;
    modal.setAttribute('aria-labelledby', title.id);
  }
  requestAnimationFrame(() => {
    const target = modal.querySelector('[autofocus]')
      || modal.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
    (target || modal).focus();
  });
}

/**
 * Define valores em múltiplos campos de formulário
 * PHASE 3: Reduz duplicação de preenchimento de modais
 */
function setFormValues(valueMap) {
  Object.entries(valueMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      if (element.type === 'checkbox') {
        element.checked = value;
      } else {
        element.value = value || '';
      }
    }
  });
}

// ==================== FIM FUNÇÕES AUXILIARES - PHASE 3 ====================

// ==================== PHASE 4: MELHORIAS UX - BUSCA E SUGESTÕES ====================

/**
 * Busca global em transações, categorias e gastos fixos
 * PHASE 4: Busca unificada
 */
function globalSearch(query) {
  const lowerQuery = query.toLowerCase();
  
  // Buscar em transações
  const transactionResults = state.transactions.filter(t => 
    t.description.toLowerCase().includes(lowerQuery) ||
    t.category.toLowerCase().includes(lowerQuery) ||
    (t.payment && t.payment.toLowerCase().includes(lowerQuery))
  ).map(t => ({
    type: 'transaction',
    data: t,
    label: `${t.description} - ${formatCurrency(t.value)}`
  }));
  
  // Buscar em categorias
  const categoryResults = state.categories.filter(c =>
    c.name.toLowerCase().includes(lowerQuery)
  ).map(c => ({
    type: 'category',
    data: c,
    label: `${c.icon} ${c.name}`
  }));
  
  // Buscar em gastos fixos
  const fixedResults = state.fixedExpenses.filter(f =>
    f.description.toLowerCase().includes(lowerQuery)
  ).map(f => ({
    type: 'fixed',
    data: f,
    label: `${f.description} - ${formatCurrency(f.value)}/mês`
  }));
  
  return {
    transactions: transactionResults,
    categories: categoryResults,
    fixed: fixedResults,
    total: transactionResults.length + categoryResults.length + fixedResults.length
  };
}

// ==================== FIM MELHORIAS UX - PHASE 4 ====================

// ==================== PHASE 5: RELATÓRIOS AVANÇADOS - MoM, TENDÊNCIAS, PREVISÕES ====================

/**
 * Calcula tendência: média dos últimos 3 meses
 * PHASE 5: Média móvel de 3 meses
 */
function sumByPeriodForProjection(year, month, type) {
  const cents = state.transactions
    .filter((item) => periodMatches(item.date, year, month)
      && item.status === 'paid'
      && item.type === type
      && item.sourceType !== 'fixedExpense')
    .reduce((sum, item) => sum + (
      Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value)
    ), 0);
  return fromCents(cents);
}

function getKnownFutureCents(year, month, type) {
  const unsettled = calculateUnsettledPeriodTotals(state.transactions, year, month);
  const pendingCents = type === 'income' ? unsettled.pendingIncomeCents : unsettled.pendingExpenseCents;
  const scheduledCents = type === 'income' ? unsettled.scheduledIncomeCents : unsettled.scheduledExpenseCents;
  if (type !== 'expense') return pendingCents + scheduledCents;

  const sourceMonth = `${year}-${String(month).padStart(2, '0')}`;
  const fixedCents = state.fixedExpenses
    .filter((item) => isFixedExpenseActiveInMonth(item, new Date(year, month - 1, 1)))
    .filter((fixed) => !state.transactions.some((item) => (
      item.sourceType === 'fixedExpense'
      && item.sourceId === fixed.id
      && item.sourceMonth === sourceMonth
    )))
    .reduce((sum, item) => sum + (
      Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value)
    ), 0);
  return pendingCents + scheduledCents + fixedCents;
}

function calculateTrend(year, month, type = 'expense') {
  let months = [];
  
  // Coletar últimos 3 meses
  for (let i = 0; i < 3; i++) {
    let m = month - i;
    let y = year;
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push(sumByPeriodForProjection(y, m, type));
  }
  
  const average = months.reduce((a, b) => a + b, 0) / 3;
  return average;
}

/**
 * Calcula previsão para próximos meses (baseada em média de 3 meses)
 * PHASE 5: Previsão simples
 */
function forecastNextMonths(year, month, type = 'expense', months = 3) {
  const trend = calculateTrend(year, month, type);
  const lastMonth = month === 1 ? sumByPeriodForProjection(year - 1, 12, type) : sumByPeriodForProjection(year, month - 1, type);
  const prevMonth = month <= 2 ? sumByPeriodForProjection(year - 1, 12 - (2 - month), type) : sumByPeriodForProjection(year, month - 2, type);
  const momentum = prevMonth ? (lastMonth - prevMonth) * 0.2 : 0;
  const basePrediction = Math.max(0, trend + momentum);
  const forecast = [];
  
  for (let i = 1; i <= months; i++) {
    let m = month + i;
    let y = year;
    if (m > 12) {
      m -= 12;
      y += 1;
    }
    
    const annualInflationRate = Math.max(0, Number(state.settings.annualInflationBps) || 0) / 10000;
    const growthFactor = Math.pow(1 + annualInflationRate, i / 12);
    const knownFutureCents = getKnownFutureCents(y, m, type);
    const predicted = Math.round((basePrediction * growthFactor + fromCents(knownFutureCents)) * 100) / 100;
    forecast.push({
      month: m,
      year: y,
      predicted,
      variation: prevMonth ? Math.round(((predicted - lastMonth) / Math.max(lastMonth, 1)) * 100 * 10) / 10 : 0
    });
  }
  
  return forecast;
}

function renderForecastData(year, months = 3) {
  const today = new Date();
  const currentMonth = year === today.getFullYear() ? today.getMonth() + 1 : 12;
  const incomeForecast = forecastNextMonths(year, currentMonth, 'income', months);
  const expenseForecast = forecastNextMonths(year, currentMonth, 'expense', months);

  return incomeForecast.map((item, index) => {
    const expenseItem = expenseForecast[index] || { predicted: 0 };
    return {
      month: item.month,
      year: item.year,
      projectedIncome: item.predicted,
      projectedExpense: expenseItem.predicted,
      projectedBalance: Math.round((item.predicted - expenseItem.predicted) * 100) / 100
    };
  });
}

function calculateAverageMonthly(type, months = 3) {
  const today = new Date();
  let currentMonth = today.getMonth() + 1;
  let currentYear = today.getFullYear();
  const values = [];
  for (let i = 0; i < months; i++) {
    let month = currentMonth - i;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    values.push(sumByPeriod(year, month, type));
  }
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return Math.round(average * 100) / 100;
}

function calculateCurrentBalance() {
  return calculateAccountBalanceAt(state.transactions, state.initialBalances || [], dateKey(new Date()));
}

function renderFinancialPosition() {
  if (!dom.positionAccountBalance) return;
  const accountBalanceCents = calculateCurrentBalance();
  const cofferBalances = calculateCofferBalances(state.coffers, state.transactions);
  const principalCents = cofferBalances.reduce((sum, item) => sum + item.principalCents, 0);
  const yieldCents = cofferBalances.reduce((sum, item) => sum + item.yieldCents, 0);
  const cofferTotalCents = principalCents + yieldCents;
  const today = new Date();
  const unsettled = calculateUnsettledPeriodTotals(
    state.transactions,
    today.getFullYear(),
    today.getMonth() + 1
  );
  const projectedAccountCents = accountBalanceCents
    + unsettled.pendingIncomeCents - unsettled.pendingExpenseCents
    + unsettled.scheduledIncomeCents - unsettled.scheduledExpenseCents;

  dom.positionAccountBalance.textContent = formatCurrencyFromCents(accountBalanceCents);
  if (dom.positionProjectedBalance) {
    dom.positionProjectedBalance.textContent = formatCurrencyFromCents(projectedAccountCents);
  }
  dom.positionCofferBalance.textContent = formatCurrencyFromCents(cofferTotalCents);
  dom.positionCofferComposition.textContent = `Principal ${formatCurrencyFromCents(principalCents)} · rendimento ${formatCurrencyFromCents(yieldCents)}`;
  dom.positionNetWorth.textContent = formatCurrencyFromCents(accountBalanceCents + cofferTotalCents);
  dom.positionPendingIncome.textContent = formatCurrencyFromCents(unsettled.pendingIncomeCents);
  dom.positionPendingExpense.textContent = formatCurrencyFromCents(unsettled.pendingExpenseCents);
  dom.positionScheduledIncome.textContent = formatCurrencyFromCents(unsettled.scheduledIncomeCents);
  dom.positionScheduledExpense.textContent = formatCurrencyFromCents(unsettled.scheduledExpenseCents);
}

/**
 * Calcula o saldo acumulado até o final do mês anterior ao especificado
 * @param {number} year - Ano
 * @param {number} month - Mês (1-12)
 * @returns {number} Saldo acumulado até o final do mês anterior
 */
function calculateBalanceUpToPreviousMonth(year, month) {
  return calculateFilteredOpeningBalance(
    state.transactions,
    state.initialBalances || [],
    year,
    month
  );
}

function renderPurchaseProjection() {
  if (!dom.purchaseProjectionResult) return;
  const enteredAmount = Number(dom.purchaseValue?.value) || 0;
  const amountCents = convertInputAmountToBaseCents(enteredAmount);
  if (enteredAmount > 0 && amountCents === null) {
    showToast('Cadastre uma taxa de câmbio válida para converter o valor informado.', 'error');
    return;
  }
  if (!amountCents || amountCents <= 0) {
    dom.purchaseProjectionResult.textContent = 'Informe o valor da compra para estimar seu impacto.';
    dom.purchaseInsightsContent?.replaceChildren();
    if (charts.purchaseProjection) {
      charts.purchaseProjection.destroy();
      charts.purchaseProjection = null;
    }
    return;
  }
  const installments = Math.max(1, Number(dom.purchaseInstallments?.value) || 1);
  const optionalCents = (input) => {
    if (!input || input.value.trim() === '') return 0;
    const converted = convertInputAmountToBaseCents(Number(input.value));
    if (converted === null) throw new Error('Cadastre uma taxa de câmbio válida para os ajustes informados.');
    return converted;
  };
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const additionalIncomeCents = optionalCents(dom.purchaseMonthlyIncome);
    const additionalExpenseCents = optionalCents(dom.purchaseMonthlyExpense);
    const monthlyPosition = summarizeMonthlyBudget({
      transactions: state.transactions,
      fixedExpenses: state.fixedExpenses,
      year,
      month
    });
    monthlyPosition.estimatedIncomeCents = additionalIncomeCents;
    monthlyPosition.estimatedExpenseCents = additionalExpenseCents;

    const accountBalanceCents = calculateCurrentBalance();
    const decision = evaluatePurchaseDecision({
      amountCents,
      installments,
      accountBalanceCents,
      monthlyPosition,
      coffers: state.coffers,
      transactions: state.transactions
    });
    const verdicts = {
      comfortable: ['Cabe com folga', 'var(--success)'],
      tight: ['Cabe, mas aperta o orçamento', 'var(--warning)'],
      'not-affordable': ['Não cabe sem reduzir a compra ou rever o plano', 'var(--danger)']
    };
    const [verdictLabel, verdictColor] = verdicts[decision.verdict];
    const suggestedCoffer = decision.suggestedCoffer;
    const cofferAdvice = decision.cashShortfallCents > 0
      ? suggestedCoffer
        ? `<p>Faltam ${formatCurrencyFromCents(decision.cashShortfallCents)} na conta. Um resgate de ${formatCurrencyFromCents(suggestedCoffer.grossWithdrawalCents)} do cofrinho <strong>${sanitizeHtml(suggestedCoffer.name)}</strong> libera aproximadamente ${formatCurrencyFromCents(suggestedCoffer.netReceivedCents)}; perda estimada de rendimento: ${formatCurrencyFromCents(suggestedCoffer.yieldLossCents)}.</p>`
        : '<p>Nenhum cofrinho ativo cobre o valor faltante sem exceder seu saldo líquido disponível.</p>'
      : '<p>O pagamento inicial cabe no saldo realizado da conta; os cofrinhos permanecem aplicados.</p>';

    const futureCount = Math.min(Math.max(installments - 1, 3), 6);
    const incomeForecast = forecastNextMonths(year, month, 'income', futureCount);
    const expenseForecast = forecastNextMonths(year, month, 'expense', futureCount);
    let projectedAccountCents = decision.monthEndAccountAfterPurchaseCents;
    const flowRows = [
      `<tr><th>Fim deste mês</th><td>${formatCurrencyFromCents(projectedAccountCents)}</td><td>${formatCurrencyFromCents(decision.installmentCents)}</td></tr>`
    ];
    for (let index = 0; index < futureCount; index += 1) {
      const incomeCents = toCents(incomeForecast[index]?.predicted || 0);
      const expenseCents = toCents(expenseForecast[index]?.predicted || 0);
      const nextInstallmentCents = index + 1 < installments ? decision.installmentCents : 0;
      projectedAccountCents += incomeCents - expenseCents - nextInstallmentCents;
      const forecastDate = new Date(year, month + index, 1);
      flowRows.push(`<tr><th>${labelsMonths[forecastDate.getMonth()]} ${forecastDate.getFullYear()}</th><td>${formatCurrencyFromCents(projectedAccountCents)}</td><td>${formatCurrencyFromCents(nextInstallmentCents)}</td></tr>`);
    }

    dom.purchaseProjectionResult.innerHTML = `
      <div class="purchase-verdict" style="--verdict-color:${verdictColor}">
        <strong>${verdictLabel}</strong>
        <span>${installments}x de até ${formatCurrencyFromCents(decision.installmentCents)}</span>
      </div>
      <dl class="purchase-budget-breakdown">
        <div><dt>Conta realizada hoje</dt><dd>${formatCurrencyFromCents(accountBalanceCents)}</dd></div>
        <div><dt>Receita paga no mês</dt><dd>${formatCurrencyFromCents(monthlyPosition.paidIncomeCents)}</dd></div>
        <div><dt>Despesas pagas</dt><dd>${formatCurrencyFromCents(monthlyPosition.paidExpenseCents)}</dd></div>
        <div><dt>Boletos pendentes</dt><dd>${formatCurrencyFromCents(monthlyPosition.pendingExpenseCents)}</dd></div>
        <div><dt>Saídas agendadas</dt><dd>${formatCurrencyFromCents(monthlyPosition.scheduledExpenseCents)}</dd></div>
        <div><dt>Gastos fixos sem ocorrência</dt><dd>${formatCurrencyFromCents(monthlyPosition.ungeneratedFixedExpenseCents)}</dd></div>
        <div><dt>Sobra segura após a parcela</dt><dd>${formatCurrencyFromCents(decision.safeRemainingAfterPurchaseCents)}</dd></div>
        <div><dt>Fechamento conservador (sem entradas futuras)</dt><dd>${formatCurrencyFromCents(decision.safeMonthEndAccountAfterPurchaseCents)}</dd></div>
        <div><dt>Fechamento esperado</dt><dd>${formatCurrencyFromCents(decision.monthEndAccountAfterPurchaseCents)}</dd></div>
      </dl>
      <p class="purchase-pending-note">Receitas pendentes (${formatCurrencyFromCents(monthlyPosition.pendingIncomeCents)}), agendadas (${formatCurrencyFromCents(monthlyPosition.scheduledIncomeCents)}) e estimadas (${formatCurrencyFromCents(additionalIncomeCents)}) não entram na sobra segura.</p>
      ${cofferAdvice}
      <table class="purchase-flow-table"><thead><tr><th>Fluxo estimado</th><th>Saldo da conta</th><th>Parcela</th></tr></thead><tbody>${flowRows.join('')}</tbody></table>
    `;
    const insights = [
      decision.verdict === 'comfortable'
        ? 'A parcela cabe após reservar as obrigações conhecidas.'
        : decision.verdict === 'tight'
          ? 'A compra deixa pouca margem depois dos boletos e fixos deste mês.'
          : 'Considere reduzir o valor, aumentar o prazo ou adiar a compra.'
    ];
    if (installments > 12) insights.push('A projeção mostra até seis meses; as parcelas continuam após esse horizonte.');
    dom.purchaseInsightsContent.innerHTML = insights.map((insight) => `<div>${sanitizeHtml(insight)}</div>`).join('');

    charts.purchaseProjection = renderChart(charts.purchaseProjection, dom.chartPurchaseProjection, {
    type: 'bar',
    data: {
      labels: ['Conta atual', 'Após primeira parcela', 'Sobra mensal segura'],
      datasets: [{
        label: 'Valor',
        data: [
          fromCents(accountBalanceCents),
          fromCents(decision.accountAfterFirstPaymentCents),
          fromCents(decision.safeRemainingAfterPurchaseCents)
        ],
        backgroundColor: ['#38bdf8', '#f59e0b', decision.safeRemainingAfterPurchaseCents >= 0 ? '#22c55e' : '#ef4444']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${formatCurrency(context.parsed.y)}`;
            }
          }
        }
      },
      scales: chartScaleOptions()
    }
  });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function calculateBalanceProjection({ startBalance, monthlyIncome, monthlyExpense, months }) {
  const balance = typeof startBalance === 'number' && Number.isFinite(startBalance)
    ? startBalance
    : fromCents(calculateCurrentBalance());
  const income = typeof monthlyIncome === 'number' && monthlyIncome >= 0 ? monthlyIncome : calculateAverageMonthly('income', 3);
  const expense = typeof monthlyExpense === 'number' && monthlyExpense >= 0 ? monthlyExpense : calculateAverageMonthly('expense', 3);
  const horizon = Math.max(1, Math.round(months));
  const monthlyNet = Math.round((income - expense) * 100) / 100;
  const projectedBalance = Math.round((balance + monthlyNet * horizon) * 100) / 100;
  return { balance, income, expense, horizon, monthlyNet, projectedBalance };
}

function renderLongTermProjection() {
  if (!dom.longTermProjectionResult) return;
  if (dom.futureCdiAnnual && dom.futureCdiAnnual.value === '') {
    dom.futureCdiAnnual.value = (state.cofferSettings.annualCdiBps / 100).toFixed(2);
  }
  if (dom.futureInflation && dom.futureInflation.value === '') {
    dom.futureInflation.value = ((state.settings.annualInflationBps || 0) / 100).toFixed(2);
  }

  const cofferBalances = calculateCofferBalances(state.coffers, state.transactions);
  const currentCofferCents = cofferBalances.reduce((sum, item) => sum + item.totalCents, 0);
  const savedMonthlyGoal = state.savingsGoals[0]?.monthlyGoalCents || 0;
  const readAmountCents = (input, fallbackCents) => {
    if (!input || input.value.trim() === '') return fallbackCents;
    return convertInputAmountToBaseCents(Number(input.value));
  };
  const initialCents = readAmountCents(dom.futureStartingBalance, currentCofferCents);
  const monthlyContributionCents = readAmountCents(dom.futureMonthlyContribution, savedMonthlyGoal);
  const cdiPercent = Number(dom.futureCdiAnnual?.value);
  const inflationPercent = Number(dom.futureInflation?.value);
  const scenarioMultiplier = Number(dom.futureScenario?.value || 1);
  const years = Number(dom.futureYears?.value || 10);
  if (initialCents === null || monthlyContributionCents === null
    || !Number.isFinite(cdiPercent) || cdiPercent < 0
    || !Number.isFinite(inflationPercent) || inflationPercent < 0 || inflationPercent > 100) {
    dom.longTermProjectionResult.textContent = 'Informe valores válidos e uma taxa de câmbio registrada para os valores informados.';
    return;
  }

  const annualReturnBps = Math.round(cdiPercent * scenarioMultiplier * 100);
  const annualInflationBps = Math.round(inflationPercent * 100);
  const projection = simulateLongTermSavings({
    initialCents,
    monthlyContributionCents,
    annualReturnBps,
    annualInflationBps,
    years
  });
  const returnPercent = (annualReturnBps / 100).toFixed(2).replace('.', ',');
  dom.longTermProjectionResult.innerHTML = `
    <dl class="long-term-metrics">
      <div><dt>Saldo nominal em ${years} anos</dt><dd>${formatCurrencyFromCents(projection.finalNominalCents)}</dd></div>
      <div><dt>Poder de compra estimado hoje</dt><dd>${formatCurrencyFromCents(projection.finalRealCents)}</dd></div>
      <div><dt>Total aportado</dt><dd>${formatCurrencyFromCents(projection.totalContributionsCents)}</dd></div>
      <div><dt>Taxa anual simulada</dt><dd>${returnPercent}% · ${formatCurrencyFromCents(monthlyContributionCents)}/mês</dd></div>
    </dl>
    <p>Saldo inicial: ${formatCurrencyFromCents(initialCents)}. Aportes ocorrem ao fim de cada mês. A taxa é uma hipótese constante, antes de impostos e sem garantia de rendimento.</p>
  `;

  charts.longTermProjection = renderChart(charts.longTermProjection, dom.chartLongTermProjection, {
    type: 'line',
    data: {
      labels: projection.points.map((item) => `${item.year} ${item.year === 1 ? 'ano' : 'anos'}`),
      datasets: [
        { label: 'Nominal', data: projection.points.map((item) => fromCents(item.nominalCents)), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.12)', fill: false, tension: 0.2 },
        { label: 'Valor de hoje', data: projection.points.map((item) => fromCents(item.realCents)), borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)', fill: false, tension: 0.2 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: chartScaleOptions() }
  });
}

function renderProjectionDashboard() {
  if (!dom.projectionDashboard) return;

  const avgIncome = calculateAverageMonthly('income', 3);
  const avgExpense = calculateAverageMonthly('expense', 3);
  const savingsCapacity = Math.max(0, avgIncome - avgExpense);

  const sixMonthProjection = calculateBalanceProjection({
    months: 6,
    monthlyIncome: avgIncome,
    monthlyExpense: avgExpense
  }).projectedBalance;

  const safeInstallmentLimit = Math.max(0, (avgIncome * 0.3) - avgExpense); // 30% da renda para parcelas

  if (dom.savingsCapacity) dom.savingsCapacity.textContent = formatCurrency(savingsCapacity);
  if (dom.sixMonthProjection) dom.sixMonthProjection.textContent = formatCurrency(sixMonthProjection);
  if (dom.safeInstallmentLimit) dom.safeInstallmentLimit.textContent = formatCurrency(safeInstallmentLimit);
}

function renderBalanceProjection() {
  if (!dom.balanceProjectionResult) return;
  const convertOptionalInput = (input) => {
    if (!input || input.value.trim() === '') return undefined;
    const cents = convertInputAmountToBaseCents(Number(input.value));
    return cents === null ? undefined : fromCents(cents);
  };
  const startBalance = convertOptionalInput(dom.balanceStartValue);
  const balanceMonthlyIncome = convertOptionalInput(dom.balanceMonthlyIncome);
  const balanceMonthlyExpense = convertOptionalInput(dom.balanceMonthlyExpense);
  const months = Number(dom.balanceProjectionMonths?.value) || 6;

  const projection = calculateBalanceProjection({
    startBalance,
    monthlyIncome: balanceMonthlyIncome,
    monthlyExpense: balanceMonthlyExpense,
    months
  });

  // Análises elaboradas
  const savingsRate = projection.income > 0 ? (projection.monthlyNet / projection.income) * 100 : null;
  const emergencyFund = projection.expense * 3;
  const monthlyRatio = projection.expense > 0 ? projection.balance / projection.expense : null;
  const projectedRatio = projection.expense > 0 ? projection.projectedBalance / projection.expense : null;
  const breakEvenMonth = projection.monthlyNet >= 0
    ? null
    : Math.max(0, Math.ceil(projection.balance / Math.abs(projection.monthlyNet)));

  const healthStatus = projection.projectedBalance >= 0 ? '✅ Projeção positiva' : '🚨 Projeção negativa';
  const healthColor = projection.projectedBalance >= 0 ? '#16a34a' : '#dc2626';
  const trenddDirection = projection.monthlyNet > 0 ? '📈 Crescimento' : projection.monthlyNet < 0 ? '📉 Declínio' : '→ Estabilidade';

  dom.balanceProjectionResult.innerHTML = `
    <div style="background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
      <div><strong>💰 Posição Financeira Atual</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Saldo inicial:</strong> <span style="font-size: 1.1rem; color: ${projection.balance >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(projection.balance)}</span></div>
      <div style="margin-top: 0.5rem;"><strong>Cobertura de despesas:</strong> ${monthlyRatio === null ? '— (sem despesas estimadas)' : `<span style="color: ${monthlyRatio >= 3 ? '#22c55e' : monthlyRatio >= 1 ? '#f59e0b' : '#ef4444'};">${monthlyRatio.toFixed(1)}x</span> (${(monthlyRatio * 30).toFixed(0)} dias)`}</div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: rgba(100, 116, 139, 0.1); border-radius: 8px;">
      <div><strong>📊 Fluxo Financeiro Mensal</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Receita mensal:</strong> <span style="color: #22c55e;">${formatCurrency(projection.income)}</span></div>
      <div><strong>Despesa mensal:</strong> <span style="color: #ef4444;">${formatCurrency(projection.expense)}</span></div>
      <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3);"><strong>Saldo líquido mensal:</strong> <span style="font-size: 1.1rem; color: ${projection.monthlyNet >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(projection.monthlyNet)}</span></div>
      <div><strong>Taxa de economia:</strong> ${savingsRate === null ? '— (sem renda estimada)' : `<span style="color: ${savingsRate >= 20 ? '#22c55e' : savingsRate >= 10 ? '#f59e0b' : '#ef4444'};">${savingsRate.toFixed(1)}%</span>`}</div>
      <div style="margin-top: 0.5rem;"><strong>Tendência:</strong> <span>${trenddDirection}</span></div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: rgba(${projection.projectedBalance >= 0 ? '34, 197, 94' : '239, 68, 68'}, 0.1); border-left: 4px solid ${healthColor}; border-radius: 8px;">
      <div><strong>🔮 Projeção em ${projection.horizon} ${projection.horizon === 1 ? 'mês' : 'meses'}</strong></div>
      <div style="margin-top: 0.75rem; font-size: 1.2rem; font-weight: 700; color: ${healthColor};">Saldo final: ${formatCurrency(projection.projectedBalance)}</div>
      <div style="margin-top: 0.5rem; color: ${healthColor}; font-weight: 600;">${healthStatus}</div>
      <div style="margin-top: 0.5rem;"><strong>Cobertura de despesas:</strong> ${projectedRatio === null ? '— (sem despesas estimadas)' : `${projectedRatio.toFixed(1)}x (${(projectedRatio * 30).toFixed(0)} dias)`}</div>
      ${breakEvenMonth ? `<div style="margin-top: 0.25rem; color: #ef4444;"><strong>⚠️ Saldo zera em:</strong> ${breakEvenMonth} meses</div>` : ''}
      <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3);"><strong>Fundo de emergência ideal:</strong> ${formatCurrency(emergencyFund)}</div>
      <div><strong>Gap para emergência:</strong> <span style="color: ${projection.projectedBalance >= emergencyFund ? '#22c55e' : '#ef4444'};">${formatCurrency(Math.max(0, emergencyFund - projection.projectedBalance))}</span></div>
    </div>
  `;

  // Generate balance evolution data
  const balanceData = [];
  let currentBalance = projection.balance;
  for (let i = 0; i <= projection.horizon; i++) {
    balanceData.push(currentBalance);
    if (i < projection.horizon) {
      currentBalance += projection.monthlyNet;
    }
  }

  const labels = ['Mês Atual'];
  for (let i = 1; i <= projection.horizon; i++) {
    labels.push(`Mês ${i}`);
  }

  const chartData = {
    labels: labels,
    datasets: [{
      label: 'Saldo Projetado',
      data: balanceData,
      borderColor: projection.projectedBalance >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)',
      backgroundColor: projection.projectedBalance >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 6,
      pointHoverRadius: 8
    }]
  };

  // Generate insights
  let insights = [];

  if (projection.projectedBalance < 0) {
    insights.push('🚨 Projeção negativa - revise receitas ou corte despesas');
  } else if (projection.projectedBalance > projection.balance * 2) {
    insights.push('📈 Crescimento saudável do saldo');
  }

  if (savingsRate > 20) {
    insights.push('💪 Taxa de poupança excelente (>20%)');
  } else if (savingsRate < 10 && savingsRate > 0) {
    insights.push('⚖️ Taxa de poupança moderada - considere otimizar');
  } else if (projection.monthlyNet < 0) {
    insights.push('⚠️ Gastos superiores às receitas - reveja orçamento');
  }

  const monthsToDouble = projection.monthlyNet > 0 ? Math.ceil((projection.balance * 2) / projection.monthlyNet) : 0;
  if (monthsToDouble > 0 && monthsToDouble <= 12) {
    insights.push(`⏱️ Saldo dobrará em ${monthsToDouble} ${monthsToDouble === 1 ? 'mês' : 'meses'}`);
  }

  if (insights.length === 0) {
    insights.push('📊 Situação financeira estável');
  }

  dom.balanceInsightsContent.innerHTML = insights.map(insight => `<div>${insight}</div>`).join('');

  charts.balanceProjection = renderChart(charts.balanceProjection, dom.chartBalanceProjection, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
            }
          }
        }
      },
      scales: chartScaleOptions()
    }
  });
}

// ==================== FIM RELATÓRIOS AVANÇADOS - PHASE 5 ====================

// ==================== PHASE 6: NOVAS FUNCIONALIDADES - TAGS, ORÇAMENTO, RECORRÊNCIA ====================

/**
 * Gerencia orçamentos mensais por categoria
 * PHASE 6: Limites de gasto com alertas visuais
 */
const budgetManager = {
  setBudget: (categoryId, amount) => {
    // Salvar orçamento em localStorage com formato de categoria
    const budget = state.categories.find(c => c.id === categoryId);
    if (budget) {
      budget.limitCents = Number.isSafeInteger(amount) ? amount : toCents(amount);
      budget.limit = fromCents(budget.limitCents);
      saveState();
    }
  },
  
  getBudgetStatus: (categoryId, year, month) => {
    const category = state.categories.find(c => c.id === categoryId);
    const budgetCents = Number.isSafeInteger(category?.limitCents)
      ? category.limitCents
      : toCents(category?.limit || 0);
    const spentCents = state.transactions
      .filter(t => periodMatches(t.date, year, month)
        && t.status === 'paid'
        && t.category === categoryId
        && t.type === 'expense')
      .reduce((sum, t) => sum + (Number.isSafeInteger(t.valueCents) ? t.valueCents : toCents(t.value)), 0);
    const spent = fromCents(spentCents);
    const budget = fromCents(budgetCents);
    
    if (budgetCents === 0) return { status: 'no-limit', percentage: 0 };
    
    const percentage = (spentCents / budgetCents) * 100;
    const status = percentage > 100 ? 'exceeded' : percentage > 80 ? 'warning' : 'ok';
    
    return { status, percentage: Math.round(percentage), spent, budget };
  },
  
  getMonthlyBudgetOverview: (year, month) => {
    return state.categories
      .filter(c => c.type === 'expense' && (c.limitCents || toCents(c.limit || 0)) > 0)
      .map(c => ({
        category: c.name,
        ...budgetManager.getBudgetStatus(c.id, year, month)
      }));
  }
};

// ==================== PHASE 7: ACESSIBILIDADE & ATALHOS DE TECLADO ====================

/**
 * Atalhos de teclado para navegação rápida
 * PHASE 7: Produtividade com teclado
 */
const keyboardShortcuts = {
  shortcuts: {
    'Shift+N': 'Nova transação',
    'Shift+C': 'Nova categoria',
    'Shift+F': 'Novo gasto fixo',
    'Shift+G': 'Novo saldo inicial',
    'Escape': 'Fechar modais',
    'Ctrl+K': 'Busca global',
    'Ctrl+S': 'Salvar dados (backup)',
    'Tab': 'Navegar entre campos',
    'Enter': 'Submeter formulário / Confirmar'
  },
  
  register: () => {
    document.addEventListener('keydown', keyboardShortcuts.handler);
  },
  
  handler: (e) => {
    // Não ativar atalhos quando o foco estiver em campos de input, textarea ou select
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      return; // Permitir digitação normal nos campos
    }
    
    const key = `${e.shiftKey ? 'Shift+' : ''}${e.ctrlKey ? 'Ctrl+' : ''}${e.metaKey ? 'Cmd+' : ''}${e.key.toUpperCase()}`;
    
    switch(key) {
      case 'Shift+N':
        e.preventDefault();
        openTransactionModal();
        break;
      case 'Shift+C':
        e.preventDefault();
        openCategoryModal();
        break;
      case 'Shift+F':
        e.preventDefault();
        openFixedModal();
        break;
      case 'Shift+G':
        e.preventDefault();
        openInitialBalanceModal();
        break;
      case 'ESCAPE':
        e.preventDefault();
        closeModals();
        break;
      case 'Ctrl+S':
      case 'Cmd+S':
        e.preventDefault();
        backupData();
        break;
    }
  }
};

/**
 * Melhora acessibilidade com ARIA labels
 * PHASE 7: Melhor suporte a leitores de tela
 */
function enhanceAccessibility() {
  // Cards do dashboard
  if (dom.cardBalance) dom.cardBalance.setAttribute('role', 'status');
  if (dom.cardIncome) dom.cardIncome.setAttribute('role', 'status');
  if (dom.cardExpense) dom.cardExpense.setAttribute('role', 'status');
  
  // Tabelas
  document.querySelectorAll('table').forEach(table => {
    table.setAttribute('role', 'table');
    table.querySelectorAll('thead').forEach(thead => thead.setAttribute('role', 'rowgroup'));
    table.querySelectorAll('tbody').forEach(tbody => tbody.setAttribute('role', 'rowgroup'));
  });
  
  // Botões de ação
  document.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    if (action === 'edit') {
      btn.setAttribute('aria-label', 'Editar');
    } else if (action === 'delete') {
      btn.setAttribute('aria-label', 'Deletar');
    }
  });
  
  // Modais
  document.querySelectorAll('.modal').forEach(modal => {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
  });
  
  // Inputs
  document.querySelectorAll('input, select, textarea').forEach(input => {
    const id = input.id;
    if (id && !input.getAttribute('aria-label')) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (!label) {
        input.setAttribute('aria-label', id.replace(/([A-Z])/g, ' $1').trim());
      }
    }
  });
}

/**
 * Adicionação de focus visível para melhor navegação com teclado
 * PHASE 7: Indicador visual de foco
 */
function addFocusIndicators() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-nav');
    }
    const openModal = document.querySelector('.modal.active');
    if (!openModal) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModals();
    }
    if (e.key === 'Tab') {
      const focusable = Array.from(openModal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  
  document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
  });
}

// ==================== FIM ACESSIBILIDADE - PHASE 7 ====================

/**
 * Salva estado atual no localStorage
 * @function saveState
 * @description Serializa state para JSON e salva em localStorage
 * @returns {void}
 */
function saveState() {
  try {
    calcCache.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Erro ao salvar no localStorage:', error);
    showToast('Erro ao salvar dados localmente.', 'error');
  }
}

/**
 * Carrega estado do localStorage
 * @function loadState
 * @description Recupera JSON do localStorage e hidrata state
 * @returns {void}
 */
function loadState() {
  let legacyScenarios = [];
  let legacySavingsGoals = [];
  try {
    legacyScenarios = JSON.parse(window.localStorage.getItem('luminafin_scenarios') || '[]');
  } catch {
    legacyScenarios = [];
  }
  try {
    legacySavingsGoals = JSON.parse(window.localStorage.getItem('luminafin_goals') || '[]');
  } catch {
    legacySavingsGoals = [];
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    state = migrateState(createEmptyState(), {
      scenarios: legacyScenarios,
      savingsGoals: legacySavingsGoals
    });
    state.categories = [...defaultCategories].map((item) => ({
      ...item,
      limitCents: toCents(item.limit),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      version: 1
    }));
    state.settings = { ...defaultSettings };
    saveState();
    return;
  }
  const parsed = safeParse(saved, null);
  if (parsed && typeof parsed === 'object') {
    state = migrateState(parsed, {
      scenarios: legacyScenarios,
      savingsGoals: legacySavingsGoals
    });
    if (state.categories.length === 0) {
      state.categories = defaultCategories.map((item) => ({
        ...item,
        limitCents: toCents(item.limit),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        version: 1
      }));
    }
    window.localStorage.removeItem('luminafin_scenarios');
    window.localStorage.removeItem('luminafin_goals');
    saveState();
  } else {
    showToast('Dados corrompidos no localStorage, carregando padrão.', 'warning');
    localStorage.removeItem(STORAGE_KEY);
    loadState();
  }
}

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--bg', state.settings.colors.background);
  root.style.setProperty('--surface', state.settings.colors.header);
  root.style.setProperty('--surface-strong', state.settings.colors.card);
  root.style.setProperty('--accent', state.settings.colors.accent);
  root.style.setProperty('--accent-strong', shadeColor(state.settings.colors.accent, -12));
  document.body.classList.toggle('theme-light', state.settings.themeMode === 'light');
  document.body.classList.toggle('theme-dark', state.settings.themeMode === 'dark');
  dom.themeBg.value = state.settings.colors.background;
  dom.themeHeader.value = state.settings.colors.header;
  dom.themeCard.value = state.settings.colors.card;
  dom.themeAccent.value = state.settings.colors.accent;
  dom.themeToggle.checked = state.settings.themeMode === 'dark';
}

function shadeColor(color, percent) {
  const f = parseInt(color.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16;
  const G = (f >> 8) & 0x00ff;
  const B = f & 0x0000ff;
  const newColor = '#' + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
  return newColor;
}

function showToast(message, type = 'success') {
  const container = dom.toastContainer || document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

// ==================== FUNÇÕES DE SEGURANÇA ====================

function showAdminWarning() {
  const modal = document.getElementById('adminWarningModal');
  if (modal) {
    activateModal(modal);
  }
}

function performAutomaticBackup() {
  try {
    const snapshot = JSON.parse(JSON.stringify(state));
    downloadBackupSnapshot(snapshot, `LuminaFin-auto-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
    showToast('Backup automático do estado anterior realizado.', 'success');
  } catch (error) {
    console.error('Falha ao criar backup automático:', error);
    showToast('Não foi possível criar o backup automático. A ação foi cancelada.', 'error');
    throw error;
  }
}

function downloadBackupSnapshot(snapshot, filename) {
  const dataStr = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    backupVersion: 3,
    exportedAt: new Date().toISOString(),
    state: snapshot
  }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  try {
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function showDangerConfirmModal(title, warningText, confirmWord, callback) {
  const modal = document.getElementById('dangerConfirmModal');
  const titleElement = document.getElementById('dangerModalTitle');
  const warningElement = document.getElementById('dangerWarningText');
  const wordElement = document.getElementById('confirmWord');
  const input = document.getElementById('dangerConfirmInput');
  const form = document.getElementById('dangerConfirmForm');
  const submitBtn = document.getElementById('dangerSubmitBtn');
  
  if (!modal) return;
  
  titleElement.textContent = title;
  warningElement.textContent = warningText;
  wordElement.textContent = confirmWord;
  input.value = '';
  input.placeholder = `Digite: ${confirmWord}`;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Confirmar Ação';
  
  // Remove previous listeners by cloning
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  const newInput = newForm.querySelector('#dangerConfirmInput');
  const newSubmitBtn = newForm.querySelector('#dangerSubmitBtn');
  
  // Validar input em tempo real
  newInput.addEventListener('input', () => {
    const isValid = newInput.value === confirmWord;
    newSubmitBtn.disabled = !isValid;
  });
  
  // Submit handler
  newForm.addEventListener('submit', (e) => {
    e.preventDefault();
    closeModals();
    if (callback && typeof callback === 'function') {
      callback();
    }
  });
  
  activateModal(modal);
}

// ==================== FUNÇÕES DE TUTORIAL/ONBOARDING ====================

/**
 * Mostra o modal de tutorial na primeira vez (se não houver transações)
 */
function showTutorialIfFirstTime() {
  const tutorialShown = localStorage.getItem('LuminaFin-tutorialShown');
  const hasTransactions = state.transactions.length > 0;
  
  if (!tutorialShown && !hasTransactions) {
    const tutorialModal = document.getElementById('tutorialModal');
    if (tutorialModal) {
      localStorage.setItem('LuminaFin-tutorialShown', 'true');
      activateModal(tutorialModal);
      
      // Conectar botão "Ir para Tenho Dúvida"
      const goToHelpBtn = document.getElementById('goToHelpBtn');
      if (goToHelpBtn) {
        goToHelpBtn.addEventListener('click', () => {
          closeTutorialModal();
          navigateToHelp();
        });
      }
    }
  }
}

/**
 * Fecha o modal de tutorial
 */
function closeTutorialModal() {
  const tutorialModal = document.getElementById('tutorialModal');
  if (tutorialModal) {
    tutorialModal.classList.remove('active');
  }
}

/**
 * Navega para a seção de ajuda/Tenho Dúvida
 */
function navigateToHelp() {
  const helpLink = document.querySelector('[data-target="help"]');
  if (helpLink) {
    helpLink.click();
  }
}

// ==================== FIM FUNÇÕES DE TUTORIAL/ONBOARDING ====================

// ==================== FIM FUNÇÕES DE SEGURANÇA ====================


function init() {
  /**
   * Inicializa a aplicação
   * @description Carrega dados, configura DOM, renderiza páginas, registra listeners
   * @function init
   * @returns {void}
   */
  // Initialize DOM references after DOM is loaded
  dom = {
    navLinks: document.querySelectorAll('.nav-link'),
    pageTitle: document.getElementById('pageTitle'),
    dashboardYear: document.getElementById('dashboardYear'),
    dashboardMonth: document.getElementById('dashboardMonth'),
    cardBalance: document.getElementById('cardBalance'),
    cardProjectedBalance: document.getElementById('cardProjectedBalance'),
    cardInitialBalance: document.getElementById('cardInitialBalance'),
    cardIncome: document.getElementById('cardIncome'),
    cardExpense: document.getElementById('cardExpense'),
    cardTopExpense: document.getElementById('cardTopExpense'),
    cardDailyAverage: document.getElementById('cardDailyAverage'),
    cardSavedRate: document.getElementById('cardSavedRate'),
    dashboardFilterSummary: document.getElementById('dashboardFilterSummary'),
    dashboardPage: document.getElementById('dashboard'),
    dashboardEmptyState: document.getElementById('dashboardEmptyState'),
    dashboardChapterTabs: document.querySelector('.chapter-tabs[data-chapter-group="dashboard"]'),
    dashboardGoalsSection: document.querySelector('.goals-section'),
    emptyAddTransaction: document.getElementById('emptyAddTransaction'),
    emptyAddInitialBalance: document.getElementById('emptyAddInitialBalance'),
    emptyOpenCoffers: document.getElementById('emptyOpenCoffers'),
    chartIncomeExpense: document.getElementById('chartIncomeExpense'),
    chartCategorySpending: document.getElementById('chartCategorySpending'),
    chartBalanceTrend: document.getElementById('chartBalanceTrend'),
    chartTopExpenses: document.getElementById('chartTopExpenses'),
    transactionSearch: document.getElementById('transactionSearch'),
    transactionYear: document.getElementById('transactionYear'),
    transactionMonth: document.getElementById('transactionMonth'),
    transactionTypeFilter: document.getElementById('transactionTypeFilter'),
    transactionCategory: document.getElementById('transactionCategory'),
    transactionCofferOperation: document.getElementById('transactionCofferOperation'),
    transactionCoffer: document.getElementById('transactionCoffer'),
    transactionPayment: document.getElementById('transactionPayment'),
    transactionPaymentMethod: document.getElementById('transactionPaymentMethod'),
    transactionCreditCard: document.getElementById('transactionCreditCard'),
    transactionInstallments: document.getElementById('transactionInstallments'),
    creditPurchaseFields: document.getElementById('creditPurchaseFields'),
    transactionCategoryFilter: document.getElementById('transactionCategoryFilter'),
    transactionPageSize: document.getElementById('transactionPageSize'),
    transactionTableBody: document.querySelector('#transactionTable tbody'),
    transactionPagination: document.getElementById('transactionPagination'),
    upcomingTransactionsList: document.getElementById('upcomingTransactionsList'),
    categorySearch: document.getElementById('categorySearch'),
    categoryTableBody: document.querySelector('#categoryTable tbody'),
    fixedTableBody: document.querySelector('#fixedTable tbody'),
    reportYear: document.getElementById('reportYear'),
    reportTopExpenses: document.getElementById('reportTopExpenses'),
    spendingHeatmap: document.getElementById('spendingHeatmap'),
    chartReportCategory: document.getElementById('chartReportCategory'),
    chartReportMonthly: document.getElementById('chartReportMonthly'),
    chartReportTopIncome: document.getElementById('chartReportTopIncome'),
    chartReportPayment: document.getElementById('chartReportPayment'),
    reportSummary: document.getElementById('reportSummary'),
    reportsEmptyState: document.getElementById('reportsEmptyState'),
    analysisChapterTabs: document.getElementById('analysisChapterTabs'),
    reportsEmptyAddTransaction: document.getElementById('reportsEmptyAddTransaction'),
    reportTopIncomeMonth: document.getElementById('reportTopIncomeMonth'),
    positionAccountBalance: document.getElementById('positionAccountBalance'),
    positionProjectedBalance: document.getElementById('positionProjectedBalance'),
    positionCofferBalance: document.getElementById('positionCofferBalance'),
    positionCofferComposition: document.getElementById('positionCofferComposition'),
    positionNetWorth: document.getElementById('positionNetWorth'),
    positionPendingIncome: document.getElementById('positionPendingIncome'),
    positionPendingExpense: document.getElementById('positionPendingExpense'),
    positionScheduledIncome: document.getElementById('positionScheduledIncome'),
    positionScheduledExpense: document.getElementById('positionScheduledExpense'),
    projectionSummary: document.getElementById('projectionSummary'),
    projectionList: document.getElementById('projectionList'),
    purchaseValue: document.getElementById('purchaseValue'),
    purchaseInstallments: document.getElementById('purchaseInstallments'),
    purchaseMonthlyIncome: document.getElementById('purchaseMonthlyIncome'),
    purchaseMonthlyExpense: document.getElementById('purchaseMonthlyExpense'),
    calculatePurchaseProjectionButton: document.getElementById('calculatePurchaseProjection'),
    purchaseProjectionResult: document.getElementById('purchaseProjectionResult'),
    balanceStartValue: document.getElementById('balanceStartValue'),
    balanceMonthlyIncome: document.getElementById('balanceMonthlyIncome'),
    balanceMonthlyExpense: document.getElementById('balanceMonthlyExpense'),
    balanceProjectionMonths: document.getElementById('balanceProjectionMonths'),
    calculateBalanceProjectionButton: document.getElementById('calculateBalanceProjection'),
    balanceProjectionResult: document.getElementById('balanceProjectionResult'),
    chartPurchaseProjection: document.getElementById('chartPurchaseProjection'),
    chartBalanceProjection: document.getElementById('chartBalanceProjection'),
    purchaseInsights: document.getElementById('purchaseInsights'),
    purchaseInsightsContent: document.getElementById('purchaseInsightsContent'),
    balanceInsights: document.getElementById('balanceInsights'),
    balanceInsightsContent: document.getElementById('balanceInsightsContent'),
    projectionDashboard: document.getElementById('projectionDashboard'),
    savingsCapacity: document.getElementById('savingsCapacity'),
    sixMonthProjection: document.getElementById('sixMonthProjection'),
    safeInstallmentLimit: document.getElementById('safeInstallmentLimit'),
    futureStartingBalance: document.getElementById('futureStartingBalance'),
    futureMonthlyContribution: document.getElementById('futureMonthlyContribution'),
    futureCdiAnnual: document.getElementById('futureCdiAnnual'),
    futureScenario: document.getElementById('futureScenario'),
    futureInflation: document.getElementById('futureInflation'),
    futureYears: document.getElementById('futureYears'),
    calculateLongTermProjectionButton: document.getElementById('calculateLongTermProjection'),
    longTermProjectionResult: document.getElementById('longTermProjectionResult'),
    chartLongTermProjection: document.getElementById('chartLongTermProjection'),
    limitTableBody: document.querySelector('#limitTable tbody'),
    rawDataEditor: document.getElementById('rawDataEditor'),
    themeBg: document.getElementById('themeBg'),
    themeHeader: document.getElementById('themeHeader'),
    themeCard: document.getElementById('themeCard'),
    themeAccent: document.getElementById('themeAccent'),
    themeToggle: document.getElementById('themeToggle'),
    toastContainer: document.getElementById('toastContainer'),
    fixedCategory: document.getElementById('fixedCategory'),
    fixedTotalSummary: document.getElementById('fixedTotalSummary'),
    // Novos elementos para funcionalidades avançadas
    monthlySavingsGoal: document.getElementById('monthlySavingsGoal'),
    goalDeadline: document.getElementById('goalDeadline'),
    setSavingsGoal: document.getElementById('setSavingsGoal'),
    savingsGoalProgress: document.getElementById('savingsGoalProgress'),
    chartSavingsGoal: document.getElementById('chartSavingsGoal'),
    emergencyFund3Months: document.getElementById('emergencyFund3Months'),
    expenseIncrease20Percent: document.getElementById('expenseIncrease20Percent'),
    incomeReduction15Percent: document.getElementById('incomeReduction15Percent'),
    scenarioName: document.getElementById('scenarioName'),
    scenarioDescription: document.getElementById('scenarioDescription'),
    saveCurrentScenario: document.getElementById('saveCurrentScenario'),
    savedScenarios: document.getElementById('savedScenarios'),
    // Goals elements
    addGoalButton: document.getElementById('addGoalButton'),
    goalsContainer: document.getElementById('goalsContainer'),
    goalModal: document.getElementById('goalModal'),
    goalModalTitle: document.getElementById('goalModalTitle'),
    goalForm: document.getElementById('goalForm'),
    goalName: document.getElementById('goalName'),
    goalTarget: document.getElementById('goalTarget'),
    goalColor: document.getElementById('goalColor'),
    cofferList: document.getElementById('cofferList'),
    cofferTotalBalance: document.getElementById('cofferTotalBalance'),
    cofferPrincipalTotal: document.getElementById('cofferPrincipalTotal'),
    cofferYieldTotal: document.getElementById('cofferYieldTotal'),
    creditCardList: document.getElementById('creditCardList'),
    creditInvoiceList: document.getElementById('creditInvoiceList'),
    creditTotalLimit: document.getElementById('creditTotalLimit'),
    creditUsedLimit: document.getElementById('creditUsedLimit'),
    creditAvailableLimit: document.getElementById('creditAvailableLimit'),
    creditOpenInvoices: document.getElementById('creditOpenInvoices'),
    creditCardForm: document.getElementById('creditCardForm'),
    creditInvoicePaymentForm: document.getElementById('creditInvoicePaymentForm'),
    creditInvoicePaymentSource: document.getElementById('creditInvoicePaymentSource'),
    creditInvoicePaymentCoffer: document.getElementById('creditInvoicePaymentCoffer')
  };

  loadState();
  applyTheme();
  buildNavigation();
  initializeChapterTabs();
  populateSelects();
  renderDashboard();
  renderTransactionTable();
  renderCategoryTable();
  renderFixedTable();
  renderCoffers();
  renderCreditCards();
  renderReportPage();
  renderLimitsTable();
  renderTrashStatus();
  updateRawEditor();
  attachEventListeners();
  
  // PHASE 7: Inicializar atalhos de teclado e acessibilidade
  keyboardShortcuts.register();
  enhanceAccessibility();
  addFocusIndicators();
  
  // PHASE 10: Registrar Service Worker e PWA
  showTutorialIfFirstTime();
  registerServiceWorker();
  setupPWAInstallPrompt();
}

function buildNavigation() {
  document.querySelectorAll('.page-panel').forEach((panel) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-hidden', String(!panel.classList.contains('active')));
  });
  const selectPage = (button) => {
    dom.navLinks.forEach((nav) => {
      const selected = nav === button;
      nav.classList.toggle('active', selected);
      nav.setAttribute('aria-selected', String(selected));
      nav.tabIndex = selected ? 0 : -1;
    });
    const target = button.dataset.target;

    if (target === 'admin') showAdminWarning();
    document.querySelectorAll('.page-panel').forEach((panel) => {
      const selected = panel.id === target;
      panel.classList.toggle('active', selected);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-hidden', String(!selected));
    });
    dom.pageTitle.textContent = button.textContent.trim();

    if (target === 'dashboard') renderDashboard();
    else if (target === 'transactions') renderTransactionTable();
    else if (target === 'categories') renderCategoryTable();
    else if (target === 'fixed') renderFixedTable();
    else if (target === 'reports') renderReportPage();
    else if (target === 'help') renderHelpPage();
    else if (target === 'coffers') renderCoffers();
    else if (target === 'creditCards') renderCreditCards();
    else if (target === 'admin') renderLimitsTable();
    closeMobileMenu();
  };
  dom.navLinks.forEach((button) => {
    button.tabIndex = button.classList.contains('active') ? 0 : -1;
    button.addEventListener('click', () => selectPage(button));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Array.from(dom.navLinks).indexOf(button);
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? dom.navLinks.length - 1
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + dom.navLinks.length) % dom.navLinks.length;
      const next = dom.navLinks[nextIndex];
      selectPage(next);
      next.focus();
    });
  });
}

function selectChapterTab(groupName, chapterName, moveFocus = false) {
  const tabList = document.querySelector(`.chapter-tabs[data-chapter-group="${groupName}"]`);
  if (!tabList) return;
  const tabs = Array.from(tabList.querySelectorAll('[data-chapter-tab]'));
  const panels = Array.from(document.querySelectorAll(`[data-chapter-scope="${groupName}"]`));
  tabs.forEach((tab) => {
    const selected = tab.dataset.chapterTab === chapterName;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) tab.focus();
  });
  panels.forEach((panel) => {
    const selected = panel.dataset.chapter === chapterName;
    panel.hidden = !selected;
    panel.setAttribute('aria-hidden', String(!selected));
  });
}

function initializeChapterTabs() {
  document.querySelectorAll('.chapter-tabs[data-chapter-group]').forEach((tabList) => {
    const groupName = tabList.dataset.chapterGroup;
    const tabs = Array.from(tabList.querySelectorAll('[data-chapter-tab]'));
    const panels = Array.from(document.querySelectorAll(`[data-chapter-scope="${groupName}"]`));
    tabs.forEach((tab, index) => {
      const tabId = `${groupName}-${tab.dataset.chapterTab}-tab`;
      tab.id = tabId;
      tab.setAttribute('role', 'tab');
      if (!tab.hasAttribute('aria-selected')) tab.setAttribute('aria-selected', String(index === 0));
      tab.addEventListener('click', () => selectChapterTab(groupName, tab.dataset.chapterTab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = tabs.indexOf(tab);
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectChapterTab(groupName, tabs[nextIndex].dataset.chapterTab, true);
      });
      const associatedPanels = panels.filter((panel) => panel.dataset.chapter === tab.dataset.chapterTab);
      associatedPanels.forEach((panel, panelIndex) => {
        if (!panel.id) panel.id = `${tabId}-panel-${panelIndex + 1}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabId);
        panel.tabIndex = 0;
      });
      tab.setAttribute('aria-controls', associatedPanels.map((panel) => panel.id).join(' '));
    });
    const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    if (!selected) return;
    selectChapterTab(groupName, selected.dataset.chapterTab);
  });
}

function populateSelects() {
  // Get unique years that have transactions
  const yearsWithData = Array.from(new Set(
    state.transactions.map((item) => normalizeDate(item.date)?.getFullYear()).filter(Number.isInteger)
  )).sort((a, b) => a - b);

  // Clear existing options
  dom.dashboardYear.innerHTML = '';
  dom.transactionYear.innerHTML = '';
  dom.reportYear.innerHTML = '';

  // Add "All years" option
  const allYearsOption = document.createElement('option');
  allYearsOption.value = 'all';
  allYearsOption.textContent = 'Todos os anos';
  dom.dashboardYear.append(allYearsOption.cloneNode(true));
  dom.transactionYear.append(allYearsOption.cloneNode(true));
  dom.reportYear.append(allYearsOption.cloneNode(true));

  // Add years with data
  yearsWithData.forEach((year) => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    dom.dashboardYear.append(option.cloneNode(true));
    dom.transactionYear.append(option.cloneNode(true));
    dom.reportYear.append(option.cloneNode(true));
  });

  // Populate months - will be updated when year changes
  updateMonthSelectsForYear(dom.dashboardYear, dom.dashboardMonth);
  updateMonthSelectsForYear(dom.transactionYear, dom.transactionMonth);

  // Set current values
  dom.dashboardYear.value = state.filters.year;
  dom.dashboardMonth.value = state.filters.month;
  dom.transactionYear.value = state.filters.year;
  dom.transactionMonth.value = state.filters.month;
  dom.reportYear.value = state.reportYear;

  rebuildCategoryDropdowns();
  rebuildCofferSelect();
  populateCofferSettingsForm();
  renderFxRates();
  updateCurrencyValueLabel();
  const inflationInput = document.getElementById('annualInflationRate');
  if (inflationInput) inflationInput.value = ((state.settings.annualInflationBps || 0) / 100).toFixed(2);
}

function updateMonthSelectsForYear(yearSelector, monthSelector) {
  // Get months that have data for the selected year (or all years if "all" is selected)
  const selectedYear = yearSelector.value;
  let monthsWithData;

  if (selectedYear === 'all') {
    // Get all unique month-year combinations
    const monthYearPairs = state.transactions
      .filter((item) => normalizeDate(item.date))
      .map((item) => `${item.date.slice(0, 4)}-${Number(item.date.slice(5, 7))}`);
    monthsWithData = Array.from(new Set(monthYearPairs)).map(pair => {
      const [year, month] = pair.split('-').map(Number);
      return { year, month };
    });
  } else {
    // Get months for specific year
    const year = Number(selectedYear);
    monthsWithData = Array.from(new Set(
      state.transactions
        .filter(item => normalizeDate(item.date)?.getFullYear() === year)
        .map(item => Number(item.date.slice(5, 7)))
    )).sort((a,b)=>a-b).map(month => ({ year, month }));
  }

  // Clear existing options
  monthSelector.innerHTML = '';

  // Add "All months" option
  const allMonthsOption = document.createElement('option');
  allMonthsOption.value = 'all';
  allMonthsOption.textContent = 'Todos os meses';
  monthSelector.append(allMonthsOption);

  // Add months with data
  if (selectedYear === 'all') {
    // Group by month across all years
    const monthsGrouped = {};
    monthsWithData.forEach(({ month }) => {
      if (!monthsGrouped[month]) {
        monthsGrouped[month] = [];
      }
      monthsGrouped[month].push(month);
    });

    Object.keys(monthsGrouped).sort((a,b)=>Number(a)-Number(b)).forEach(monthNum => {
      const option = document.createElement('option');
      option.value = monthNum;
      option.textContent = labelsMonths[Number(monthNum) - 1];
      monthSelector.append(option);
    });
  } else {
    // Show months for specific year
    monthsWithData.forEach(({ month }) => {
      const option = document.createElement('option');
      option.value = month;
      option.textContent = labelsMonths[month - 1];
      monthSelector.append(option);
    });
  }
}

function rebuildCategoryDropdowns() {
  const categories = state.categories.filter((cat) => cat.type !== 'both' ? cat.type === 'expense' || cat.type === 'income' : true);
  const fill = (select, items, includeAll = false) => {
    if (!select) return;
    const options = [];
    if (includeAll) {
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = 'Todas';
      options.push(all);
    }
    for (const category of items) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.icon} ${category.name}`;
      options.push(option);
    }
    select.replaceChildren(...options);
  };
  fill(dom.transactionCategory, categories);
  fill(dom.fixedCategory, categories.filter((cat) => cat.type !== 'income'));
  fill(dom.transactionCategoryFilter, categories, true);
}

function rebuildTransactionCategoryOptions(type = 'expense') {
  const select = document.getElementById('transactionCategory');
  if (!select) return;
  const categories = state.categories.filter((category) =>
    category.type === type || category.type === 'both'
  );
  const options = categories.map((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${category.icon} ${category.name}`;
    return option;
  });
  select.replaceChildren(...options);
}

function getCurrentFilters() {
  const yearValue = dom.dashboardYear.value;
  const monthValue = dom.dashboardMonth.value;
  return {
    yearValue,
    monthValue,
    year: yearValue === 'all' ? null : Number(yearValue),
    month: monthValue === 'all' ? null : Number(monthValue)
  };
}

/**
 * Renderiza dashboard com cards e gráficos
 * @function renderDashboard
 * @description Atualiza cards de saldo/renda/gasto e contrói gráficos
 * @returns {void}
 */
function renderDashboard() {
  const { year, month, yearValue, monthValue } = getCurrentFilters();
  // Save the actual selected values (including 'all')
  state.filters.year = yearValue;
  state.filters.month = monthValue;
  saveState();
  
  // Usar cache para cálculos do dashboard
  const cacheKey = calcCache.key('dashboardData', yearValue, monthValue);
  let dashboardData = calcCache.get(cacheKey);
  
  if (!dashboardData) {
    const monthlyTransactions = state.transactions.filter((item) => periodMatches(item.date, year, month));
    const realizedTransactions = monthlyTransactions.filter((item) => item.status === 'paid');
    const incomeTotal = calculatePeriodTotals(state.transactions, year, month).incomeCents;
    const expenseTotal = calculatePeriodTotals(state.transactions, year, month).expenseCents;
    const previousMonthBalance = calculateBalanceUpToPreviousMonth(year, month);
    let balance;
    if (year !== null && month !== null) {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const periodEnd = dateKey(new Date(year, month, 0));
      const initialBalanceInPeriod = (state.initialBalances || []).reduce((sum, item) => (
        item.date >= periodStart && item.date <= periodEnd
          ? sum + (Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value))
          : sum
      ), 0);
      balance = (previousMonthBalance || 0) + initialBalanceInPeriod + incomeTotal - expenseTotal;
    } else if (year !== null) {
      balance = calculateAccountBalanceAt(
        state.transactions,
        state.initialBalances || [],
        `${year}-12-31`
      );
    } else {
      balance = calculateCurrentBalance();
    }

    const unsettledTotals = calculateUnsettledPeriodTotals(state.transactions, year, month);
    const unsettledNet = unsettledTotals.pendingIncomeCents - unsettledTotals.pendingExpenseCents
      + unsettledTotals.scheduledIncomeCents - unsettledTotals.scheduledExpenseCents;
    const topExpense = realizedTransactions
      .filter((item) => item.type === 'expense')
      .reduce((max, item) => Math.max(max, Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value)), 0);
    const average = calculateDailyExpenseAverage(state.transactions, year, month);
    const savedRate = calculateSavingsRate(incomeTotal, expenseTotal);
    
    dashboardData = {
      initialBalance: previousMonthBalance,
      incomeTotal,
      expenseTotal,
      balance,
      projectedBalance: balance + unsettledNet,
      topExpense,
      average,
      savedRate,
      previousMonthBalance
    };
    
    calcCache.set(cacheKey, dashboardData);
  }

  // Aplicar dados cacheados
  dom.cardBalance.textContent = formatCurrencyFromCents(dashboardData.balance);
  dom.cardProjectedBalance?.replaceChildren(
    document.createTextNode(formatCurrencyFromCents(dashboardData.projectedBalance))
  );
  dom.cardInitialBalance.textContent = dashboardData.previousMonthBalance === null
    ? '—'
    : formatCurrencyFromCents(dashboardData.previousMonthBalance);
  dom.cardIncome.textContent = formatCurrencyFromCents(dashboardData.incomeTotal);
  dom.cardExpense.textContent = formatCurrencyFromCents(dashboardData.expenseTotal);
  dom.cardTopExpense.textContent = formatCurrencyFromCents(dashboardData.topExpense);
  dom.cardDailyAverage.textContent = formatCurrencyFromCents(dashboardData.average);
  dom.cardSavedRate.textContent = dashboardData.savedRate === null
    ? '—'
    : `${dashboardData.savedRate.toFixed(1).replace('.', ',')}%`;
  renderFinancialPosition();
  const hasCofferBalance = state.coffers.some((coffer) => (
    calculateCofferBalance(coffer, state.transactions).totalCents > 0
  ));
  const hasAnyFinancialData = state.transactions.length > 0
    || state.initialBalances.length > 0
    || hasCofferBalance;
  const hasRealizedActivity = state.transactions.some((item) => item.status === 'paid');
  dom.dashboardPage.classList.toggle('is-empty', !hasAnyFinancialData);
  dom.dashboardEmptyState.hidden = hasAnyFinancialData;
  dom.dashboardChapterTabs.hidden = !hasAnyFinancialData;
  dom.dashboardGoalsSection.hidden = state.goals.length === 0;
  const indicatorsTab = dom.dashboardChapterTabs.querySelector('[data-chapter-tab="indicators"]');
  const trendsTab = dom.dashboardChapterTabs.querySelector('[data-chapter-tab="trends"]');
  indicatorsTab.hidden = !hasRealizedActivity;
  trendsTab.hidden = !hasRealizedActivity;
  if (!hasRealizedActivity) selectChapterTab('dashboard', 'summary');

  const selectedPeriod = `${yearValue === 'all' ? 'Todos os anos' : yearValue} / ${monthValue === 'all' ? 'Todos os meses' : labelsMonths[Number(monthValue) - 1]}`;
  const periodInfo = year !== null
    ? `Saldo realizado no período; saldo anterior calculado antes de ${month === null ? 'janeiro' : labelsMonths[month - 1]}.`
    : dashboardData.previousMonthBalance === null
      ? 'Filtro agregado sem período com dados para calcular saldo anterior; saldo realizado e previsto mostram o valor atual.'
      : month === null
        ? 'Filtro agregado: saldo anterior considera o primeiro mês com dados; saldo realizado e previsto mostram o valor atual.'
        : `Filtro agregado: saldo anterior considera a primeira ocorrência de ${labelsMonths[month - 1]} com dados; saldo realizado e previsto mostram o valor atual.`;
  dom.dashboardFilterSummary.textContent = `Visualizando: ${selectedPeriod}. ${periodInfo}`;
  dom.dashboardFilterSummary.title = `O período filtrado determina quais transações são consideradas. ${periodInfo}`;
  
  // PHASE 11: Verificar limites de gastos
  const notifyYear = year || new Date().getFullYear();
  const notifyMonth = month || new Date().getMonth() + 1;
  notificationSystem.checkBudgetLimits(notifyYear, notifyMonth);
  
  renderGoals();
  buildCharts(notifyYear, notifyMonth);
}

function buildCharts(year, month) {
  const thisYear = year;
  const sixMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(thisYear, month - 1 - (5 - index));
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const labels = sixMonths.map((period) => `${labelsMonths[period.month - 1].slice(0,3)} ${period.year}`);
  const entryData = sixMonths.map((period) => sumByPeriod(period.year, period.month, 'income'));
  const exitData = sixMonths.map((period) => sumByPeriod(period.year, period.month, 'expense'));
  const categoryData = aggregateCategoryExpenses(year, month);
  const balanceTrend = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(year, month - 1 - (11 - offset));
    const periodYear = date.getFullYear();
    const periodMonth = date.getMonth() + 1;
    return { label: `${labelsMonths[periodMonth - 1].slice(0,3)}`, value: sumByPeriod(periodYear, periodMonth, 'income') - sumByPeriod(periodYear, periodMonth, 'expense') };
  });
  const topExpenses = getTopExpenses(year, month, 5);

  charts.incomeExpense = renderChart(charts.incomeExpense, dom.chartIncomeExpense, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Entradas', data: entryData, backgroundColor: 'rgba(34,197,94,0.75)' },
        { label: 'Saídas', data: exitData, backgroundColor: 'rgba(239,68,68,0.75)' }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: chartScaleOptions() }
  });

  charts.categorySpending = renderChart(charts.categorySpending, dom.chartCategorySpending, {
    type: 'pie',
    data: {
      labels: categoryData.map((item) => item.category),
      datasets: [{ data: categoryData.map((item) => item.total), backgroundColor: generatePalette(categoryData.length) }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } } }
  });

  charts.balanceTrend = renderChart(charts.balanceTrend, dom.chartBalanceTrend, {
    type: 'line',
    data: {
      labels: balanceTrend.map((item) => item.label),
      datasets: [{ label: 'Saldo', data: balanceTrend.map((item) => item.value), borderColor: 'rgba(56,189,248,0.9)', fill: false, tension: 0.3, pointRadius: 5 }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: chartScaleOptions() }
  });

  charts.topExpenses = renderChart(charts.topExpenses, dom.chartTopExpenses, {
    type: 'bar',
    data: {
      labels: topExpenses.map((item) => item.description),
      datasets: [{ label: 'Maior gasto', data: topExpenses.map((item) => item.value), backgroundColor: 'rgba(245,158,11,0.8)' }]
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: chartScaleOptions() }
  });
}

function sumByPeriod(year, month, type) {
  // Usar cache para evitar recálculos
  const cacheKey = calcCache.key('sumByPeriod', year, month, type);
  let cached = calcCache.get(cacheKey);
  if (cached !== null) return cached;
  
  const period = calculatePeriodTotals(state.transactions, year, month);
  const result = fromCents(type === 'income' ? period.incomeCents : period.expenseCents);
  
  calcCache.set(cacheKey, result);
  return result;
}

function aggregateCategoryExpenses(year, month) {
  // Usar cache para evitar recálculos
  const cacheKey = calcCache.key('aggregateCategoryExpenses', year, month);
  let cached = calcCache.get(cacheKey);
  if (cached !== null) return cached;
  
  const result = {};
  state.transactions.forEach((item) => {
    if (periodMatches(item.date, year, month) && isCategoryExpenseIncluded(item)) {
      const category = getCategory(item.category)?.name || item.category;
      const amount = Number.isSafeInteger(item.valueCents) ? fromCents(item.valueCents) : item.value;
      result[category] = (result[category] || 0) + amount;
    }
  });
  
  const output = Object.entries(result).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  calcCache.set(cacheKey, output);
  return output;
}

function getTopExpenses(year, month, limit) {
  // Usar cache para evitar recálculos
  const cacheKey = calcCache.key('getTopExpenses', year, month, limit);
  let cached = calcCache.get(cacheKey);
  if (cached !== null) return cached;
  
  const result = state.transactions
    .filter((item) => {
      return periodMatches(item.date, year, month) && isCategoryExpenseIncluded(item);
    })
    .sort((a, b) => (b.valueCents || toCents(b.value)) - (a.valueCents || toCents(a.value)))
    .slice(0, limit)
    .map((item) => ({ description: item.description, value: item.value }));
  
  calcCache.set(cacheKey, result);
  return result;
}

function renderChart(existingChart, canvasElement, config) {
  if (existingChart) {
    existingChart.destroy();
  }
  return new Chart(canvasElement, config);
}

function chartScaleOptions() {
  return {
    x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.12)' } },
    y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.12)' } }
  };
}

function generatePalette(count) {
  const base = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];
  return Array.from({ length: count }, (_, index) => base[index % base.length]);
}

/**
 * Renderiza tabela de transações com filtros e paginação
 * @function renderTransactionTable
 * @description Filtra, ordena e renderiza transações em tabela com HTML sanitizado
 * @returns {void}
 */
function renderTransactionTable() {
  const search = dom.transactionSearch.value.trim().toLowerCase();
  const year = dom.transactionYear.value;
  const month = dom.transactionMonth.value;
  const typeFilter = dom.transactionTypeFilter.value;
  const categoryFilter = dom.transactionCategoryFilter.value;
  const filtered = state.transactions.filter((transaction) => {
    const matchesDate = periodMatches(
      transaction.date,
      year === 'all' ? null : Number(year),
      month === 'all' ? null : Number(month)
    );
    const typeMatch = typeFilter === 'all' || transaction.type === typeFilter;
    const categoryMatch = categoryFilter === 'all' || transaction.category === categoryFilter;
    const textMatch = [transaction.description, transaction.subcategory, getCategory(transaction.category)?.name || '']
      .join(' ').toLowerCase().includes(search);
    return matchesDate && typeMatch && categoryMatch && textMatch;
  });

  const sorted = filtered.sort((a, b) => {
    const key = state.sort.key;
    const direction = state.sort.order === 'asc' ? 1 : -1;
    if (key === 'value') return (a.value - b.value) * direction;
    if (key === 'date') return a.date.localeCompare(b.date) * direction;
    if (key === 'category') return ((getCategory(a.category)?.name || a.category).localeCompare(getCategory(b.category)?.name || b.category)) * direction;
    if (key === 'status') return a.status.localeCompare(b.status) * direction;
    if (key === 'type') return a.type.localeCompare(b.type) * direction;
    return 0;
  });

  const pageSize = Number(dom.transactionPageSize.value);
  state.pagination.pageSize = pageSize;
  const page = Math.max(1, Math.min(state.pagination.page, Math.ceil(sorted.length / pageSize) || 1));
  state.pagination.page = page;
  const pageData = sorted.slice((page - 1) * pageSize, page * pageSize);

  // PHASE 2: Sanitizar dados renderizados
  dom.transactionTableBody.innerHTML = pageData.length === 0
    ? `<tr><td colspan="9" class="table-empty-state">${filtered.length ? 'Não há mais lançamentos nesta página.' : 'Nenhum lançamento corresponde a estes filtros.'}</td></tr>`
    : pageData.map((item) => {
    const category = getCategory(item.category);
    const coffer = state.coffers.find((entry) => entry.id === item.cofferId);
    const categoryLabel = category
      ? `${sanitizeHtml(category.icon)} ${sanitizeHtml(category.name)}`
      : item.cofferId
        ? `Cofrinho: ${sanitizeHtml(coffer?.name || 'removido')}`
        : sanitizeHtml(item.category || '—');
    const safeSubcategory = sanitizeHtml(item.subcategory || '-');
    const safeDescription = sanitizeHtml(item.description);
    const safePayment = sanitizeHtml(item.payment || '-');
    return `<tr>
      <td>${item.date}</td>
      <td>${categoryLabel}</td>
      <td>${safeSubcategory}</td>
      <td>${item.type === 'income' ? 'Entrada' : item.type === 'transfer' ? 'Transferência' : 'Saída'}</td>
      <td>${safeDescription}</td>
      <td>${formatCurrencyFromCents(Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value))}</td>
      <td>${safePayment}</td>
      <td>${formatStatus(item.status)}</td>
      <td>
        <button type="button" class="secondary-button" data-action="edit" data-id="${sanitizeHtml(item.id)}" aria-label="Editar lançamento"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button type="button" class="danger-button" data-action="delete" data-id="${sanitizeHtml(item.id)}" aria-label="Excluir lançamento"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </td>
    </tr>`;
    }).join('');

  buildPagination(Math.ceil(sorted.length / pageSize));
  renderUpcomingTransactions();
}

function renderUpcomingTransactions() {
  if (!dom.upcomingTransactionsList) return;
  const upcoming = state.transactions
    .filter((item) => item.status === 'pending' || item.status === 'scheduled')
    .sort((left, right) => left.date.localeCompare(right.date));
  if (upcoming.length === 0) {
    dom.upcomingTransactionsList.innerHTML = '<p class="empty-state">Nenhum boleto ou agendamento por enquanto.</p>';
    return;
  }

  dom.upcomingTransactionsList.innerHTML = upcoming.map((item) => {
    const category = getCategory(item.category);
    const coffer = state.coffers.find((entry) => entry.id === item.cofferId);
    const detail = category?.name || coffer?.name || item.category || 'Sem categoria';
    const valueCents = Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value);
    return `<article class="upcoming-row">
      <time datetime="${sanitizeHtml(item.date)}">${sanitizeHtml(item.date)}</time>
      <div class="upcoming-description"><strong>${sanitizeHtml(item.description)}</strong><span>${sanitizeHtml(detail)}</span></div>
      <span class="status-pill status-${sanitizeHtml(item.status)}">${sanitizeHtml(formatStatus(item.status))}</span>
      <strong class="upcoming-value">${item.type === 'expense' ? '−' : '+'}${formatCurrencyFromCents(valueCents)}</strong>
    </article>`;
  }).join('');
}

function buildPagination(pageCount) {
  dom.transactionPagination.innerHTML = '';
  for (let i = 1; i <= pageCount; i++) {
    const button = document.createElement('button');
    button.className = 'pagination-button';
    button.textContent = i;
    button.disabled = i === state.pagination.page;
    button.addEventListener('click', () => {
      state.pagination.page = i;
      renderTransactionTable();
    });
    dom.transactionPagination.appendChild(button);
  }
}

function formatStatus(status) {
  const labels = { paid: 'Pago', pending: 'Pendente', scheduled: 'Agendado' };
  return labels[status] || status;
}

function getCategory(id) {
  return state.categories.find((category) => category.id === id);
}

function isCategoryExpenseIncluded(transaction) {
  return transaction.type === 'expense'
    && (transaction.status === 'paid' || transaction.sourceType === 'creditPurchase');
}

function renderCategoryTable() {
  const search = dom.categorySearch.value.trim().toLowerCase();
  const categories = state.categories.filter((category) => category.name.toLowerCase().includes(search));
  dom.categoryTableBody.innerHTML = categories.map((category) => {
    const safeName = sanitizeHtml(category.name);
    const subcats = category.subcategories?.map(s => sanitizeHtml(s)).join(', ') || '-';
    const limitCents = Number.isSafeInteger(category.limitCents)
      ? category.limitCents
      : toCents(category.limit || 0);
    const limit = limitCents ? formatCurrencyFromCents(limitCents) : '-';
    const actions = category.preset
      ? '<span aria-label="Categoria padrão protegida">Padrão protegida</span>'
      : `<button type="button" class="secondary-button" data-action="edit-category" data-id="${sanitizeHtml(category.id)}" aria-label="Editar categoria ${safeName}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" class="danger-button" data-action="delete-category" data-id="${sanitizeHtml(category.id)}" aria-label="Excluir categoria ${safeName}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
    return `<tr><td>${sanitizeHtml(category.icon)} ${safeName}</td><td>${category.type === 'income' ? 'Entrada' : category.type === 'expense' ? 'Saída' : 'Ambos'}</td><td>${subcats}</td><td>${sanitizeHtml(category.icon)}</td><td>${limit}</td><td>${actions}</td></tr>`;
  }).join('');
}

function renderFixedTable() {
  const totalFixedCents = state.fixedExpenses.reduce((sum, item) => (
    sum + (Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value))
  ), 0);
  if (dom.fixedTotalSummary) dom.fixedTotalSummary.textContent = formatCurrencyFromCents(totalFixedCents);

  // PHASE 2: Sanitizar dados renderizados
  dom.fixedTableBody.innerHTML = state.fixedExpenses.map((item) => {
    const category = getCategory(item.category);
    const typeLabel = item.type === 'fixed' ? '🔄 Fixo' : '📅 Variável';
    const durationText = item.type === 'variable' && item.duration ? `${item.duration} mês${item.duration > 1 ? 'es' : ''}` : '-';
    const safeDescription = sanitizeHtml(item.description);
    const categoryName = category ? sanitizeHtml(category.name) : sanitizeHtml(item.category);
    return `<tr>
      <td>${safeDescription}</td>
      <td>${category ? `${category.icon} ${categoryName}` : categoryName}</td>
      <td>${formatCurrencyFromCents(Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value))}</td>
      <td>${typeLabel}</td>
      <td>${item.day}</td>
      <td>${durationText}</td>
      <td>${item.active ? 'Sim' : 'Não'}</td>
      <td>
        <button type="button" class="secondary-button" data-action="edit-fixed" data-id="${sanitizeHtml(item.id)}" aria-label="Editar gasto fixo"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        <button type="button" class="danger-button" data-action="delete-fixed" data-id="${sanitizeHtml(item.id)}" aria-label="Excluir gasto fixo"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function updateCurrencyValueLabel() {
  const label = document.getElementById('transactionValueLabel');
  if (!label) return;
  const displayCurrency = state.settings?.currency || BASE_CURRENCY;
  label.textContent = displayCurrency === BASE_CURRENCY
    ? 'Valor em BRL'
    : `Valor em ${displayCurrency} (convertido para BRL na data do lançamento)`;
}

function renderFxRates() {
  const list = document.getElementById('fxRatesList');
  const dateInput = document.getElementById('fxRateDate');
  if (!list) return;
  if (dateInput && !dateInput.value) dateInput.value = dateKey(new Date());
  const rates = (state.fxRates || []).slice()
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.currency.localeCompare(b.currency));
  list.innerHTML = rates.map((rate) => `
    <div class="trash-item">
      <span>1 ${sanitizeHtml(rate.currency)} = ${formatMoneyFromCents(rate.rateToBaseMicros / 10000, BASE_CURRENCY)} · desde ${sanitizeHtml(rate.effectiveDate)}</span>
      <button type="button" class="danger-button small" data-action="delete-fx-rate" data-id="${sanitizeHtml(rate.id)}" aria-label="Excluir taxa ${sanitizeHtml(rate.currency)} de ${sanitizeHtml(rate.effectiveDate)}">Excluir</button>
    </div>
  `).join('') || '<p class="field-help">Nenhuma taxa registrada. A moeda de exibição permanece BRL.</p>';
}

function addFxRate() {
  const currency = document.getElementById('fxRateCurrency').value;
  const rateValue = Number(document.getElementById('fxRateValue').value);
  const effectiveDate = document.getElementById('fxRateDate').value;
  if (currency === BASE_CURRENCY || !SUPPORTED_CURRENCIES[currency]
    || !Number.isFinite(rateValue) || rateValue <= 0
    || !normalizeDate(effectiveDate)) {
    showToast('Informe moeda, taxa positiva e data válida.', 'error');
    return;
  }
  const rateToBaseMicros = Math.round(rateValue * FX_RATE_SCALE);
  if (!Number.isSafeInteger(rateToBaseMicros) || rateToBaseMicros <= 0) {
    showToast('A taxa excede o intervalo seguro.', 'error');
    return;
  }
  const timestamp = new Date().toISOString();
  const existing = state.fxRates.find((item) => item.currency === currency && item.effectiveDate === effectiveDate);
  const rate = {
    ...(existing || {}),
    id: existing?.id || createId(),
    currency,
    effectiveDate,
    rateToBaseMicros,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  if (existing) {
    state.fxRates[state.fxRates.indexOf(existing)] = rate;
  } else {
    state.fxRates.push(rate);
  }
  saveState();
  renderFxRates();
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect?.value === currency) renderAllUI();
  updateRawEditor();
  showToast(`Taxa registrada: 1 ${currency} = ${rateValue} BRL desde ${effectiveDate}.`, 'success');
}

function rebuildCofferSelect() {
  const select = dom.transactionCoffer || document.getElementById('transactionCoffer');
  if (!select) return;
  const selected = select.value;
  const placeholder = document.createElement('option');
  placeholder.textContent = 'Selecione um cofrinho';
  placeholder.value = '';
  const options = [placeholder];
  for (const coffer of state.coffers) {
    const option = document.createElement('option');
    option.textContent = `${coffer.icon || '💰'} ${coffer.name}${coffer.active ? '' : ' (inativo)'}`;
    option.value = coffer.id;
    options.push(option);
  }
  select.replaceChildren(...options);
  if (state.coffers.some((item) => item.id === selected)) select.value = selected;
}

function populateCofferSettingsForm() {
  const rules = state.cofferSettings || createEmptyState().cofferSettings;
  const values = {
    cofferCdiAnnual: (rules.annualCdiBps / 100).toFixed(2),
    cofferCommonBase: (rules.commonBaseBps / 100).toFixed(2),
    cofferCommonBonus: (rules.commonBonusBps / 100).toFixed(2),
    cofferCommonCap: fromCents(rules.commonTierCapCents),
    cofferTurnBonus: (rules.turnBonusBps / 100).toFixed(2),
    cofferTurnCap: fromCents(rules.turnTierCapCents),
    cofferTurnStart: rules.turnStartDate,
    cofferTurnEnd: rules.turnEndDate,
    cofferMarketplaceBonus: (rules.marketplaceBonusBps / 100).toFixed(2),
    cofferMarketplacePromoEnd: rules.marketplacePromoEndDate,
    cofferMarketplaceLimit: fromCents(rules.marketplaceDepositLimitCents),
    cofferIofRate: (rules.iofBps / 100).toFixed(2),
    cofferSimulationDate: rules.simulationDate || ''
  };
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }
  const tax = document.getElementById('cofferTaxEnabled');
  const iof = document.getElementById('cofferIofEnabled');
  const monthlyGoal = document.getElementById('cofferMonthlyGoalRequired');
  if (tax) tax.checked = rules.incomeTaxEnabled;
  if (iof) iof.checked = rules.iofEnabled;
  if (monthlyGoal) monthlyGoal.checked = rules.commonRequiresMonthlyGoal;
}

function saveCofferSettings(event) {
  event.preventDefault();
  const numeric = (id) => Number(document.getElementById(id)?.value);
  const money = (id) => toCents(numeric(id));
  const percentBps = (id) => Math.round(numeric(id) * 100);
  const rules = {
    ...state.cofferSettings,
    annualCdiBps: percentBps('cofferCdiAnnual'),
    commonBaseBps: percentBps('cofferCommonBase'),
    commonBonusBps: percentBps('cofferCommonBonus'),
    commonTierCapCents: money('cofferCommonCap'),
    turnBonusBps: percentBps('cofferTurnBonus'),
    turnTierCapCents: money('cofferTurnCap'),
    turnStartDate: document.getElementById('cofferTurnStart').value,
    turnEndDate: document.getElementById('cofferTurnEnd').value,
    marketplaceBonusBps: percentBps('cofferMarketplaceBonus'),
    marketplacePromoEndDate: document.getElementById('cofferMarketplacePromoEnd').value,
    marketplaceDepositLimitCents: money('cofferMarketplaceLimit'),
    iofBps: percentBps('cofferIofRate'),
    simulationDate: document.getElementById('cofferSimulationDate').value,
    incomeTaxEnabled: document.getElementById('cofferTaxEnabled').checked,
    iofEnabled: document.getElementById('cofferIofEnabled').checked,
    commonRequiresMonthlyGoal: document.getElementById('cofferMonthlyGoalRequired').checked
  };
  if (!Object.values({
    annualCdiBps: rules.annualCdiBps,
    commonBaseBps: rules.commonBaseBps,
    commonBonusBps: rules.commonBonusBps,
    commonTierCapCents: rules.commonTierCapCents,
    turnBonusBps: rules.turnBonusBps,
    turnTierCapCents: rules.turnTierCapCents,
    marketplaceBonusBps: rules.marketplaceBonusBps,
    marketplaceDepositLimitCents: rules.marketplaceDepositLimitCents,
    iofBps: rules.iofBps
  }).every((value) => Number.isSafeInteger(value) && value >= 0)
    || !validateCofferSettings(rules)) {
    showToast('Revise os parâmetros: use valores válidos, não negativos e datas válidas.', 'error');
    return;
  }
  state.cofferSettings = rules;
  saveState();
  renderCoffers();
  updateRawEditor();
  showToast('Parâmetros de simulação atualizados.', 'success');
}

function cofferSimulationDate() {
  return state.cofferSettings?.simulationDate || dateKey(new Date());
}

function renderCoffers() {
  if (!dom.cofferList) return;
  const asOfDate = cofferSimulationDate();
  const isSimulatedDate = asOfDate !== dateKey(new Date());
  const transitioned = state.coffers.map((coffer) => (
    resolveCofferTransition(coffer, state.transactions, asOfDate)
  ));
  const hasTransition = transitioned.some((coffer, index) => coffer !== state.coffers[index]);
  const coffers = isSimulatedDate ? transitioned : transitioned;
  if (hasTransition && !isSimulatedDate) {
    state.coffers = transitioned;
    saveState();
    updateRawEditor();
  }

  const balances = calculateCofferBalances(coffers, state.transactions);
  const totalPrincipal = balances.reduce((sum, item) => sum + item.principalCents, 0);
  const totalYield = balances.reduce((sum, item) => sum + item.yieldCents, 0);
  if (dom.cofferTotalBalance) dom.cofferTotalBalance.textContent = formatCurrencyFromCents(totalPrincipal + totalYield);
  if (dom.cofferPrincipalTotal) dom.cofferPrincipalTotal.textContent = formatCurrencyFromCents(totalPrincipal);
  if (dom.cofferYieldTotal) dom.cofferYieldTotal.textContent = formatCurrencyFromCents(totalYield);

  if (coffers.length === 0) {
    dom.cofferList.innerHTML = '<div class="empty-state">Nenhum cofrinho cadastrado. Crie um cofrinho ou escolha um modelo.</div>';
    return;
  }

  dom.cofferList.innerHTML = coffers.map((coffer) => {
    const balance = calculateCofferBalance(coffer, state.transactions);
    const rate = getCofferRateDescription(
      coffer, coffers, state.cofferSettings, asOfDate, state.transactions
    );
    const rateLabel = rate.bonusBps > rate.baseBps
      ? coffer.type === 'marketplace'
        ? `${(rate.bonusBps / 100).toFixed(2)}% do CDI até ${sanitizeHtml(state.cofferSettings.marketplacePromoEndDate)}; sem teto promocional de saldo`
        : coffer.type === 'turn'
          ? `${(rate.bonusBps / 100).toFixed(2)}% do CDI até ${formatCurrencyFromCents(rate.tierCapCents)}; ${(rate.baseBps / 100).toFixed(0)}% no excedente`
          : `${(rate.bonusBps / 100).toFixed(2)}% do CDI sobre ${formatCurrencyFromCents(rate.eligibleCents)} na faixa compartilhada; ${(rate.baseBps / 100).toFixed(0)}% no excedente`
      : `${(rate.baseBps / 100).toFixed(0)}% do CDI`;
    const goalProgress = coffer.goalCents > 0
      ? Math.min(100, Math.round(balance.totalCents / coffer.goalCents * 100))
      : null;
    const campaignText = coffer.type === 'turn'
      ? `Campanha: ${sanitizeHtml(coffer.campaignStartDate || state.cofferSettings.turnStartDate)} a ${sanitizeHtml(coffer.campaignEndDate || state.cofferSettings.turnEndDate)}`
      : coffer.type === 'marketplace'
        ? `Taxa promocional até ${sanitizeHtml(state.cofferSettings.marketplacePromoEndDate)} · limite ${formatCurrencyFromCents(coffer.depositLimitCents || state.cofferSettings.marketplaceDepositLimitCents)}`
        : 'Faixa promocional compartilhada entre os cofrinhos comuns.';
    const escapedId = sanitizeHtml(coffer.id);
    return `
      <article class="coffer-card">
        <div class="coffer-card-header">
          <div class="coffer-identity">
            <span class="coffer-icon" aria-hidden="true">${sanitizeHtml(coffer.icon || '💰')}</span>
            <div><h4>${sanitizeHtml(coffer.name)}</h4><p>${coffer.type === 'common' ? 'Comum' : coffer.type === 'turn' ? 'Da Virada' : 'Mercado Livre'} · ${coffer.active ? 'Ativo' : 'Inativo'}</p></div>
          </div>
          <button type="button" class="icon-button" data-action="edit-coffer" data-id="${escapedId}" aria-label="Editar ${sanitizeHtml(coffer.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        </div>
        <div class="coffer-balances">
          <div><span>Principal</span><strong>${formatCurrencyFromCents(balance.principalCents)}</strong></div>
          <div><span>Rendimento líquido</span><strong>${formatCurrencyFromCents(balance.yieldCents)}</strong></div>
          <div class="coffer-total"><span>Saldo total</span><strong>${formatCurrencyFromCents(balance.totalCents)}</strong></div>
        </div>
        ${goalProgress === null ? '' : `<div class="coffer-goal"><div><span>Meta</span><strong>${goalProgress}%</strong></div><progress max="100" value="${goalProgress}" aria-label="Progresso da meta de ${sanitizeHtml(coffer.name)}">${goalProgress}%</progress></div>`}
        <p class="coffer-rate">${rateLabel}</p>
        <p class="coffer-campaign">${campaignText}</p>
        <p class="coffer-calculation">CDI anual: ${(state.cofferSettings.annualCdiBps / 100).toFixed(2)}% · juros em dias úteis (seg-sex), antes de IR estimado. Feriados não são descontados.</p>
        <p class="coffer-flags">${coffer.paymentEnabled ? 'Pagamentos habilitados' : 'Pagamentos desabilitados'}${coffer.type === 'marketplace' && coffer.allowWithdrawalWithoutYieldLoss !== true ? ' · resgate comum reduz rendimento proporcionalmente' : ''}</p>
        ${isSimulatedDate ? `<p class="coffer-simulation-note">Data simulada: ${sanitizeHtml(asOfDate)}. A transição exibida não altera o cadastro até voltar à data real.</p>` : ''}
        <div class="coffer-actions">
          <button type="button" class="secondary-button" data-action="coffer-deposit" data-id="${escapedId}">Aportar</button>
          <button type="button" class="secondary-button" data-action="coffer-withdrawal" data-id="${escapedId}">Resgatar</button>
          ${coffer.type === 'marketplace' ? `<button type="button" class="secondary-button" data-action="coffer-purchase" data-id="${escapedId}">Compra ML</button>` : ''}
          <button type="button" class="secondary-button" data-action="coffer-yield" data-id="${escapedId}">Crédito manual</button>
          <button type="button" class="secondary-button" data-action="simulate-coffer-yield" data-id="${escapedId}">Simular rendimento</button>
          <button type="button" class="danger-button" data-action="delete-coffer" data-id="${escapedId}" aria-label="Excluir ou arquivar ${sanitizeHtml(coffer.name)}">Excluir</button>
        </div>
      </article>
    `;
  }).join('');
  rebuildCofferSelect();
}

function refreshCreditInvoice(invoice) {
  const installments = state.creditInstallments.filter((item) => item.invoiceId === invoice.id);
  invoice.installmentIds = installments.map((item) => item.id);
  invoice.totalCents = installments.reduce((sum, item) => sum + item.amountCents, 0);
  invoice.paidCents = installments.reduce((sum, item) => sum + item.paidCents, 0);
  invoice.status = summarizeCreditInvoice(invoice, state.creditInstallments, dateKey(new Date())).status;
  invoice.updatedAt = new Date().toISOString();
  invoice.version = (invoice.version || 1) + 1;
  return invoice;
}

function findOrCreateCreditInvoice(card, invoiceMonth) {
  let invoice = state.creditInvoices.find((item) => (
    item.cardId === card.id && item.invoiceMonth === invoiceMonth
  ));
  if (invoice) return invoice;
  const dates = getCreditInvoiceDates(invoiceMonth, card.closingDay, card.dueDay);
  const timestamp = new Date().toISOString();
  invoice = {
    id: createId(),
    cardId: card.id,
    invoiceMonth,
    ...dates,
    installmentIds: [],
    totalCents: 0,
    paidCents: 0,
    status: dateKey(new Date()) > dates.closingDate ? 'closed' : 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1
  };
  state.creditInvoices.push(invoice);
  return invoice;
}

function getCreditInvoiceSummary(invoice) {
  return summarizeCreditInvoice(invoice, state.creditInstallments, dateKey(new Date()));
}

function renderCreditCards() {
  if (!dom.creditCardList) return;
  const cards = state.creditCards || [];
  rebuildCreditCardOptions();
  const usages = cards.map((card) => ({
    card,
    ...calculateCreditCardUsage(card, state.creditInstallments || [])
  }));
  const totalLimitCents = usages.reduce((sum, item) => sum + item.limitCents, 0);
  const totalUsedCents = usages.reduce((sum, item) => sum + item.usedCents, 0);
  if (dom.creditTotalLimit) dom.creditTotalLimit.textContent = formatCurrencyFromCents(totalLimitCents);
  if (dom.creditUsedLimit) dom.creditUsedLimit.textContent = formatCurrencyFromCents(totalUsedCents);
  if (dom.creditAvailableLimit) dom.creditAvailableLimit.textContent = formatCurrencyFromCents(totalLimitCents - totalUsedCents);

  const summaries = (state.creditInvoices || []).map((invoice) => getCreditInvoiceSummary(invoice));
  const unpaidTotalCents = summaries.reduce((sum, invoice) => sum + invoice.remainingCents, 0);
  if (dom.creditOpenInvoices) dom.creditOpenInvoices.textContent = formatCurrencyFromCents(unpaidTotalCents);

  if (cards.length === 0) {
    dom.creditCardList.innerHTML = '<div class="empty-state">Nenhum cartão cadastrado. Cadastre um cartão para organizar limites e faturas.</div>';
  } else {
    dom.creditCardList.innerHTML = usages.map(({ card, usedCents, availableCents, limitCents }) => {
      const ratio = limitCents > 0 ? Math.min(100, Math.max(0, Math.round(usedCents / limitCents * 100))) : 0;
      const cardInvoices = summaries.filter((invoice) => invoice.cardId === card.id && invoice.remainingCents > 0)
        .sort((left, right) => left.invoiceMonth.localeCompare(right.invoiceMonth));
      const nextInvoice = cardInvoices[0];
      const escapedId = sanitizeHtml(card.id);
      return `<article class="credit-card-item" style="--credit-card-color:${sanitizeHtml(card.color)}">
        <div class="credit-card-item-header">
          <span class="credit-card-mark" aria-hidden="true">${sanitizeHtml(card.icon || '💳')}</span>
          <div class="credit-card-title"><h4>${sanitizeHtml(card.name)}</h4><span>${card.active ? 'Ativo' : 'Inativo'}</span></div>
          <button type="button" class="icon-button" data-action="edit-credit-card" data-id="${escapedId}" aria-label="Editar ${sanitizeHtml(card.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        </div>
        <div class="credit-limit-values"><span>Utilizado <strong>${formatCurrencyFromCents(usedCents)}</strong></span><span>Disponível <strong>${formatCurrencyFromCents(availableCents)}</strong></span></div>
        <progress max="100" value="${ratio}" aria-label="${ratio}% do limite utilizado">${ratio}%</progress>
        <p>Limite total: ${formatCurrencyFromCents(limitCents)} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}</p>
        <p>${nextInvoice ? `Próxima fatura: ${formatCurrencyFromCents(nextInvoice.remainingCents)} · vence ${sanitizeHtml(nextInvoice.dueDate)}` : 'Sem faturas pendentes.'}</p>
      </article>`;
    }).join('');
  }

  const sortedInvoices = summaries.sort((left, right) => (
    left.dueDate.localeCompare(right.dueDate)
      || left.cardId.localeCompare(right.cardId)
  ));
  if (sortedInvoices.length === 0) {
    dom.creditInvoiceList.innerHTML = '<div class="empty-state">As faturas e parcelas futuras aparecerão aqui após a primeira compra no cartão.</div>';
    return;
  }
  dom.creditInvoiceList.innerHTML = sortedInvoices.map((invoice) => {
    const card = cards.find((item) => item.id === invoice.cardId);
    const items = state.creditInstallments.filter((item) => item.invoiceId === invoice.id);
    const statusLabel = invoice.status === 'paid' ? 'Paga' : invoice.status === 'closed' ? 'Fechada' : 'Aberta';
    const lines = items.map((item) => {
      const purchase = state.transactions.find((transaction) => transaction.id === item.purchaseId);
      return `<li><span>${sanitizeHtml(purchase?.description || 'Compra removida')} · ${item.installmentNumber}/${item.installmentCount}</span><strong>${formatCurrencyFromCents(item.amountCents - item.paidCents)}</strong></li>`;
    }).join('');
    return `<article class="credit-invoice-item">
      <header><div><h4>${sanitizeHtml(card?.name || 'Cartão removido')} · ${sanitizeHtml(invoice.invoiceMonth)}</h4><p>Fechamento ${sanitizeHtml(invoice.closingDate)} · vencimento ${sanitizeHtml(invoice.dueDate)}</p></div><span class="invoice-status invoice-status--${invoice.status}">${statusLabel}</span></header>
      <ul>${lines}</ul>
      <div class="credit-invoice-total"><span>${invoice.paidCents ? `Pago ${formatCurrencyFromCents(invoice.paidCents)} · saldo restante` : 'Total da fatura'}</span><strong>${formatCurrencyFromCents(invoice.remainingCents)}</strong></div>
      ${invoice.remainingCents > 0 ? `<button type="button" class="primary-button" data-action="pay-credit-invoice" data-id="${sanitizeHtml(invoice.id)}">Pagar fatura</button>` : ''}
    </article>`;
  }).join('');
}

function rebuildCreditCardOptions(select = dom.transactionCreditCard, selectedId = '', activeOnly = true) {
  if (!select) return;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um cartão';
  const options = [placeholder];
  state.creditCards
    .filter((card) => !activeOnly || card.active)
    .forEach((card) => {
      const option = document.createElement('option');
      option.value = card.id;
      option.textContent = `${card.icon || '💳'} ${card.name}`;
      options.push(option);
    });
  select.replaceChildren(...options);
  if (state.creditCards.some((card) => card.id === selectedId)) select.value = selectedId;
}

function updateCreditPurchaseFields() {
  const method = dom.transactionPaymentMethod;
  const operation = dom.transactionCofferOperation?.value || '';
  const typeSelect = document.getElementById('transactionType');
  const statusSelect = document.getElementById('transactionStatus');
  if (!method || !typeSelect || !dom.creditPurchaseFields) return;
  if (operation && method.value === 'creditCard') method.value = 'account';
  const isCreditPurchase = !operation && method.value === 'creditCard';
  dom.creditPurchaseFields.hidden = !isCreditPurchase;
  method.disabled = Boolean(operation);
  if (dom.transactionPayment) {
    const paymentLabel = dom.transactionPayment.closest('label');
    if (paymentLabel) paymentLabel.hidden = isCreditPurchase;
  }
  if (isCreditPurchase) {
    typeSelect.value = 'expense';
    typeSelect.disabled = true;
    if (statusSelect) {
      if (!statusSelect.dataset.creditForced) statusSelect.dataset.previousValue = statusSelect.value;
      statusSelect.dataset.creditForced = 'true';
      statusSelect.value = 'pending';
      statusSelect.disabled = true;
    }
    rebuildTransactionCategoryOptions('expense');
  } else {
    typeSelect.disabled = Boolean(operation);
    if (statusSelect?.dataset.creditForced) {
      statusSelect.disabled = false;
      statusSelect.value = statusSelect.dataset.previousValue || 'paid';
      delete statusSelect.dataset.creditForced;
      delete statusSelect.dataset.previousValue;
    }
  }
  if (dom.transactionCreditCard) {
    dom.transactionCreditCard.required = isCreditPurchase;
    if (isCreditPurchase) rebuildCreditCardOptions(dom.transactionCreditCard, dom.transactionCreditCard.value);
  }
  if (dom.transactionInstallments) dom.transactionInstallments.required = isCreditPurchase;
}

function openCreditCardModal(card = null) {
  const modal = document.getElementById('creditCardModal');
  if (!modal) return;
  activateModal(modal);
  document.getElementById('creditCardModalTitle').textContent = card ? 'Editar cartão' : 'Novo cartão';
  document.getElementById('creditCardName').value = card?.name || '';
  document.getElementById('creditCardIcon').value = card?.icon || '💳';
  document.getElementById('creditCardColor').value = card?.color || '#2563eb';
  document.getElementById('creditCardLimit').value = card
    ? (convertBaseCentsToInputValue(card.limitCents) ?? fromCents(card.limitCents))
    : '';
  document.getElementById('creditCardClosingDay').value = card?.closingDay || 25;
  document.getElementById('creditCardDueDay').value = card?.dueDay || 10;
  document.getElementById('creditCardActive').checked = card?.active !== false;
  modal.dataset.editId = card?.id || '';
}

function handleCreditCardSubmit(event) {
  event.preventDefault();
  const modal = document.getElementById('creditCardModal');
  const id = modal.dataset.editId;
  const existing = id ? state.creditCards.find((item) => item.id === id) : null;
  const name = document.getElementById('creditCardName').value.trim();
  const icon = document.getElementById('creditCardIcon').value.trim() || '💳';
  const color = document.getElementById('creditCardColor').value;
  const limitInput = Number(document.getElementById('creditCardLimit').value);
  const limitCents = convertInputAmountToBaseCents(limitInput);
  const closingDay = Number(document.getElementById('creditCardClosingDay').value);
  const dueDay = Number(document.getElementById('creditCardDueDay').value);
  if (!name || name.length > 60 || Array.from(icon).length > 8 || /[<>]/.test(icon)
    || !/^#[0-9a-f]{6}$/i.test(color)
    || !Number.isSafeInteger(limitCents) || limitCents <= 0
    || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31
    || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    showToast('Revise nome, limite, fechamento e vencimento do cartão.', 'error');
    return;
  }
  const usage = calculateCreditCardUsage(existing || { id, limitCents }, state.creditInstallments);
  if (limitCents < usage.usedCents) {
    showToast('O novo limite não pode ser menor que o valor comprometido em parcelas.', 'error');
    return;
  }
  const timestamp = new Date().toISOString();
  const card = {
    ...(existing || {}),
    id: existing?.id || createId(),
    name,
    icon,
    color,
    limitCents,
    closingDay,
    dueDay,
    active: document.getElementById('creditCardActive').checked,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  if (existing) state.creditCards[state.creditCards.findIndex((item) => item.id === id)] = card;
  else state.creditCards.push(card);
  saveState();
  closeModals();
  renderCreditCards();
  updateRawEditor();
  showToast(existing ? 'Cartão atualizado.' : 'Cartão cadastrado.', 'success');
}

function removeUnpaidCreditPurchaseInstallments(purchaseId) {
  const installments = state.creditInstallments.filter((item) => item.purchaseId === purchaseId);
  if (installments.some((item) => item.paidCents > 0)) return false;
  const invoiceIds = new Set(installments.map((item) => item.invoiceId));
  state.creditInstallments = state.creditInstallments.filter((item) => item.purchaseId !== purchaseId);
  for (const invoiceId of invoiceIds) {
    const invoice = state.creditInvoices.find((item) => item.id === invoiceId);
    if (!invoice) continue;
    if (!state.creditInstallments.some((item) => item.invoiceId === invoiceId)) {
      state.creditInvoices = state.creditInvoices.filter((item) => item.id !== invoiceId);
    } else refreshCreditInvoice(invoice);
  }
  return true;
}

function addCreditPurchaseInstallments(card, purchaseId, purchaseDate, amountCents, installmentCount) {
  const generated = buildCreditInstallmentSchedule({
    card,
    purchaseId,
    purchaseDate,
    amountCents,
    installmentCount,
    createId: () => createId()
  });
  const invoiceByMonth = new Map();
  for (const installment of generated) {
    if (invoiceByMonth.has(installment.invoiceMonth)) continue;
    invoiceByMonth.set(
      installment.invoiceMonth,
      findOrCreateCreditInvoice(card, installment.invoiceMonth)
    );
  }
  const installments = generated.map((item) => ({
    ...item,
    invoiceId: invoiceByMonth.get(item.invoiceMonth).id
  }));
  state.creditInstallments.push(...installments);
  for (const invoice of invoiceByMonth.values()) refreshCreditInvoice(invoice);
}

function openCreditInvoicePayment(invoiceId) {
  const invoice = state.creditInvoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  const summary = getCreditInvoiceSummary(invoice);
  if (summary.remainingCents <= 0) return;
  const card = state.creditCards.find((item) => item.id === invoice.cardId);
  document.getElementById('creditInvoicePaymentTitle').textContent = 'Pagar fatura';
  document.getElementById('creditInvoicePaymentSummary').textContent = `${card?.name || 'Cartão'} · ${invoice.invoiceMonth} · saldo ${formatCurrencyFromCents(summary.remainingCents)} · vence ${invoice.dueDate}`;
  document.getElementById('creditInvoicePaymentAmount').value =
    convertBaseCentsToInputValue(summary.remainingCents, invoice.dueDate) ?? fromCents(summary.remainingCents);
  const source = dom.creditInvoicePaymentSource;
  source.value = 'account';
  const cofferSelect = dom.creditInvoicePaymentCoffer;
  const cofferPlaceholder = document.createElement('option');
  cofferPlaceholder.value = '';
  cofferPlaceholder.textContent = 'Selecione um cofrinho';
  const cofferOptions = [cofferPlaceholder];
  state.coffers.filter((coffer) => coffer.active && coffer.paymentEnabled).forEach((coffer) => {
    const option = document.createElement('option');
    option.value = coffer.id;
    option.textContent = `${coffer.icon || '💰'} ${coffer.name}`;
    cofferOptions.push(option);
  });
  cofferSelect.replaceChildren(...cofferOptions);
  source.querySelector('option[value="coffer"]').disabled = cofferOptions.length === 1;
  document.getElementById('creditInvoicePaymentModal').dataset.invoiceId = invoice.id;
  updateCreditInvoicePaymentSource();
  activateModal(document.getElementById('creditInvoicePaymentModal'));
}

function updateCreditInvoicePaymentSource() {
  const useCoffer = dom.creditInvoicePaymentSource?.value === 'coffer';
  const field = document.getElementById('creditInvoicePaymentCofferField');
  if (field) field.hidden = !useCoffer;
  if (dom.creditInvoicePaymentCoffer) dom.creditInvoicePaymentCoffer.required = useCoffer;
}

function handleCreditInvoicePaymentSubmit(event) {
  event.preventDefault();
  const modal = document.getElementById('creditInvoicePaymentModal');
  const invoice = state.creditInvoices.find((item) => item.id === modal.dataset.invoiceId);
  if (!invoice) {
    showToast('Fatura não encontrada.', 'error');
    return;
  }
  const summary = getCreditInvoiceSummary(invoice);
  const enteredAmount = Number(document.getElementById('creditInvoicePaymentAmount').value);
  const amountCents = convertInputAmountToBaseCents(enteredAmount, dateKey(new Date()));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > summary.remainingCents) {
    showToast(`Informe um pagamento entre R$ 0,01 e ${formatCurrencyFromCents(summary.remainingCents)}.`, 'error');
    return;
  }
  const source = dom.creditInvoicePaymentSource.value;
  if (source === 'account' && calculateCurrentBalance() < amountCents) {
    showToast('Saldo realizado insuficiente para este pagamento. Escolha um valor parcial ou outra origem.', 'error');
    return;
  }
  const timestamp = new Date().toISOString();
  const paymentId = createId();
  let payment;
  if (source === 'coffer') {
    const coffer = state.coffers.find((item) => item.id === dom.creditInvoicePaymentCoffer.value);
    if (!coffer || !coffer.active || !coffer.paymentEnabled) {
      showToast('Selecione um cofrinho ativo e habilitado para pagamentos.', 'error');
      return;
    }
    try {
      payment = createCofferOperation({
        coffer,
        coffers: state.coffers,
        transactions: state.transactions,
        operation: 'withdrawal',
        amountCents,
        date: dateKey(new Date()),
        status: 'paid',
        id: paymentId,
        description: `Pagamento fatura ${invoice.invoiceMonth}`,
        settings: state.cofferSettings
      });
    } catch (error) {
      showToast(`Pagamento não registrado: ${error.message}`, 'error');
      return;
    }
    payment.accountImpactCents = 0;
    payment.affectsAccountBalance = false;
    payment.sourceType = 'creditInvoicePayment';
    payment.creditInvoiceId = invoice.id;
    payment.creditCardId = invoice.cardId;
    payment.paymentSource = 'coffer';
    payment.updatedAt = timestamp;
  } else {
    payment = {
      id: paymentId,
      date: dateKey(new Date()),
      type: 'transfer',
      status: 'paid',
      valueCents: amountCents,
      value: fromCents(amountCents),
      category: '',
      description: `Pagamento fatura ${invoice.invoiceMonth}`,
      payment: 'Saldo da conta',
      sourceType: 'creditInvoicePayment',
      creditInvoiceId: invoice.id,
      creditCardId: invoice.cardId,
      paymentSource: 'account',
      accountImpactCents: -amountCents,
      affectsAccountBalance: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      version: 1
    };
  }

  state.creditInstallments = applyInvoicePayment(state.creditInstallments, invoice.id, amountCents);
  refreshCreditInvoice(invoice);
  state.transactions.push(payment);
  saveState();
  closeModals();
  renderAllUI();
  showToast(`Pagamento de ${formatCurrencyFromCents(amountCents)} registrado.`, 'success');
}

function updateCofferTypeFields() {
  const type = document.getElementById('cofferType')?.value;
  const limitField = document.getElementById('cofferDepositLimitField');
  if (limitField) limitField.hidden = type !== 'marketplace';
}

function openCofferModal(coffer = null, template = null) {
  const defaults = {
    dindin: { name: 'Dindin', type: 'common', icon: '💰', paymentEnabled: true },
    moto: { name: 'Moto', type: 'common', icon: '🏍️', paymentEnabled: true },
    turn: { name: 'Cofrinho da Virada', type: 'turn', icon: '🎆', paymentEnabled: false },
    marketplace: { name: 'Cofrinho Mercado Livre', type: 'marketplace', icon: '🛍️', paymentEnabled: false }
  };
  const preset = template ? defaults[template] : null;
  if (template === 'marketplace' && state.coffers.some((item) => item.type === 'marketplace')) {
    showToast('Já existe um Cofrinho Mercado Livre cadastrado.', 'warning');
    return;
  }
  openModal('cofferModal', 'cofferModalTitle', coffer ? 'Editar cofrinho' : 'Novo cofrinho');
  const source = coffer || preset || {};
  setFormValues({
    cofferName: source.name || '',
    cofferType: source.type || 'common',
    cofferIcon: source.icon || '💰',
    cofferGoal: coffer ? fromCents(coffer.goalCents) : '',
    cofferMonthlyGoal: coffer ? fromCents(coffer.monthlyDepositGoalCents) : '',
    cofferAutomaticDeposit: coffer?.automaticDepositCents ? fromCents(coffer.automaticDepositCents) : '',
    cofferTermMonths: coffer?.termMonths || '',
    cofferDepositLimit: coffer?.depositLimitCents
      ? fromCents(coffer.depositLimitCents)
      : fromCents(state.cofferSettings.marketplaceDepositLimitCents),
    cofferInitialPrincipal: 0,
    cofferInitialYield: 0,
    cofferActive: coffer ? String(coffer.active) : 'true',
    cofferPaymentEnabled: coffer ? coffer.paymentEnabled : Boolean(preset?.paymentEnabled),
    cofferAllowWithdrawalWithoutYieldLoss: coffer
      ? coffer.allowWithdrawalWithoutYieldLoss === true
      : source.type !== 'marketplace'
  });
  const modal = document.getElementById('cofferModal');
  modal.dataset.editId = coffer?.id || '';
  const isDuringCampaign = coffer?.type === 'turn'
    && cofferSimulationDate() >= (coffer.campaignStartDate || state.cofferSettings.turnStartDate)
    && cofferSimulationDate() <= (coffer.campaignEndDate || state.cofferSettings.turnEndDate);
  const lockedIds = ['cofferName', 'cofferIcon', 'cofferGoal', 'cofferMonthlyGoal', 'cofferAutomaticDeposit', 'cofferTermMonths', 'cofferType'];
  for (const id of lockedIds) {
    const element = document.getElementById(id);
    if (element) element.disabled = isDuringCampaign;
  }
  const initialPrincipal = document.getElementById('cofferInitialPrincipal');
  const initialYield = document.getElementById('cofferInitialYield');
  if (initialPrincipal) initialPrincipal.disabled = Boolean(coffer);
  if (initialYield) initialYield.disabled = Boolean(coffer);
  const notice = document.getElementById('cofferCampaignNotice');
  if (notice) {
    notice.textContent = isDuringCampaign
      ? 'Durante a campanha, nome, ícone, metas, prazo e depósito automático ficam bloqueados.'
      : 'Saldos iniciais são registros de abertura; aportes posteriores devem ser lançados para manter o histórico.';
  }
  updateCofferTypeFields();
}

function handleCofferSubmit(event) {
  event.preventDefault();
  const modal = document.getElementById('cofferModal');
  const id = modal.dataset.editId;
  const existing = id ? state.coffers.find((item) => item.id === id) : null;
  const value = (field) => Number(document.getElementById(field).value || 0);
  const asCents = (field) => toCents(value(field));
  const type = existing?.type && document.getElementById('cofferType').disabled
    ? existing.type
    : document.getElementById('cofferType').value;
  const campaignStart = existing?.campaignStartDate || state.cofferSettings.turnStartDate;
  const campaignEnd = existing?.campaignEndDate || state.cofferSettings.turnEndDate;
  const isDuringCampaign = existing?.type === 'turn'
    && cofferSimulationDate() >= campaignStart && cofferSimulationDate() <= campaignEnd;
  const name = isDuringCampaign ? existing.name : document.getElementById('cofferName').value.trim();
  const icon = isDuringCampaign ? existing.icon : document.getElementById('cofferIcon').value.trim();
  if (!name || name.length > 60 || !icon || Array.from(icon).length > 8 || /[<>]/.test(icon)) {
    showToast('Informe um nome e um ícone válidos.', 'error');
    return;
  }
  if (!['common', 'turn', 'marketplace'].includes(type)) {
    showToast('Tipo de cofrinho inválido.', 'error');
    return;
  }
  if (state.coffers.some((item) => item.type === 'marketplace' && item.id !== id) && type === 'marketplace') {
    showToast('Só é permitido um Cofrinho Mercado Livre.', 'error');
    return;
  }
  const monetaryFields = ['cofferGoal', 'cofferMonthlyGoal', 'cofferAutomaticDeposit', 'cofferDepositLimit', 'cofferInitialPrincipal', 'cofferInitialYield'];
  if (monetaryFields.some((field) => !Number.isFinite(value(field)) || value(field) < 0)) {
    showToast('Valores monetários devem ser números não negativos.', 'error');
    return;
  }
  const timestamp = new Date().toISOString();
  const coffer = {
    ...(existing || {}),
    id: existing?.id || createId(),
    name,
    icon,
    type,
    active: document.getElementById('cofferActive').value === 'true',
    paymentEnabled: document.getElementById('cofferPaymentEnabled').checked,
    allowWithdrawalWithoutYieldLoss: document.getElementById('cofferAllowWithdrawalWithoutYieldLoss').checked,
    goalCents: isDuringCampaign ? existing.goalCents : asCents('cofferGoal'),
    monthlyDepositGoalCents: isDuringCampaign ? existing.monthlyDepositGoalCents : asCents('cofferMonthlyGoal'),
    automaticDepositCents: isDuringCampaign ? existing.automaticDepositCents || 0 : asCents('cofferAutomaticDeposit'),
    termMonths: isDuringCampaign ? existing.termMonths || null : (value('cofferTermMonths') || null),
    depositLimitCents: type === 'marketplace'
      ? (asCents('cofferDepositLimit') || state.cofferSettings.marketplaceDepositLimitCents)
      : null,
    campaignStartDate: type === 'turn' ? campaignStart : null,
    campaignEndDate: type === 'turn' ? campaignEnd : null,
    principalCents: existing?.principalCents || 0,
    yieldCents: existing?.yieldCents || 0,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };

  const initialPrincipalCents = existing ? 0 : asCents('cofferInitialPrincipal');
  const initialYieldCents = existing ? 0 : asCents('cofferInitialYield');
  const previousCoffers = state.coffers.slice();
  const previousTransactions = state.transactions.slice();
  if (!existing) state.coffers.push(coffer);
  else state.coffers[state.coffers.findIndex((item) => item.id === id)] = coffer;
  try {
    if (initialPrincipalCents > 0) {
      state.transactions.push(createCofferOperation({
        coffer: { ...coffer, active: true },
        coffers: state.coffers,
        transactions: state.transactions,
        operation: 'opening',
        amountCents: initialPrincipalCents,
        date: dateKey(new Date()),
        id: createId(),
        description: `Saldo inicial — ${name}`,
        settings: state.cofferSettings
      }));
    }
    if (initialYieldCents > 0) {
      const incomeCategory = state.categories.find((item) => item.type === 'income' || item.type === 'both');
      if (!incomeCategory) throw new Error('Cadastre uma categoria de receita antes de registrar rendimento inicial.');
      state.transactions.push(createCofferOperation({
        coffer: { ...coffer, active: true },
        coffers: state.coffers,
        transactions: state.transactions,
        operation: 'yield',
        amountCents: initialYieldCents,
        date: dateKey(new Date()),
        id: createId(),
        description: `Rendimento inicial — ${name}`,
        category: incomeCategory.id,
        settings: state.cofferSettings
      }));
    }
  } catch (error) {
    state.coffers = previousCoffers;
    state.transactions = previousTransactions;
    showToast(`Cofrinho não salvo: ${error.message}`, 'error');
    return;
  }

  saveState();
  closeModals();
  renderAllUI({ coffers: true, transactions: true, dashboard: true, reports: true, editor: true });
  showToast(existing ? 'Cofrinho atualizado.' : 'Cofrinho criado.', 'success');
}

function createCofferTemplate(event) {
  const button = event.target.closest('[data-coffer-template]');
  if (!button) return;
  openCofferModal(null, button.dataset.cofferTemplate);
}

function simulateAndRecordCofferYield(cofferId) {
  const coffer = state.coffers.find((item) => item.id === cofferId);
  if (!coffer || !coffer.active) {
    showToast('Cofrinho inexistente ou inativo.', 'error');
    return;
  }
  const endDate = cofferSimulationDate();
  const lastYield = state.transactions
    .filter((item) => item.cofferId === coffer.id && item.cofferOperation === 'yield')
    .map((item) => item.date)
    .sort()
    .pop();
  const firstOperation = state.transactions
    .filter((item) => item.cofferId === coffer.id)
    .map((item) => item.date)
    .sort()[0];
  const startDate = lastYield || firstOperation || coffer.createdAt.slice(0, 10);
  if (startDate >= endDate) {
    showToast('O período precisa terminar depois do último crédito ou aporte.', 'warning');
    return;
  }
  const result = simulateCofferYield({
    coffer,
    coffers: state.coffers,
    transactions: state.transactions,
    settings: state.cofferSettings,
    startDate,
    endDate
  });
  if (result.netInterestCents <= 0) {
    showToast(`Rendimento líquido calculado: ${formatCurrencyFromCents(result.netInterestCents)} em ${result.businessDays} dias úteis.`, 'info');
    return;
  }
  if (endDate > dateKey(new Date())) {
    showToast(`Prévia de ${result.businessDays} dias úteis: ${formatCurrencyFromCents(result.netInterestCents)} líquidos. Datas futuras não são lançadas como realizadas.`, 'info');
    return;
  }
  const category = state.categories.find((item) => item.id === 'investimentos')
    || state.categories.find((item) => item.type === 'income' || item.type === 'both');
  if (!category) {
    showToast('Cadastre uma categoria de receita para registrar o rendimento.', 'error');
    return;
  }
  const transaction = createCofferOperation({
    coffer,
    coffers: state.coffers,
    transactions: state.transactions,
    operation: 'yield',
    amountCents: result.netInterestCents,
    date: endDate,
    id: createId(),
    description: `Rendimento simulado — ${result.businessDays} dias úteis`,
    category: category.id,
    settings: state.cofferSettings
  });
  transaction.cofferSimulation = result;
  state.transactions.push(transaction);
  saveState();
  renderAllUI({ coffers: true, transactions: true, dashboard: true, reports: true, editor: true });
  showToast(`Rendimento líquido de ${formatCurrencyFromCents(result.netInterestCents)} registrado (${result.businessDays} dias úteis).`, 'success');
}

function deleteCoffer(cofferId) {
  const coffer = state.coffers.find((item) => item.id === cofferId);
  if (!coffer) return;
  const hasLedger = state.transactions.some((item) => item.cofferId === cofferId);
  showDangerConfirmModal(
    hasLedger ? 'Arquivar cofrinho' : 'Excluir cofrinho',
    hasLedger
      ? 'Este cofrinho possui lançamentos vinculados. Ele será desativado para preservar o histórico.'
      : 'Este cofrinho será movido para a lixeira.',
    hasLedger ? 'ARQUIVAR' : 'EXCLUIR',
    () => {
      if (hasLedger) {
        coffer.active = false;
        coffer.updatedAt = new Date().toISOString();
        coffer.version = (coffer.version || 1) + 1;
      } else {
        trashBin.moveToTrash('coffer', coffer);
        state.coffers = state.coffers.filter((item) => item.id !== cofferId);
      }
      saveState();
      renderAllUI({ coffers: true, transactions: true, dashboard: true, reports: true, editor: true, trash: true });
      showToast(hasLedger ? 'Cofrinho arquivado; histórico preservado.' : 'Cofrinho movido para a lixeira.', 'success');
    }
  );
}

function renderReportPage() {
  const year = dom.reportYear.value === 'all' ? null : Number(dom.reportYear.value);
  const hasTransactions = state.transactions.length > 0;
  dom.reportsEmptyState.hidden = hasTransactions;
  dom.analysisChapterTabs.hidden = !hasTransactions;
  if (!hasTransactions) selectChapterTab('analysis', 'summary');
  state.reportYear = dom.reportYear.value; // Save the actual selected value
  renderAnnualCategoryReport(year);
  renderMonthlyComparison(year);
  renderPaymentDistribution(year);
  renderTopExpenses(year);
  renderTopIncomeMonth(year);
  renderHeatmap(year);
  renderReportSummary(year);
  renderProjections(year || new Date().getFullYear());
  renderProjectionDashboard();
  renderPurchaseProjection();
  renderBalanceProjection();
  renderLongTermProjection();
  // Novas funcionalidades
  renderSavingsGoalProgress();
  renderRiskAnalysis();
  renderTrendAnalysis();
  renderSavedScenarios();
  checkSmartAlerts();
  saveState();
}

function renderReportSummary(year) {
  if (!dom.reportSummary) return;
  const realized = calculatePeriodTotals(state.transactions, year, null);
  const unsettled = calculateUnsettledPeriodTotals(state.transactions, year, null);
  const pendingNet = unsettled.pendingIncomeCents - unsettled.pendingExpenseCents;
  const scheduledNet = unsettled.scheduledIncomeCents - unsettled.scheduledExpenseCents;
  const realizedNet = realized.incomeCents - realized.expenseCents;
  const savingsRate = calculateSavingsRate(realized.incomeCents, realized.expenseCents);
  dom.reportSummary.innerHTML = `
    <dl class="report-summary-grid">
      <div><dt>Entradas realizadas</dt><dd>${formatCurrencyFromCents(realized.incomeCents)}</dd></div>
      <div><dt>Saídas realizadas</dt><dd>${formatCurrencyFromCents(realized.expenseCents)}</dd></div>
      <div><dt>Resultado realizado</dt><dd>${formatCurrencyFromCents(realizedNet)}</dd></div>
      <div><dt>Contas pendentes (líquido)</dt><dd>${formatCurrencyFromCents(pendingNet)}</dd></div>
      <div><dt>Agendado (líquido)</dt><dd>${formatCurrencyFromCents(scheduledNet)}</dd></div>
      <div><dt>Taxa de economia</dt><dd>${savingsRate === null ? 'Não aplicável' : `${savingsRate.toFixed(1).replace('.', ',')}%`}</dd></div>
    </dl>
  `;
}

function renderHelpPage() {
  // Função para renderizar comentários dinâmicos
  // Você pode adicionar comentários aqui conforme surgirem dúvidas
  const comments = [
    // Exemplo de comentário:
    // {
    //   title: "Como exportar dados?",
    //   content: "Para exportar seus dados, vá na seção Administrativo e clique em 'Backup'. Isso criará um arquivo JSON com todos os seus dados.",
    //   date: "2024-01-15"
    // }
    {
      title: "Excluir vários dados de uma vez",
      content: "Para excluir vários dados de uma vez, selecione-os utilizando a caixa de seleção e clique no botão 'Excluir Selecionados' no painel Administrativo.",
      date: "2026-04-09"
    },
    {
      title: "Backup e restauração de dados",
      content: "Para criar um backup dos seus dados, vá na seção lateral e clique em 'Backup'. Isso criará um arquivo JSON com todos os seus dados. Para restaurar os dados, utilize o botão 'Importar backup JSON' no painel Administrativo.",
      date: "2026-04-09"
    },
    {
      title: "Os dados são armazenados localmente?",
      content: "Sim, seus dados são armazenados localmente em seu navegador. Isso garante a privacidade e o controle sobre suas informações financeiras.",
      date: "2026-04-09"
    }
  ];

  const commentsContainer = document.getElementById('helpComments');
  if (commentsContainer && comments.length > 0) {
    const commentsHtml = comments.map(comment => `
      <div class="comment-item" style="background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
        <h6 style="margin: 0 0 0.5rem 0; color: var(--accent);">${comment.title}</h6>
        <p style="margin: 0 0 0.5rem 0; color: var(--text);">${comment.content}</p>
        <small style="color: var(--muted);">${comment.date}</small>
      </div>
    `).join('');

    commentsContainer.innerHTML = commentsHtml;
  }
}

function renderProjections(year) {
  const forecast = renderForecastData(year, 3);
  const summaryElement = document.getElementById('projectionSummary');
  const listElement = document.getElementById('projectionList');

  if (!summaryElement || !listElement) return;

  const totalIncome = forecast.reduce((sum, item) => sum + item.projectedIncome, 0);
  const totalExpense = forecast.reduce((sum, item) => sum + item.projectedExpense, 0);
  const totalBalance = forecast.reduce((sum, item) => sum + item.projectedBalance, 0);
  const avgMonthlyNet = totalBalance / forecast.length;
  const savingsRate = totalIncome > 0 ? ((totalBalance / totalIncome) * 100) : null;
  
  // Análise de tendência ao longo dos meses
  let negativeMonths = 0;
  forecast.forEach((item) => {
    if (item.projectedBalance < 0) negativeMonths++;
  });

  const summaryColor = totalBalance >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  const summaryBorderColor = totalBalance >= 0 ? '#16a34a' : '#dc2626';

  summaryElement.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
      <div style="background: ${summaryColor}; border-left: 4px solid ${summaryBorderColor}; padding: 1rem; border-radius: 8px;">
        <div style="color: #94a3b8; font-size: 0.9rem;">Total de Receita</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: #22c55e; margin-top: 0.5rem;">${formatCurrency(totalIncome)}</div>
        <div style="margin-top: 0.5rem; color: #94a3b8; font-size: 0.85rem;">Média: ${formatCurrency(totalIncome / forecast.length)}/mês</div>
      </div>
      <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #dc2626; padding: 1rem; border-radius: 8px;">
        <div style="color: #94a3b8; font-size: 0.9rem;">Total de Despesa</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: #ef4444; margin-top: 0.5rem;">${formatCurrency(totalExpense)}</div>
        <div style="margin-top: 0.5rem; color: #94a3b8; font-size: 0.85rem;">Média: ${formatCurrency(totalExpense / forecast.length)}/mês</div>
      </div>
      <div style="background: ${summaryColor}; border-left: 4px solid ${summaryBorderColor}; padding: 1rem; border-radius: 8px;">
        <div style="color: #94a3b8; font-size: 0.9rem;">Saldo Projetado Total</div>
        <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.5rem; color: ${summaryBorderColor};">${formatCurrency(totalBalance)}</div>
        <div style="margin-top: 0.5rem; color: #94a3b8; font-size: 0.85rem;">Taxa de economia: ${savingsRate === null ? 'Não aplicável' : `${savingsRate.toFixed(1)}%`}</div>
      </div>
    </div>
    <div style="margin-top: 1rem; padding: 1rem; background: rgba(100, 116, 139, 0.1); border-radius: 8px;">
      <div><strong>⚠️ Análise de Risco</strong></div>
      <div style="margin-top: 0.5rem;">Meses com projeção negativa: <span style="color: ${negativeMonths > 0 ? '#ef4444' : '#22c55e'}; font-weight: 600;">${negativeMonths}/${forecast.length}</span></div>
      <div style="margin-top: 0.25rem;">Saldo mensal médio: <span style="color: ${avgMonthlyNet >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 600;">${formatCurrency(avgMonthlyNet)}</span></div>
    </div>
  `;

  listElement.innerHTML = forecast.map((item) => {
    const monthBalance = item.projectedBalance;
    const isNegative = monthBalance < 0;
    const bgColor = isNegative ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)';
    const label = `${labelsMonths[item.month - 1]} ${item.year}`;
    const monthlyNet = item.projectedIncome - item.projectedExpense;
    const daysOfCoverage = item.projectedExpense > 0 ? (monthBalance / item.projectedExpense * 30).toFixed(0) : 0;
    
    return `<div class="projection-row" style="background: ${bgColor}; padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; border-left: 4px solid ${isNegative ? '#dc2626' : '#16a34a'};">
      <div style="font-weight: 700; margin-bottom: 0.75rem;">${label}</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
        <div>
          <span style="color: #94a3b8; font-size: 0.9rem;">Receita:</span>
          <span style="color: #22c55e; font-weight: 600;">${formatCurrency(item.projectedIncome)}</span>
        </div>
        <div>
          <span style="color: #94a3b8; font-size: 0.9rem;">Despesa:</span>
          <span style="color: #ef4444; font-weight: 600;">${formatCurrency(item.projectedExpense)}</span>
        </div>
        <div>
          <span style="color: #94a3b8; font-size: 0.9rem;">Saldo mês:</span>
          <span style="color: ${monthlyNet >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 600;">${formatCurrency(monthlyNet)}</span>
        </div>
        <div>
          <span style="color: #94a3b8; font-size: 0.9rem;">Saldo acumulado:</span>
          <span style="font-weight: 600; color: ${isNegative ? '#ef4444' : '#16a34a'};">${formatCurrency(monthBalance)}</span>
        </div>
        <div>
          <span style="color: #94a3b8; font-size: 0.9rem;">Cobertura:</span>
          <span style="color: ${daysOfCoverage >= 60 ? '#22c55e' : daysOfCoverage >= 30 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${daysOfCoverage} dias</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAnnualCategoryReport(year) {
  const result = {};
  state.transactions.filter((item) => periodMatches(item.date, year)
    && (item.status === 'paid' || item.sourceType === 'creditPurchase'))
    .forEach((item) => {
      if (!['income', 'expense'].includes(item.type)) return;
      if (item.type === 'expense' && !isCategoryExpenseIncluded(item)) return;
    const label = item.type === 'expense' ? getCategory(item.category)?.name || item.category : 'Receitas';
    const amount = Number.isSafeInteger(item.valueCents) ? fromCents(item.valueCents) : item.value;
    result[label] = (result[label] || 0) + amount;
  });
  const items = Object.entries(result).sort((a, b) => b[1] - a[1]);
  charts.reportCategory = renderChart(charts.reportCategory, dom.chartReportCategory, {
    type: 'doughnut',
    data: { labels: items.map((item) => item[0]), datasets: [{ data: items.map((item) => item[1]), backgroundColor: generatePalette(items.length) }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } } }
  });
}

function renderMonthlyComparison(year) {
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const totals = calculatePeriodTotals(state.transactions, year, index + 1);
    return fromCents(totals.incomeCents - totals.expenseCents);
  });
  charts.reportMonthly = renderChart(charts.reportMonthly, dom.chartReportMonthly, {
    type: 'bar',
    data: { labels: labelsMonths, datasets: [{ label: 'Saldo', data: monthly, backgroundColor: 'rgba(56,189,248,0.75)' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: chartScaleOptions() }
  });
}

function renderPaymentDistribution(year) {
  const breakdown = {};
  state.transactions
    .filter((item) => periodMatches(item.date, year)
      && (item.status === 'paid' || item.sourceType === 'creditPurchase')
      && ['income', 'expense'].includes(item.type))
    .forEach((item) => {
      const amount = Number.isSafeInteger(item.valueCents) ? fromCents(item.valueCents) : item.value;
      breakdown[item.payment || 'Outros'] = (breakdown[item.payment || 'Outros'] || 0) + amount;
  });
  const items = Object.entries(breakdown);
  charts.reportPayment = renderChart(charts.reportPayment, dom.chartReportPayment, {
    type: 'pie',
    data: { labels: items.map((item) => item[0]), datasets: [{ data: items.map((item) => item[1]), backgroundColor: generatePalette(items.length) }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } } }
  });
}

function renderTopExpenses(year) {
  const items = state.transactions
    .filter((item) => periodMatches(item.date, year) && isCategoryExpenseIncluded(item))
    .sort((a, b) => (b.valueCents || toCents(b.value)) - (a.valueCents || toCents(a.value)))
    .slice(0, 10);
  dom.reportTopExpenses.innerHTML = items.map((item, index) => (
    `<div><strong>#${index + 1}</strong> ${sanitizeHtml(item.description)} <span>${formatCurrencyFromCents(item.valueCents || toCents(item.value))}</span></div>`
  )).join('') || '<div>Nenhum gasto realizado neste período.</div>';
}

function renderTopIncomeMonth(year) {
  const monthlyIncome = Array.from({ length: 12 }, (_, index) => {
    const totals = calculatePeriodTotals(state.transactions, year, index + 1);
    return { month: index + 1, incomeCents: totals.incomeCents };
  });
  const top = monthlyIncome.reduce((best, item) => (
    item.incomeCents > best.incomeCents ? item : best
  ), { month: null, incomeCents: 0 });

  if (top.month !== null && top.incomeCents > 0) {
    dom.reportTopIncomeMonth.innerHTML = `<div><strong>${labelsMonths[top.month - 1]}</strong> <span>${formatCurrencyFromCents(top.incomeCents)}</span></div>`;
    charts.reportTopIncome = renderChart(charts.reportTopIncome, dom.chartReportTopIncome, {
      type: 'bar',
      data: {
        labels: [labelsMonths[top.month - 1]],
        datasets: [{
          label: 'Entradas realizadas',
          data: [fromCents(top.incomeCents)],
          backgroundColor: 'rgba(34,197,94,0.75)'
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: chartScaleOptions() }
    });
  } else {
    dom.reportTopIncomeMonth.innerHTML = '<div>Nenhuma entrada realizada neste período.</div>';
    charts.reportTopIncome = renderChart(charts.reportTopIncome, dom.chartReportTopIncome, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Entradas realizadas', data: [] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
}

function renderHeatmap(year) {
  const matrix = Array.from({ length: 31 }, () => 0);
  state.transactions
    .filter((item) => periodMatches(item.date, year) && isCategoryExpenseIncluded(item))
    .forEach((item) => {
    const day = Number(item.date.slice(-2)) - 1;
    matrix[day] += fromCents(Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value));
  });
  const maxValue = Math.max(...matrix, 1);
  dom.spendingHeatmap.innerHTML = matrix.map((value, index) => {
    const level = value / maxValue;
    const alpha = 0.12 + level * 0.78;
    return `<div class="heatmap-cell" style="background: rgba(239,68,68,${alpha});">${index + 1}<br>${value ? formatCurrency(value) : '-'}</div>`;
  }).join('');
}

function renderLimitsTable() {
  const filterYear = state.filters.year === 'all' ? null : Number(state.filters.year);
  const filterMonth = state.filters.month === 'all' ? null : Number(state.filters.month);

  dom.limitTableBody.innerHTML = state.categories.map((category) => {
    const monthlySpentCents = state.transactions
      .filter((item) => periodMatches(item.date, filterYear, filterMonth)
        && isCategoryExpenseIncluded(item)
        && item.category === category.id)
      .reduce((sum, item) => sum + (
        Number.isSafeInteger(item.valueCents) ? item.valueCents : toCents(item.value)
      ), 0);
    const limitCents = Number.isSafeInteger(category.limitCents)
      ? category.limitCents
      : toCents(category.limit || 0);
    const usage = limitCents ? Math.min(100, Math.round((monthlySpentCents / limitCents) * 100)) : 0;
    const status = limitCents ? `${usage}% usado` : 'Sem limite';
    const displayValue = convertBaseCentsToInputValue(limitCents);
    return `<tr><td>${sanitizeHtml(category.icon)} ${sanitizeHtml(category.name)}</td><td><input type="number" min="0" step="0.01" data-category="${sanitizeHtml(category.id)}" value="${displayValue === null ? '' : displayValue}" class="limit-input" aria-label="Limite de ${sanitizeHtml(category.name)}"></td><td>${status}</td></tr>`;
  }).join('');
}

function updateRawEditor() {
  dom.rawDataEditor.value = JSON.stringify(state, null, 2);
}

function handleBackupImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // PHASE 2: Validar arquivo
  if (!file.name.endsWith('.json')) {
    showToast('Arquivo deve ser um JSON (.json).', 'error');
    event.target.value = '';
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB max
    showToast('Arquivo muito grande (máximo 5MB).', 'error');
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('Formato inválido');
      const candidate = migrateState(parsed.state || parsed);
      const issues = validateStateShape(candidate);
      if (issues.length > 0) throw new Error(issues.slice(0, 3).join('; '));
      performAutomaticBackup();
      state = candidate;
      
      calcCache.clear();
      saveState();
      applyTheme();
      populateSelects();
      renderDashboard();
      renderTransactionTable();
      renderCategoryTable();
      renderFixedTable();
      renderReportPage();
      renderLimitsTable();
      updateRawEditor();
      showToast('Backup importado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showToast(`Erro ao importar backup: ${error.message}`, 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function updateMenuToggleButton(menuOpen) {
  const button = document.getElementById('menuToggleButton');
  if (!button) return;
  button.setAttribute('aria-expanded', menuOpen.toString());
  button.setAttribute('aria-label', menuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
}

function toggleMobileMenu() {
  const menuOpen = document.body.classList.toggle('menu-open');
  updateMenuToggleButton(menuOpen);
}

function closeMobileMenu() {
  if (closeMobileNavigation(document, window)) return;
  const menuOpen = document.body.classList.contains('menu-open');
  if (menuOpen) {
    document.body.classList.remove('menu-open');
    updateMenuToggleButton(false);
  }
}

function attachEventListeners() {
  if (dom.dashboardYear) dom.dashboardYear.addEventListener('change', () => {
    updateMonthSelectsForYear(dom.dashboardYear, dom.dashboardMonth);
    // Reset month to "all" when year changes
    dom.dashboardMonth.value = 'all';
    calcCache.clear(); // Limpar cache ao mudar filtro
    renderDashboard();
  });
  if (dom.dashboardMonth) dom.dashboardMonth.addEventListener('change', () => {
    calcCache.clear(); // Limpar cache ao mudar filtro
    renderDashboard();
  });
  
  // Debounce: Busca enquanto digita (300ms de atraso)
  if (dom.transactionSearch) dom.transactionSearch.addEventListener('input', debounce(() => { 
    state.pagination.page = 1; 
    renderTransactionTable(); 
  }, 300));
  
  if (dom.transactionYear) dom.transactionYear.addEventListener('change', () => {
    updateMonthSelectsForYear(dom.transactionYear, dom.transactionMonth);
    // Reset month to "all" when year changes
    dom.transactionMonth.value = 'all';
    state.pagination.page = 1;
    calcCache.clear();
    renderTransactionTable();
  });
  if (dom.transactionMonth) dom.transactionMonth.addEventListener('change', () => { 
    state.pagination.page = 1; 
    calcCache.clear();
    renderTransactionTable(); 
  });
  if (dom.transactionTypeFilter) dom.transactionTypeFilter.addEventListener('change', () => { 
    state.pagination.page = 1; 
    calcCache.clear();
    renderTransactionTable(); 
  });
  if (dom.transactionCategoryFilter) dom.transactionCategoryFilter.addEventListener('change', () => { 
    state.pagination.page = 1; 
    calcCache.clear();
    renderTransactionTable(); 
  });
  if (dom.transactionPageSize) dom.transactionPageSize.addEventListener('change', () => { 
    state.pagination.page = 1; 
    renderTransactionTable(); 
  });
  
  // Debounce: Busca por categoria (300ms)
  if (dom.categorySearch) dom.categorySearch.addEventListener('input', debounce(renderCategoryTable, 300));
  
  if (dom.reportYear) dom.reportYear.addEventListener('change', () => {
    calcCache.clear();
    renderReportPage();
  });
  if (dom.calculatePurchaseProjectionButton) dom.calculatePurchaseProjectionButton.addEventListener('click', (event) => {
    event.preventDefault();
    renderPurchaseProjection();
  });
  if (dom.calculateBalanceProjectionButton) dom.calculateBalanceProjectionButton.addEventListener('click', (event) => {
    event.preventDefault();
    renderBalanceProjection();
  });
  if (dom.calculateLongTermProjectionButton) {
    dom.calculateLongTermProjectionButton.addEventListener('click', renderLongTermProjection);
  }
  
  if (document.getElementById('openAddTransaction')) document.getElementById('openAddTransaction').addEventListener('click', () => openTransactionModal());
  if (dom.emptyAddTransaction) dom.emptyAddTransaction.addEventListener('click', () => openTransactionModal());
  if (dom.emptyAddInitialBalance) dom.emptyAddInitialBalance.addEventListener('click', openInitialBalanceModal);
  if (dom.emptyOpenCoffers) {
    dom.emptyOpenCoffers.addEventListener('click', () => {
      document.querySelector('.nav-link[data-target="coffers"]')?.click();
    });
  }
  if (dom.reportsEmptyAddTransaction) {
    dom.reportsEmptyAddTransaction.addEventListener('click', () => openTransactionModal());
  }
  if (document.getElementById('openPurchaseChecker')) {
    document.getElementById('openPurchaseChecker').addEventListener('click', () => {
      document.querySelector('.nav-link[data-target="reports"]')?.click();
      document.getElementById('projections-tab-button')?.click();
      requestAnimationFrame(() => {
        dom.purchaseValue?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dom.purchaseValue?.focus();
      });
    });
  }
  if (document.getElementById('openAddInitialBalance')) document.getElementById('openAddInitialBalance').addEventListener('click', () => openInitialBalanceModal());
  if (document.getElementById('openAddCategory')) document.getElementById('openAddCategory').addEventListener('click', () => openCategoryModal());
  if (document.getElementById('openAddFixedExpense')) document.getElementById('openAddFixedExpense').addEventListener('click', () => openFixedModal());
  if (document.getElementById('applyFixedExpenses')) document.getElementById('applyFixedExpenses').addEventListener('click', applyFixedExpenses);
  if (document.getElementById('downloadCsvButton')) document.getElementById('downloadCsvButton').addEventListener('click', () => exportReport('csv'));
  if (document.getElementById('downloadPdfButton')) document.getElementById('downloadPdfButton').addEventListener('click', () => exportReport('pdf'));
  if (document.getElementById('clearDataButton')) document.getElementById('clearDataButton').addEventListener('click', clearAllData);
  if (document.getElementById('clearTransactionsButton')) document.getElementById('clearTransactionsButton').addEventListener('click', clearAllTransactions);
  if (document.getElementById('clearCategoriesButton')) document.getElementById('clearCategoriesButton').addEventListener('click', clearPersonalizedCategories);
  if (document.getElementById('clearFixedExpensesButton')) document.getElementById('clearFixedExpensesButton').addEventListener('click', clearFixedExpenses);
  if (document.getElementById('backupButton')) document.getElementById('backupButton').addEventListener('click', backupData);
  if (document.getElementById('downloadSettingsBackupButton')) {
    document.getElementById('downloadSettingsBackupButton').addEventListener('click', backupData);
  }
  if (document.getElementById('installAppButton')) document.getElementById('installAppButton').addEventListener('click', installApp);
  if (document.getElementById('makeBackupFromWarning')) document.getElementById('makeBackupFromWarning').addEventListener('click', () => {
    closeModals();
    performAutomaticBackup();
  });
  const menuToggleButton = document.getElementById('menuToggleButton');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  if (menuToggleButton) menuToggleButton.addEventListener('click', toggleMobileMenu);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileMenu);
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1100) closeMobileMenu();
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileMenu();
  });
  document.addEventListener('keydown', (event) => {
    const modal = document.querySelector('.modal.active[aria-modal="true"]');
    if (!modal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModals();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1100) closeMobileMenu();
  });
  if (dom.themeBg) dom.themeBg.addEventListener('input', updateThemeColor);
  if (dom.themeHeader) dom.themeHeader.addEventListener('input', updateThemeColor);
  if (dom.themeCard) dom.themeCard.addEventListener('input', updateThemeColor);
  if (dom.themeAccent) dom.themeAccent.addEventListener('input', updateThemeColor);
  if (dom.themeToggle) dom.themeToggle.addEventListener('change', toggleThemeMode);
  if (document.getElementById('saveThemeButton')) document.getElementById('saveThemeButton').addEventListener('click', saveThemeSettings);
  
  // PHASE 11: Event listeners para moeda e notificações
  if (document.getElementById('currencySelect')) {
    document.getElementById('currencySelect').addEventListener('change', (e) => {
      try {
        state = changeDisplayCurrency(state, e.target.value, dateKey(new Date()));
        saveState();
        renderAllUI();
        updateCurrencyValueLabel();
        showToast(`Moeda de exibição: ${SUPPORTED_CURRENCIES[e.target.value].label}. Valores-base preservados em BRL.`, 'success');
      } catch (error) {
        e.target.value = state.settings.currency || BASE_CURRENCY;
        showToast(error.message, 'error');
      }
    });
    // Carregar moeda salva
    document.getElementById('currencySelect').value = state.settings.currency || 'BRL';
  }
  if (document.getElementById('addFxRateButton')) {
    document.getElementById('addFxRateButton').addEventListener('click', addFxRate);
  }
  if (document.getElementById('saveProjectionSettings')) {
    document.getElementById('saveProjectionSettings').addEventListener('click', () => {
      const percent = Number(document.getElementById('annualInflationRate').value);
      const bps = Math.round(percent * 100);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100 || !Number.isInteger(bps)) {
        showToast('Inflação deve estar entre 0% e 100%.', 'error');
        return;
      }
      state.settings.annualInflationBps = bps;
      saveState();
      renderReportPage();
      updateRawEditor();
      showToast('Parâmetro de inflação salvo.', 'success');
    });
  }
  
  if (document.getElementById('notificationsToggle')) {
    document.getElementById('notificationsToggle').addEventListener('change', (e) => {
      state.settings.notificationsEnabled = e.target.checked;
      saveState();
      showToast(e.target.checked ? '🔔 Notificações ativadas' : '🔕 Notificações desativadas', 'info');
    });
    document.getElementById('notificationsToggle').checked = state.settings.notificationsEnabled;
  }
  
  if (document.getElementById('notificationThreshold')) {
    document.getElementById('notificationThreshold').addEventListener('change', (e) => {
      state.settings.notifyOnLimitReached = Number(e.target.value);
      saveState();
      showToast(`📊 Limiar de notificação: ${e.target.value}%`, 'info');
    });
    document.getElementById('notificationThreshold').value = state.settings.notifyOnLimitReached || 80;
  }
  
  if (document.getElementById('enablePushButton')) {
    document.getElementById('enablePushButton').addEventListener('click', () => {
      notificationSystem.enablePushNotifications();
    });
  }
  if (document.getElementById('restoreTrashButton')) document.getElementById('restoreTrashButton').addEventListener('click', restoreLastTrashItem);
  if (document.getElementById('emptyTrashButton')) document.getElementById('emptyTrashButton').addEventListener('click', emptyTrash);
  if (document.getElementById('refreshRawButton')) document.getElementById('refreshRawButton').addEventListener('click', updateRawEditor);
  if (document.getElementById('applyRawButton')) document.getElementById('applyRawButton').addEventListener('click', applyRawJson);
  if (document.getElementById('importBackupButton')) document.getElementById('importBackupButton').addEventListener('click', () => {
    if (document.getElementById('backupImportInput')) document.getElementById('backupImportInput').click();
  });
  if (document.getElementById('backupImportInput')) document.getElementById('backupImportInput').addEventListener('change', handleBackupImport);
  document.querySelectorAll('#transactionTable th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) {
        state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = key;
        state.sort.order = 'desc';
      }
      renderTransactionTable();
    });
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeModals));
  if (document.getElementById('transactionForm')) document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);
  if (document.getElementById('transactionType')) {
    document.getElementById('transactionType').addEventListener('change', (event) => {
      rebuildTransactionCategoryOptions(event.target.value);
      updateCreditPurchaseFields();
    });
  }
  if (dom.transactionPaymentMethod) {
    dom.transactionPaymentMethod.addEventListener('change', updateCreditPurchaseFields);
  }
  if (dom.transactionCofferOperation) {
    dom.transactionCofferOperation.addEventListener('change', updateCofferTransactionFields);
  }
  if (document.getElementById('cofferType')) {
    document.getElementById('cofferType').addEventListener('change', updateCofferTypeFields);
  }
  if (document.getElementById('cofferForm')) {
    document.getElementById('cofferForm').addEventListener('submit', handleCofferSubmit);
  }
  if (document.getElementById('cofferSettingsForm')) {
    document.getElementById('cofferSettingsForm').addEventListener('submit', saveCofferSettings);
  }
  if (document.getElementById('createCofferButton')) {
    document.getElementById('createCofferButton').addEventListener('click', () => openCofferModal());
  }
  if (dom.creditCardForm) dom.creditCardForm.addEventListener('submit', handleCreditCardSubmit);
  if (dom.creditInvoicePaymentForm) {
    dom.creditInvoicePaymentForm.addEventListener('submit', handleCreditInvoicePaymentSubmit);
  }
  if (dom.creditInvoicePaymentSource) {
    dom.creditInvoicePaymentSource.addEventListener('change', updateCreditInvoicePaymentSource);
  }
  if (document.getElementById('createCreditCardButton')) {
    document.getElementById('createCreditCardButton').addEventListener('click', () => openCreditCardModal());
  }
  document.querySelectorAll('[data-coffer-template]').forEach((button) => {
    button.addEventListener('click', createCofferTemplate);
  });
  if (document.getElementById('initialBalanceForm')) {
    document.getElementById('initialBalanceForm').addEventListener('submit', handleInitialBalanceSubmit);
  }
  if (document.getElementById('categoryForm')) document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
  if (document.getElementById('fixedForm')) document.getElementById('fixedForm').addEventListener('submit', handleFixedSubmit);
  if (document.getElementById('fixedType')) document.getElementById('fixedType').addEventListener('change', toggleDurationField);
  document.addEventListener('click', handleTableActions);
  document.addEventListener('input', handleLimitInputs);
  
  // Goals event listeners
  if (dom.addGoalButton) dom.addGoalButton.addEventListener('click', () => openGoalModal());
  if (dom.goalForm) dom.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveGoal();
  });
  
  // PHASE 4: Atalho de busca global com Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const query = prompt('Buscar em transações, categorias e gastos fixos:');
      if (query !== null) {
        const results = globalSearch(query);
        if (results.total === 0) {
          showToast('Nenhum resultado encontrado.', 'warning');
        } else {
          showToast(`Encontrados ${results.total} resultado(s).`, 'info');
          // Navegar para a página de transações e filtrar
          dom.transactionSearch.value = query;
          state.pagination.page = 1;
          renderTransactionTable();
          // Ativar aba de transações
          dom.navLinks.forEach(link => link.classList.remove('active'));
          document.querySelector('[data-target="transactions"]').classList.add('active');
          document.querySelectorAll('.page-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === 'transactions');
          });
          dom.pageTitle.textContent = 'Transações';
        }
      }
    }
  });
  
  // Inicializar tooltips customizados
  initTooltips();
}

function initTooltips() {
  // Melhorar acessibilidade dos tooltips
  document.querySelectorAll('.tooltip-icon').forEach(icon => {
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Toggle tooltip visibility for keyboard users
        const tooltip = icon.nextElementSibling;
        if (tooltip) {
          const isVisible = tooltip.style.visibility === 'visible';
          tooltip.style.visibility = isVisible ? 'hidden' : 'visible';
          tooltip.style.opacity = isVisible ? '0' : '1';
        }
      }
      if (e.key === 'Escape') {
        // Hide tooltip
        const tooltip = icon.nextElementSibling;
        if (tooltip) {
          tooltip.style.visibility = 'hidden';
          tooltip.style.opacity = '0';
        }
      }
    });

    // Hide tooltip when clicking outside or on other elements
    icon.addEventListener('blur', () => {
      setTimeout(() => {
        const tooltip = icon.nextElementSibling;
        if (tooltip) {
          tooltip.style.visibility = 'hidden';
          tooltip.style.opacity = '0';
        }
      }, 150);
    });
  });

  // Close tooltips when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tooltip')) {
      document.querySelectorAll('.tooltip-text').forEach(tooltip => {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
      });
    }
  });
}

function handleLimitInputs(event) {
  if (!event.target.matches('.limit-input')) return;
  const categoryId = event.target.dataset.category;
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) {
    showToast('Informe um limite válido e não negativo.', 'error');
    return;
  }
  const limitCents = value === 0 ? 0 : convertInputAmountToBaseCents(value);
  if (limitCents === null) {
    showToast(`Cadastre uma taxa de câmbio válida para ${state.settings.currency}.`, 'error');
    return;
  }
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  category.limitCents = limitCents;
  category.limit = fromCents(limitCents);
  saveState();
  renderLimitsTable();
}

/**
 * Abre modal de edição/criação de transação
 * @function openTransactionModal
 * @description Preenche e mostra modal com dados de transação
 * @param {Object} [transaction=null] - Transação a editar (null = novo)
 * @returns {void}
 */
function openTransactionModal(transaction = null, options = {}) {
  // PHASE 3: Usar funções auxiliares para reduzir duplicação
  const modal = document.getElementById('transactionModal');
  activateModal(modal);
  const title = transaction ? 'Editar lançamento' : 'Novo lançamento';
  document.getElementById('transactionModalTitle').textContent = title;
  
  const categoryId = transaction?.category || state.categories.find((cat) => cat.type === 'expense')?.id || '';
  setFormValues({
    transactionDate: transaction?.date || dateKey(new Date()),
    transactionType: transaction?.type || 'expense',
    transactionCategory: categoryId,
    transactionSubcategory: transaction?.subcategory || '',
    transactionValue: transaction
      ? transaction.currencyAtEntry === state.settings.currency
        && Number.isSafeInteger(transaction.amountCentsAtEntry)
        ? fromCents(transaction.amountCentsAtEntry)
        : convertBaseCentsToInputValue(transaction.valueCents || toCents(transaction.value), transaction.date)
      : '',
    transactionPayment: transaction?.payment || '',
    transactionStatus: transaction?.status || 'paid',
    transactionDescription: transaction?.description || '',
    transactionCofferOperation: transaction?.cofferOperation || options.operation || '',
    transactionCoffer: transaction?.cofferId || options.cofferId || ''
  });
  modal.dataset.editId = transaction?.id || '';
  rebuildTransactionCategoryOptions(transaction?.type || 'expense');
  updateCofferTransactionFields();
}

function updateCofferTransactionFields() {
  const operation = dom.transactionCofferOperation?.value || '';
  const typeSelect = document.getElementById('transactionType');
  const categorySelect = dom.transactionCategory;
  if (!typeSelect || !categorySelect || !dom.transactionCoffer) return;
  const transactionTypeByOperation = {
    deposit: 'transfer',
    withdrawal: 'transfer',
    purchase: 'expense',
    yield: 'income'
  };
  const operationType = transactionTypeByOperation[operation];
  typeSelect.disabled = Boolean(operationType);
  if (operationType) {
    typeSelect.value = operationType;
    rebuildTransactionCategoryOptions(operationType);
  }
  const isAccountTransfer = operation === 'deposit' || operation === 'withdrawal';
  categorySelect.disabled = isAccountTransfer;
  categorySelect.required = !isAccountTransfer;
  if (isAccountTransfer) categorySelect.value = '';
  dom.transactionCoffer.disabled = !operation;
  dom.transactionCoffer.required = Boolean(operation);
  if (operation === 'purchase' && dom.transactionCoffer.value) {
    const coffer = state.coffers.find((item) => item.id === dom.transactionCoffer.value);
    if (coffer?.type !== 'marketplace') {
      const marketplaceCoffer = state.coffers.find((item) => item.type === 'marketplace');
      if (marketplaceCoffer) dom.transactionCoffer.value = marketplaceCoffer.id;
    }
  }
  if (!operation) {
    typeSelect.disabled = false;
    categorySelect.disabled = false;
    categorySelect.required = true;
    rebuildTransactionCategoryOptions(typeSelect.value);
  }
}

function openInitialBalanceModal() {
  const modal = document.getElementById('initialBalanceModal');
  if (!modal) return;
  activateModal(modal);
  document.getElementById('initialBalanceModalTitle').textContent =
    state.initialBalances?.length ? 'Editar saldo inicial' : 'Adicionar saldo inicial';
  const current = state.initialBalances?.[0];
  setFormValues({
    initialBalanceValue: current
      ? current.currencyAtEntry === state.settings.currency
        && Number.isSafeInteger(current.amountCentsAtEntry)
        ? fromCents(current.amountCentsAtEntry)
        : convertBaseCentsToInputValue(current.valueCents, current.date)
      : '',
    initialBalanceDate: current?.date || dateKey(new Date()),
    initialBalanceNote: current?.note || 'Saldo inicial'
  });
  modal.dataset.editId = current?.id || '';
}

function handleInitialBalanceSubmit(event) {
  event.preventDefault();
  const modal = document.getElementById('initialBalanceModal');
  const id = modal?.dataset.editId;
  const date = document.getElementById('initialBalanceDate').value;
  const value = Number(document.getElementById('initialBalanceValue').value);
  const note = document.getElementById('initialBalanceNote').value.trim();
  const existing = id ? state.initialBalances.find((item) => item.id === id) : null;
  if (!normalizeDate(date) || !Number.isFinite(value) || value < 0) {
    showToast('Informe uma data e um valor válidos.', 'error');
    return;
  }
  const valueCents = convertInputAmountToBaseCents(value, date, existing);
  const fxSnapshot = currencySnapshot(value, date, existing);
  if (valueCents === null || !fxSnapshot) {
    showToast(`Não há taxa de câmbio registrada para ${state.settings.currency} na data do saldo.`, 'error');
    return;
  }
  const record = {
    ...(existing || {}),
    id: id || createId(),
    date,
    value: valueCents / 100,
    valueCents,
    note: sanitizeHtml(note || 'Saldo inicial'),
    type: 'initialBalance',
    ...fxSnapshot,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  state.initialBalances = [record];
  saveState();
  closeModals();
  renderAllUI({ dashboard: true, reports: true, editor: true });
  showToast('Saldo inicial atualizado.', 'success');
}

function closeModals() {
  document.querySelectorAll('.modal.active').forEach((modal) => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-modal', 'false');
  });
  if (activeModalTrigger instanceof HTMLElement) activeModalTrigger.focus();
  activeModalTrigger = null;
}

/**
 * Trata submissão de formulário de transação
 * @function handleTransactionSubmit
 * @description Valida, sanitiza e salva/atualiza transação
 * @param {Event} event - Evento de submit do formulário
 * @returns {void}
 */
function handleTransactionSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('transactionModal').dataset.editId;
  const date = document.getElementById('transactionDate').value;
  const type = document.getElementById('transactionType').value;
  const category = document.getElementById('transactionCategory').value;
  const subcategory = document.getElementById('transactionSubcategory').value.trim();
  const value = Number(document.getElementById('transactionValue').value);
  const payment = document.getElementById('transactionPayment').value.trim();
  const status = document.getElementById('transactionStatus').value;
  const description = document.getElementById('transactionDescription').value.trim();
  const cofferOperation = dom.transactionCofferOperation?.value || '';
  const cofferId = dom.transactionCoffer?.value || '';
  const existing = id ? state.transactions.find((item) => item.id === id) : null;

  if (existing?.cofferOperation && !cofferOperation) {
    showToast('Uma operação vinculada deve permanecer vinculada a um cofrinho.', 'error');
    return;
  }
  if (!date || !description || !value || (!cofferOperation && type !== 'transfer' && !category)) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }
  if (!normalizeDate(date)) {
    showToast('Informe uma data válida.', 'error');
    return;
  }
  if (date > dateKey(new Date()) && status === 'paid') {
    showToast('Data não pode estar no futuro.', 'error');
    return;
  }
  if (!['paid', 'pending', 'scheduled'].includes(status)) {
    showToast('Selecione um status válido.', 'error');
    return;
  }
  if (!Number.isFinite(value) || value <= 0 || value > 999999.99) {
    showToast('Valor deve estar entre 0,01 e 999.999,99.', 'error');
    return;
  }
  if (description.length > 200) {
    showToast('Descrição deve ter no máximo 200 caracteres.', 'error');
    return;
  }
  if (subcategory && subcategory.length > 100) {
    showToast('Subcategoria deve ter no máximo 100 caracteres.', 'error');
    return;
  }
  if (payment && payment.length > 50) {
    showToast('Método de pagamento deve ter no máximo 50 caracteres.', 'error');
    return;
  }

  const operationTypes = {
    deposit: 'transfer',
    withdrawal: 'transfer',
    purchase: 'expense',
    yield: 'income'
  };
  const resolvedType = cofferOperation ? operationTypes[cofferOperation] : type;
  const needsCategory = resolvedType === 'income' || resolvedType === 'expense';
  if (!['income', 'expense', 'transfer'].includes(resolvedType)) {
    showToast('Tipo de lançamento inválido.', 'error');
    return;
  }
  if (needsCategory && !state.categories.find((cat) => cat.id === category)) {
    showToast('Categoria selecionada não existe.', 'error');
    return;
  }
  const categoryRecord = state.categories.find((item) => item.id === category);
  if (needsCategory && categoryRecord
    && categoryRecord.type !== 'both' && categoryRecord.type !== resolvedType) {
    showToast('A categoria não corresponde ao tipo de lançamento.', 'error');
    return;
  }

  const timestamp = new Date().toISOString();
  const safeDescription = description;
  const safeSubcategory = subcategory;
  const safePayment = payment;
  const valueCents = convertInputAmountToBaseCents(value, date, existing);
  const fxSnapshot = currencySnapshot(value, date, existing);
  if (valueCents === null || !fxSnapshot) {
    showToast(`Não há taxa de câmbio registrada para ${state.settings.currency} na data do lançamento.`, 'error');
    return;
  }
  let record;
  if (cofferOperation) {
    const coffer = state.coffers.find((item) => item.id === cofferId);
    if (!coffer) {
      showToast('Selecione um cofrinho válido.', 'error');
      return;
    }
    try {
      record = createCofferOperation({
        coffer,
        coffers: state.coffers,
        transactions: state.transactions.filter((item) => item.id !== id),
        operation: cofferOperation,
        amountCents: valueCents,
        date,
        status,
        id: id || createId(),
        description,
        category: needsCategory ? category : '',
        settings: state.cofferSettings
      });
    } catch (error) {
      showToast(`Operação não registrada: ${error.message}`, 'error');
      return;
    }
    record.subcategory = safeSubcategory;
    record.payment = safePayment || 'Cofrinho';
    Object.assign(record, fxSnapshot);
  } else {
    if (type === 'transfer') {
      showToast('Transferências devem estar vinculadas a um cofrinho.', 'error');
      return;
    }
    record = {
      ...(existing || {}),
      id: id || createId(),
      date,
      type: resolvedType,
      category,
      subcategory: safeSubcategory,
      value: valueCents / 100,
      valueCents,
      payment: safePayment,
      status,
      description: safeDescription,
      ...fxSnapshot
    };
  }
  record = {
    ...(existing || {}),
    ...record,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  if (id) {
    const index = state.transactions.findIndex((item) => item.id === id);
    if (index >= 0) state.transactions[index] = record;
    showToast('Lançamento atualizado com sucesso.', 'success');
  } else {
    state.transactions.push(record);
    showToast('Lançamento adicionado com sucesso.', 'success');
  }
  // PHASE 3: Usar função auxiliar para renderização consolidada
  calcCache.clear();
  saveState();
  closeModals();
  renderAllUI({ transactions: true, dashboard: true, reports: true, editor: true });
}

function openCategoryModal(category = null) {
  // PHASE 3: Usar funções auxiliares
  const modal = document.getElementById('categoryModal');
  activateModal(modal);
  const title = category ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('categoryModalTitle').textContent = title;
  
  setFormValues({
    categoryName: category?.name || '',
    categoryType: category?.type || 'expense',
    categoryIcon: category?.icon || '',
    categorySubcategories: category?.subcategories?.join(', ') || '',
    categoryLimit: category
      ? (convertBaseCentsToInputValue(
        Number.isSafeInteger(category.limitCents) ? category.limitCents : toCents(category.limit || 0)
      ) ?? 0)
      : 0
  });
  modal.dataset.editId = category?.id || '';
}

function handleCategorySubmit(event) {
  event.preventDefault();
  const id = document.getElementById('categoryModal').dataset.editId;
  const name = document.getElementById('categoryName').value.trim();
  const type = document.getElementById('categoryType').value;
  const icon = document.getElementById('categoryIcon').value.trim() || '📦';
  const subcategories = document.getElementById('categorySubcategories').value.split(',').map((item) => item.trim()).filter(Boolean);
  const limit = Number(document.getElementById('categoryLimit').value) || 0;
  const existing = id ? state.categories.find((item) => item.id === id) : null;

  if (existing?.preset) {
    showToast('Categorias padrão são protegidas contra edição.', 'error');
    return;
  }

  // PHASE 2: Validação Rigorosa
  if (!name) {
    showToast('Nome da categoria é obrigatório.', 'error');
    return;
  }

  // Validar nome (máx 50 caracteres, sem caracteres especiais)
  if (!validateInput('text', name)) {
    showToast('Nome inválido. Use apenas letras, números e espaços.', 'error');
    return;
  }

  if (name.length > 50) {
    showToast('Nome da categoria deve ter no máximo 50 caracteres.', 'error');
    return;
  }

  // Validar que categoria com mesmo nome não existe
  if (state.categories.some((cat) => cat.id !== id && cat.name.toLowerCase() === name.toLowerCase())) {
    showToast('Categoria com este nome já existe.', 'error');
    return;
  }

  // Validar type
  if (!['income', 'expense', 'both'].includes(type)) {
    showToast('Tipo de categoria inválido.', 'error');
    return;
  }

  // Validar subcategorias (máx 100 caracteres cada, máx 10 subcategorias)
  if (subcategories.length > 10) {
    showToast('Máximo 10 subcategorias permitidas.', 'error');
    return;
  }

  for (let sub of subcategories) {
    if (!validateInput('text', sub) || sub.length > 50) {
      showToast('Subcategoria inválida ou muito longa.', 'error');
      return;
    }
  }

  // Validar limite (numérico, não-negativo, máx 999.999,99)
  if (!validateInput('currency', limit.toString())) {
    showToast('Limite deve ser numérico (máx: 999.999,99).', 'error');
    return;
  }

  if (limit < 0 || limit > 999999.99) {
    showToast('Limite deve estar entre 0 e 999.999,99.', 'error');
    return;
  }
  const limitCents = limit === 0 ? 0 : convertInputAmountToBaseCents(limit);
  if (limitCents === null) {
    showToast(`Cadastre uma taxa de câmbio válida para ${state.settings.currency}.`, 'error');
    return;
  }

  // Validar icon (máx 2 caracteres emoji ou símbolo)
  if (Array.from(icon).length > 8 || /[<>]/.test(icon)) {
    showToast('Ícone deve ser um emoji ou símbolo curto.', 'error');
    return;
  }

  // Sanitizar nome
  const safeName = sanitizeHtml(name);
  const safeSubcategories = subcategories.map(sub => sanitizeHtml(sub));

  const timestamp = new Date().toISOString();
  const record = {
    ...(existing || {}),
    id: id || createId(),
    name: safeName,
    type,
    icon,
    subcategories: safeSubcategories,
    limit: fromCents(limitCents),
    limitCents,
    preset: false,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  if (id) {
    const index = state.categories.findIndex((item) => item.id === id);
    if (index >= 0) state.categories[index] = record;
    showToast('Categoria atualizada.', 'success');
  } else {
    state.categories.push(record);
    showToast('Categoria adicionada.', 'success');
  }
  // PHASE 3: Usar função auxiliar para renderização consolidada
  calcCache.clear();
  saveState();
  closeAndRender({ transactions: true, categories: true, limits: true, reports: true, editor: true });
}

function openFixedModal(item = null) {
  // PHASE 3: Usar funções auxiliares
  const modal = document.getElementById('fixedModal');
  activateModal(modal);
  const title = item ? 'Editar gasto' : 'Novo gasto';
  document.getElementById('fixedModalTitle').textContent = title;
  
  const categoryId = item?.category || state.fixedExpenses[0]?.category || state.categories.find((cat)=>cat.type==='expense')?.id || '';
  setFormValues({
    fixedDescription: item?.description || '',
    fixedCategory: categoryId,
    fixedValue: item ? fromCents(item.valueCents || toCents(item.value)) : '',
    fixedDay: item?.day || 1,
    fixedType: item?.type || 'fixed',
    fixedDuration: item?.duration || '',
    fixedActive: item ? (item.active ? 'true' : 'false') : 'true'
  });
  modal.dataset.editId = item?.id || '';
  
  // Show/hide duration field based on type
  toggleDurationField();
}

function toggleDurationField() {
  const typeSelect = document.getElementById('fixedType');
  const durationLabel = document.getElementById('durationLabelWrapper');
  if (typeSelect.value === 'variable') {
    durationLabel.style.display = 'block';
    document.getElementById('fixedDuration').required = true;
  } else {
    durationLabel.style.display = 'none';
    document.getElementById('fixedDuration').required = false;
    document.getElementById('fixedDuration').value = '';
  }
}

function handleFixedSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('fixedModal').dataset.editId;
  const description = document.getElementById('fixedDescription').value.trim();
  const category = document.getElementById('fixedCategory').value;
  const value = Number(document.getElementById('fixedValue').value);
  const day = Number(document.getElementById('fixedDay').value);
  const type = document.getElementById('fixedType').value;
  const duration = type === 'variable' ? Number(document.getElementById('fixedDuration').value) : null;
  const active = document.getElementById('fixedActive').value === 'true';
  const existing = id ? state.fixedExpenses.find((item) => item.id === id) : null;
  const startMonth = resolveFixedExpenseStartMonth(type, existing);

  // PHASE 2: Validação Rigorosa
  if (!description || !category || !value || !day) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  // Validar descrição (máx 200 caracteres, sem XSS)
  if (!validateInput('text', description)) {
    showToast('Descrição contém caracteres inválidos.', 'error');
    return;
  }

  if (description.length > 200) {
    showToast('Descrição deve ter no máximo 200 caracteres.', 'error');
    return;
  }

  // Validar valor (numérico, positivo, máx 999.999,99)
  if (!validateInput('currency', value.toString())) {
    showToast('Valor deve ser numérico e positivo (máx: 999.999,99).', 'error');
    return;
  }

  if (value <= 0 || value > 999999.99) {
    showToast('Valor deve estar entre 0,01 e 999.999,99.', 'error');
    return;
  }

  // Validar dia (1-28)
  if (!validateInput('day', day.toString())) {
    showToast('Dia deve estar entre 1 e 28.', 'error');
    return;
  }

  // Validar type
  if (!['fixed', 'variable'].includes(type)) {
    showToast('Tipo de gasto inválido.', 'error');
    return;
  }

  // Validar tipo variável com duração
  if (type === 'variable') {
    if (!duration || !validateInput('number', duration.toString())) {
      showToast('Duração deve ser um número válido.', 'error');
      return;
    }

    if (duration < 1 || duration > 36) {
      showToast('Duração deve estar entre 1 e 36 meses.', 'error');
      return;
    }
  }

  // Validar que categoria existe
  if (!state.categories.find(cat => cat.id === category)) {
    showToast('Categoria selecionada não existe.', 'error');
    return;
  }

  // Sanitizar descrição
  const safeDescription = sanitizeHtml(description);

  const record = {
    ...(existing || {}),
    id: id || createId(),
    description: safeDescription,
    category,
    value,
    valueCents: toCents(value),
    day,
    active,
    type,
    duration,
    startMonth,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };
  if (id) {
    const index = state.fixedExpenses.findIndex((item) => item.id === id);
    if (index >= 0) state.fixedExpenses[index] = record;
    showToast('Gasto atualizado.', 'success');
  } else {
    state.fixedExpenses.push(record);
    showToast('Gasto adicionado.', 'success');
  }
  saveState();
  closeModals();
  renderAllUI({ fixed: true, editor: true });
}

function handleTableActions(event) {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const id = action.dataset.id;
  const type = action.dataset.action;
  if (type === 'delete-fx-rate') {
    const rate = state.fxRates.find((item) => item.id === id);
    if (!rate) return;
    state.fxRates = state.fxRates.filter((item) => item.id !== id);
    if (state.settings.currency === rate.currency
      && !getExchangeRate(state.fxRates, rate.currency, dateKey(new Date()), state.settings.baseCurrency || BASE_CURRENCY)) {
      state.settings.currency = state.settings.baseCurrency || BASE_CURRENCY;
    }
    saveState();
    renderFxRates();
    renderAllUI();
    updateCurrencyValueLabel();
    updateRawEditor();
    showToast('Taxa removida; valores armazenados permaneceram inalterados.', 'success');
    return;
  }
  if (type === 'restore-trash') {
    restoreTrashItem(id);
    return;
  }
  if (type === 'load-scenario' || type === 'delete-scenario') {
    const index = Number(action.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    if (type === 'load-scenario') loadScenario(index);
    else deleteScenario(index);
    return;
  }
  if (type === 'edit-coffer') {
    const coffer = state.coffers.find((item) => item.id === id);
    if (coffer) openCofferModal(coffer);
    return;
  }
  const cofferOperations = {
    'coffer-deposit': 'deposit',
    'coffer-withdrawal': 'withdrawal',
    'coffer-purchase': 'purchase',
    'coffer-yield': 'yield'
  };
  if (cofferOperations[type]) {
    openTransactionModal(null, { cofferId: id, operation: cofferOperations[type] });
    return;
  }
  if (type === 'simulate-coffer-yield') {
    simulateAndRecordCofferYield(id);
    return;
  }
  if (type === 'delete-coffer') {
    deleteCoffer(id);
    return;
  }
  if (type === 'edit') {
    const transaction = state.transactions.find((item) => item.id === id);
    if (transaction?.cofferOperation === 'opening') {
      showToast('Saldo de abertura é um registro imutável; ajuste o cofrinho ou remova-o se não houver movimentações.', 'warning');
      return;
    }
    if (transaction) openTransactionModal(transaction);
    return;
  }
  if (type === 'delete') {
    showDangerConfirmModal(
      'Excluir lançamento',
      'Deseja mover este lançamento para a lixeira?',
      'EXCLUIR',
      () => {
        const transaction = state.transactions.find((item) => item.id === id);
        if (transaction) {
          trashBin.moveToTrash('transaction', transaction);
          state.transactions = state.transactions.filter((item) => item.id !== id);
          saveState();
          renderTransactionTable();
          renderDashboard();
          renderReportPage();
          updateRawEditor();
          renderTrashStatus();
          showToast('Lançamento movido para a lixeira.', 'success');
        }
      }
    );
    return;
  }
  if (type === 'edit-category') {
    const category = state.categories.find((item) => item.id === id);
    if (category) openCategoryModal(category);
    return;
  }
  if (type === 'delete-category') {
    const category = state.categories.find((item) => item.id === id);
    if (category?.preset) {
      showToast('Categorias padrão são protegidas contra exclusão.', 'error');
      return;
    }
    const isReferenced = state.transactions.some((item) => item.category === id)
      || state.fixedExpenses.some((item) => item.category === id);
    if (isReferenced) {
      showToast('Categoria vinculada a lançamentos ou gastos fixos. Reclassifique esses itens antes de excluir.', 'warning');
      return;
    }
    showDangerConfirmModal(
      'Excluir categoria',
      'Esta categoria pode estar vinculada a lançamentos existentes.',
      'EXCLUIR',
      () => {
        const category = state.categories.find((item) => item.id === id);
        if (category && !state.transactions.some((item) => item.category === id)
          && !state.fixedExpenses.some((item) => item.category === id)) {
          trashBin.moveToTrash('category', category);
          state.categories = state.categories.filter((item) => item.id !== id);
          saveState();
          rebuildCategoryDropdowns();
          renderCategoryTable();
          renderLimitsTable();
          updateRawEditor();
          renderTrashStatus();
          showToast('Categoria movida para a lixeira.', 'success');
        }
      }
    );
    return;
  }
  if (type === 'edit-fixed') {
    const fixed = state.fixedExpenses.find((item) => item.id === id);
    if (fixed) openFixedModal(fixed);
    return;
  }
  if (type === 'delete-fixed') {
    showDangerConfirmModal(
      'Excluir gasto fixo',
      'Deseja mover este gasto fixo para a lixeira?',
      'EXCLUIR',
      () => {
        const fixed = state.fixedExpenses.find((item) => item.id === id);
        if (fixed) {
          trashBin.moveToTrash('fixedExpense', fixed);
          state.fixedExpenses = state.fixedExpenses.filter((item) => item.id !== id);
          saveState();
          renderFixedTable();
          updateRawEditor();
          renderTrashStatus();
          showToast('Gasto fixo movido para a lixeira.', 'success');
        }
      }
    );
    return;
  }
}

function applyFixedExpenses() {
  const now = new Date();
  const occurrences = createMissingFixedExpenseOccurrences(
    state.fixedExpenses,
    state.transactions,
    now,
    createId
  );
  state.transactions.push(...occurrences);
  
  saveState();
  renderTransactionTable();
  renderDashboard();
  renderReportPage();
  updateRawEditor();
  showToast(`${occurrences.length} gastos lançados para o mês atual.`, 'success');
}

function exportReport(format) {
  const year = dom.reportYear.value === 'all' ? null : Number(dom.reportYear.value);
  const filteredTransactions = state.transactions.filter((item) => periodMatches(item.date, year));
  
  if (filteredTransactions.length === 0) {
    showToast('Nenhuma transação encontrada para este período.', 'warning');
    return;
  }

  if (format === 'csv') {
    exportManager.exportToExcel(year);
    return;
  }

  if (format === 'pdf') {
    exportManager.downloadPDF(year);
    return;
  }
}

function clearAllData() {
  performAutomaticBackup();
  setTimeout(() => {
    showDangerConfirmModal(
      '⚠️ Deletar TODOS os dados?',
      'Esta ação deletará permanentemente TODOS os seus dados: lançamentos, categorias, gastos fixos e configurações. Esta ação NÃO PODE SER DESFEITA!',
      'DELETAR TODOS OS DADOS',
      () => {
        window.localStorage.removeItem(STORAGE_KEY);
        loadState();
        applyTheme();
        populateSelects();
        renderDashboard();
        renderTransactionTable();
        renderCategoryTable();
        renderFixedTable();
        renderReportPage();
        renderLimitsTable();
        updateRawEditor();
        showToast('⚠️ Todos os dados foram permanentemente deletados.', 'warning');
      }
    );
  }, 1500);
}

function clearAllTransactions() {
  performAutomaticBackup();
  setTimeout(() => {
    showDangerConfirmModal(
      '⚠️ Deletar TODOS os lançamentos?',
      'Esta ação deletará permanentemente TODOS os seus lançamentos. Categorias, gastos fixos e configurações serão mantidos, mas todos os registros de moedas serão perdidos. Esta ação NÃO PODE SER DESFEITA!',
      'EXCLUIR TODOS OS LANÇAMENTOS',
      () => {
        state.transactions = [];
        saveState();
        populateSelects();
        renderDashboard();
        renderTransactionTable();
        renderReportPage();
        updateRawEditor();
        showToast('⚠️ Todos os lançamentos foram permanentemente excluídos.', 'warning');
      }
    );
  }, 1500);
}

function backupData() {
  downloadBackupSnapshot(JSON.parse(JSON.stringify(state)), 'LuminaFin-backup.json');
  showToast('Backup exportado com sucesso.', 'success');
}

function updateThemeColor() {
  state.settings.colors.background = dom.themeBg.value;
  state.settings.colors.header = dom.themeHeader.value;
  state.settings.colors.card = dom.themeCard.value;
  state.settings.colors.accent = dom.themeAccent.value;
  applyTheme();
}

function toggleThemeMode() {
  state.settings.themeMode = dom.themeToggle.checked ? 'dark' : 'light';
  applyTheme();
  saveState();
}

function saveThemeSettings() {
  saveState();
  showToast('Tema salvo nas configurações.', 'success');
}

function applyRawJson() {
  try {
    const parsed = JSON.parse(dom.rawDataEditor.value);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
    const candidate = migrateState(parsed.state || parsed);
    const issues = validateStateShape(candidate);
    if (issues.length > 0) throw new Error(issues.slice(0, 3).join('; '));
    performAutomaticBackup();
    state = candidate;
    saveState();
    applyTheme();
    populateSelects();
    renderDashboard();
    renderTransactionTable();
    renderCategoryTable();
    renderFixedTable();
    renderReportPage();
    renderLimitsTable();
    updateRawEditor();
    showToast('JSON aplicado com sucesso.', 'success');
  } catch (error) {
    console.error(error);
    showToast(`JSON não aplicado: ${error.message}`, 'error');
  }
}

function clearPersonalizedCategories() {
  const customCount = state.categories.filter((cat) => !cat.preset).length;
  if (customCount === 0) {
    showToast('Não há categorias personalizadas para deletar.', 'info');
    return;
  }
  performAutomaticBackup();
  setTimeout(() => {
    showDangerConfirmModal(
      '⚠️ Deletar categorias personalizadas?',
      `Você tem ${customCount} categoria(s) personalizada(s). Esta ação as deletará permanentemente, mas as categorias padrão serão mantidas. Esta ação NÃO PODE SER DESFEITA!`,
      'DELETAR CATEGORIAS PERSONALIZADAS',
      () => {
        state.categories = state.categories.filter((cat) => cat.preset);
        saveState();
        rebuildCategoryDropdowns();
        renderCategoryTable();
        renderLimitsTable();
        updateRawEditor();
        showToast('✓ Categorias personalizadas deletadas.', 'success');
      }
    );
  }, 1500);
}

function clearFixedExpenses() {
  if (state.fixedExpenses.length === 0) {
    showToast('Não há gastos fixos para deletar.', 'info');
    return;
  }
  performAutomaticBackup();
  setTimeout(() => {
    showDangerConfirmModal(
      '⚠️ Deletar todos os gastos fixos?',
      `Você tem ${state.fixedExpenses.length} gasto(s) fixo(s). Esta ação os deletará permanentemente. Lançamentos já criados não serão afetados. Esta ação NÃO PODE SER DESFEITA!`,
      'DELETAR GASTOS FIXOS',
      () => {
        state.fixedExpenses = [];
        saveState();
        renderFixedTable();
        updateRawEditor();
        showToast('✓ Todos os gastos fixos foram deletados.', 'success');
      }
    );
  }, 1500);
}

// ==================== NOVAS FUNCIONALIDADES: CENÁRIOS, METAS E ANÁLISE DE RISCO ====================

// Sistema de abas nos relatórios
function initReportTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons[0]?.parentElement?.setAttribute('role', 'tablist');
  tabButtons.forEach((button, index) => {
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.tabIndex = index === 0 ? 0 : -1;
    const tabId = button.dataset.tab;
    button.setAttribute('aria-controls', `${tabId}-tab`);
  });
  tabContents.forEach((content, index) => {
    content.setAttribute('role', 'tabpanel');
    content.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
    content.tabIndex = 0;
  });

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectReportTab(button, tabButtons, tabContents);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Array.from(tabButtons).indexOf(button);
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? tabButtons.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
      const next = tabButtons[nextIndex];
      selectReportTab(next, tabButtons, tabContents);
      next.focus();
    });
  });
}

function selectReportTab(button, tabButtons, tabContents) {
  const selectedTabId = button.dataset.tab;
  tabButtons.forEach((tab) => {
    const selected = tab === button;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  tabContents.forEach((panel) => {
    const selected = panel.id === `${selectedTabId}-tab`;
    panel.classList.toggle('active', selected);
    panel.setAttribute('aria-hidden', String(!selected));
  });
}

// Renderizar cenários salvos
function renderSavedScenarios() {
  const container = dom.savedScenarios;
  if (!container) return;

  if (state.scenarios.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 2rem;">Nenhum cenário salvo ainda.</div>';
    return;
  }

  container.innerHTML = state.scenarios.map((scenario, index) => `
    <div class="scenario-item">
      <h5>${sanitizeHtml(scenario.name)}</h5>
      <p>${sanitizeHtml(scenario.description)}</p>
      <div class="scenario-actions">
        <button type="button" class="secondary-button" data-action="load-scenario" data-index="${index}">Carregar</button>
        <button type="button" class="danger-button" data-action="delete-scenario" data-index="${index}">Excluir</button>
      </div>
    </div>
  `).join('');
}

// Salvar cenário atual
function saveCurrentScenario() {
  const name = dom.scenarioName.value.trim();
  const description = dom.scenarioDescription.value.trim();

  if (!name) {
    showToast('Nome do cenário é obrigatório.', 'error');
    return;
  }

  const scenario = {
    name,
    description,
    date: new Date().toISOString(),
    data: {
      transactions: [...state.transactions],
      fixedExpenses: [...state.fixedExpenses],
      categories: [...state.categories],
      settings: { ...state.settings }
    }
  };

  state.scenarios.push(scenario);
  saveState();

  dom.scenarioName.value = '';
  dom.scenarioDescription.value = '';

  renderSavedScenarios();
  showToast('Cenário salvo com sucesso!', 'success');
}

// Carregar cenário
function loadScenario(index) {
  const scenario = state.scenarios[index];
  if (!scenario) return;

  showDangerConfirmModal(
    'Carregar cenário',
    `Carregar o cenário "${sanitizeHtml(scenario.name)}" substituirá os dados atuais.`,
    'CARREGAR',
    () => {
      state.transactions = [...scenario.data.transactions];
      state.fixedExpenses = [...scenario.data.fixedExpenses];
      state.categories = [...scenario.data.categories];
      state.settings = { ...scenario.data.settings };
      saveState();
      applyTheme();
      rebuildCategoryDropdowns();
      renderDashboard();
      renderTransactionTable();
      renderCategoryTable();
      renderFixedTable();
      renderReportPage();
      showToast(`Cenário "${sanitizeHtml(scenario.name)}" carregado!`, 'success');
    }
  );
}

// Excluir cenário
function deleteScenario(index) {
  showDangerConfirmModal(
    'Excluir cenário',
    'Excluir este cenário permanentemente?',
    'EXCLUIR',
    () => {
      state.scenarios.splice(index, 1);
      saveState();
      renderSavedScenarios();
      showToast('Cenário excluído.', 'success');
    }
  );
}

// Sistema de metas de poupança
function setSavingsGoal() {
  const monthlyGoal = parseFloat(dom.monthlySavingsGoal.value);
  const deadline = parseInt(dom.goalDeadline.value);

  if (!monthlyGoal || monthlyGoal <= 0) {
    showToast('Meta mensal deve ser maior que zero.', 'error');
    return;
  }

  const goal = {
    id: createId(),
    monthlyGoal,
    deadline,
    startDate: new Date().toISOString(),
    currentProgress: 0
  };

  state.savingsGoals = [goal];
  saveState();

  dom.monthlySavingsGoal.value = '';
  dom.goalDeadline.value = 12;

  renderSavingsGoalProgress();
  showToast('Meta de poupança definida!', 'success');
}

function renderSavingsGoalProgress() {
  const container = dom.savingsGoalProgress;
  if (!container) return;

  if (state.savingsGoals.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 2rem;">Nenhuma meta definida.</div>';
    return;
  }

  const goal = state.savingsGoals[0];
  const monthsElapsed = Math.floor((new Date() - new Date(goal.startDate)) / (1000 * 60 * 60 * 24 * 30));
  const targetAmount = goal.monthlyGoal * goal.deadline;
  const currentSavings = calculateCurrentSavings();

  const progressPercent = Math.min(100, (currentSavings / targetAmount) * 100);
  const remainingMonths = Math.max(0, goal.deadline - monthsElapsed);
  const monthlyNeeded = remainingMonths > 0 ? (targetAmount - currentSavings) / remainingMonths : 0;

  container.innerHTML = `
    <div style="background: rgba(31, 41, 55, 0.5); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h4 style="margin: 0; color: var(--accent);">🎯 Progresso da Meta</h4>
        <span style="font-size: 0.9rem; color: var(--muted);">${monthsElapsed}/${goal.deadline} meses</span>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
        <div>
          <div style="font-size: 0.8rem; color: var(--muted);">Meta mensal</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--accent);">${formatCurrency(goal.monthlyGoal)}</div>
        </div>
        <div>
          <div style="font-size: 0.8rem; color: var(--muted);">Valor guardado</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--success);">${formatCurrency(currentSavings)}</div>
        </div>
        <div>
          <div style="font-size: 0.8rem; color: var(--muted);">Meta total</div>
          <div style="font-size: 1.1rem; font-weight: 600;">${formatCurrency(targetAmount)}</div>
        </div>
        <div>
          <div style="font-size: 0.8rem; color: var(--muted);">Precisa por mês</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: ${monthlyNeeded > goal.monthlyGoal ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(monthlyNeeded)}</div>
        </div>
      </div>

      ${progressPercent >= 100 ? '<div class="alert-banner alert-success" style="margin-top: 1rem;"><i class="fa-solid fa-trophy"></i> Parabéns! Meta atingida! 🎉</div>' : ''}
    </div>
  `;
}

function calculateCurrentSavings() {
  // Calcular poupança baseada em saldo positivo acumulado nos últimos meses
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  let totalSavings = 0;
  for (let month = 1; month <= currentMonth; month++) {
    const monthlyBalance = calculateMonthlyBalance(currentYear, month);
    if (monthlyBalance > 0) {
      totalSavings += monthlyBalance;
    }
  }

  return totalSavings;
}

// Análise de risco financeiro
function renderRiskAnalysis() {
  const currentBalance = calculateCurrentBalance();
  const avgMonthlyIncome = calculateAverageMonthlyIncome();
  const avgMonthlyExpense = calculateAverageMonthlyExpense();
  const monthlyNet = avgMonthlyIncome - avgMonthlyExpense;

  // Análise de saúde financeira
  const emergencyFundNeeded = avgMonthlyExpense * 3;
  const emergencyGap = Math.max(0, emergencyFundNeeded - currentBalance);
  const hasEmergencyFund = currentBalance >= emergencyFundNeeded;
  
  // Cenário: 20% aumento nos gastos
  const expenseIncrease20 = avgMonthlyIncome - (avgMonthlyExpense * 1.2);
  const expenseIncrease20Balance = currentBalance + (expenseIncrease20 * 6);
  const expenseIncrease20Impact = avgMonthlyExpense * 0.2;
  
  // Cenário: 15% redução na renda
  const incomeReduction15 = (avgMonthlyIncome * 0.85) - avgMonthlyExpense;
  const incomeReduction15Balance = currentBalance + (incomeReduction15 * 6);
  const incomeReduction15Impact = avgMonthlyIncome * 0.15;
  
  // Cenário: Pior caso (redução de 10% renda + aumento de 10% gastos)
  const worstCaseMonthly = (avgMonthlyIncome * 0.9) - (avgMonthlyExpense * 1.1);
  const worstCaseBalance = currentBalance + (worstCaseMonthly * 6);

  // Preenchimento dos elementos
  dom.emergencyFund3Months.textContent = formatCurrency(emergencyFundNeeded);
  dom.expenseIncrease20Percent.textContent = formatCurrency(expenseIncrease20);
  dom.incomeReduction15Percent.textContent = formatCurrency(incomeReduction15);

  // Criar análise visual elaborada
  const analysisContainer = document.getElementById('riskAnalysisDetails');
  if (analysisContainer) {
    const emerStatus = hasEmergencyFund ? 'Adequado' : 'Insuficiente';
    const emerColor = hasEmergencyFund ? '#22c55e' : '#ef4444';
    const exp20Color = expenseIncrease20 >= 0 ? '#22c55e' : '#ef4444';
    const inc15Color = incomeReduction15 >= 0 ? '#22c55e' : '#ef4444';
    const exp20Health = expenseIncrease20 >= 0 ? 'Sustentável' : 'Crítica';
    const inc15Months = incomeReduction15 >= 0 ? 'Indefinido' : Math.ceil(currentBalance / Math.abs(incomeReduction15));
    const worstCaseColor = worstCaseMonthly >= 0 ? '#22c55e' : '#ef4444';
    const worstCaseRisk = worstCaseMonthly < 0 ? 'ALTO' : 'BAIXO';
    const worstCaseEmoji = worstCaseMonthly < -1000 ? '🔴' : worstCaseMonthly < 0 ? '🟡' : '🟢';
    const worstCaseLevel = worstCaseMonthly < -1000 ? 'Risco crítico' : worstCaseMonthly < 0 ? 'Risco moderado' : 'Risco baixo';
    const daysCoverage = (currentBalance / avgMonthlyExpense * 30).toFixed(0);
    const emergencyMsg = hasEmergencyFund ? 'Fundo de emergência adequado' : `Acumule ${formatCurrency(emergencyGap)} para fundo`;
    const emergencyEmoji = hasEmergencyFund ? '✅' : '⚠️';

    analysisContainer.innerHTML = `
      <div style=\"margin-top: 1.5rem;\">
        <h4 style=\"margin-bottom: 1rem; color: var(--accent);\">Análise Detalhada de Cenários</h4>
        
        <div style=\"display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;\">
          <div style=\"background: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 1rem; border-radius: 8px;\">
            <div style=\"color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;\">Cenário Atual</div>
            <div style=\"font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;\">Saldo: <span style=\"color: ${currentBalance >= 0 ? '#22c55e' : '#ef4444'};\">${formatCurrency(currentBalance)}</span></div>
            <div style=\"font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;\">Fluxo mensal: <span style=\"color: ${monthlyNet >= 0 ? '#22c55e' : '#ef4444'};\">${formatCurrency(monthlyNet)}</span></div>
            <div style=\"font-size: 0.85rem; color: #cbd5e1;\">Fundo emergência: <span style=\"font-weight: 600; color: ${emerColor};\">${emerStatus}</span></div>
            <div style=\"margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;\">
              <span style=\"color: #94a3b8;\">Cobertura:</span> <span style=\"font-weight: 600; color: #f59e0b;\">${daysCoverage} dias</span>
            </div>
          </div>
          
          <div style=\"background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 1rem; border-radius: 8px;\">
            <div style=\"color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;\">+20% nos Gastos</div>
            <div style=\"font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;\">Fluxo: <span style=\"color: ${exp20Color};\">${formatCurrency(expenseIncrease20)}</span></div>
            <div style=\"font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;\">Impacto: <span style=\"color: #ef4444;\">-${formatCurrency(expenseIncrease20Impact)}</span>/mês</div>
            <div style=\"font-size: 0.85rem; color: #cbd5e1;\">Saldo 6 meses: <span style=\"font-weight: 600; color: ${expenseIncrease20Balance >= 0 ? '#22c55e' : '#ef4444'};\">${formatCurrency(expenseIncrease20Balance)}</span></div>
            <div style=\"margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;\">
              <span style=\"color: #94a3b8;\">Status:</span> <span style=\"font-weight: 600; color: ${exp20Color};\">${exp20Health}</span>
            </div>
          </div>
          
          <div style=\"background: rgba(239, 68, 68, 0.1); border-left: 4px solid #dc2626; padding: 1rem; border-radius: 8px;\">
            <div style=\"color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;\">-15% na Renda</div>
            <div style=\"font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;\">Fluxo: <span style=\"color: ${inc15Color};\">${formatCurrency(incomeReduction15)}</span></div>
            <div style=\"font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;\">Impacto: <span style=\"color: #ef4444;\">-${formatCurrency(incomeReduction15Impact)}</span>/mês</div>
            <div style=\"font-size: 0.85rem; color: #cbd5e1;\">Saldo 6 meses: <span style=\"font-weight: 600; color: ${incomeReduction15Balance >= 0 ? '#22c55e' : '#ef4444'};\">${formatCurrency(incomeReduction15Balance)}</span></div>
            <div style=\"margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;\">
              <span style=\"color: #94a3b8;\">Crise em:</span> <span style=\"font-weight: 600; color: ${inc15Color};\">${inc15Months}</span>
            </div>
          </div>
          
          <div style=\"background: rgba(107, 114, 128, 0.2); border-left: 4px solid #6b7280; padding: 1rem; border-radius: 8px;\">
            <div style=\"color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;\">Pior Caso (-10% renda, +10% despesa)</div>
            <div style=\"font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;\">Fluxo: <span style=\"color: ${worstCaseColor};\">${formatCurrency(worstCaseMonthly)}</span></div>
            <div style=\"font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;\">Risco: <span style=\"color: ${worstCaseColor}; font-weight: 600;\">${worstCaseRisk}</span></div>
            <div style=\"font-size: 0.85rem; color: #cbd5e1;\">Saldo 6 meses: <span style=\"font-weight: 600; color: ${worstCaseBalance >= 0 ? '#f59e0b' : '#ef4444'};\">${formatCurrency(worstCaseBalance)}</span></div>
            <div style=\"margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;\">
              <span style=\"color: #94a3b8;\">${worstCaseEmoji} ${worstCaseLevel}</span>
            </div>
          </div>
        </div>
        
        <div style=\"background: rgba(100, 116, 139, 0.1); padding: 1rem; border-radius: 8px;\">
          <div style=\"color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.75rem;\">Recomendações Estratégicas</div>
          <div style=\"display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem;\">
            <div>${emergencyEmoji} ${emergencyMsg}</div>
            <div>${expenseIncrease20 >= 0 ? '✅ Resiste a aumentos moderados' : '❌ Reduza gastos ou aumente renda'}</div>
            <div>${monthlyNet > 0 ? '✅ Superávit de ' + formatCurrency(monthlyNet) + '/mês' : '🚨 Déficit de ' + formatCurrency(Math.abs(monthlyNet)) + '/mês'}</div>
            <div>${currentBalance >= emergencyFundNeeded * 0.5 ? '✅ Situação estável' : '⚠️ Reforce reserva'}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Adicionar indicadores visuais de risco
  updateRiskIndicators(currentBalance, emergencyFundNeeded, expenseIncrease20, incomeReduction15);
}

function updateRiskIndicators(balance, emergencyFund, expenseScenario, incomeScenario) {
  // Indicadores de risco baseados nos cálculos
  const riskElements = [
    { element: dom.emergencyFund3Months, value: balance, threshold: emergencyFund, type: 'fund' },
    { element: dom.expenseIncrease20Percent, value: expenseScenario, threshold: 0, type: 'balance' },
    { element: dom.incomeReduction15Percent, value: incomeScenario, threshold: 0, type: 'balance' }
  ];

  riskElements.forEach(({ element, value, threshold, type }) => {
    const parent = element.closest('.scenario-card');
    if (!parent) return;

    // Remove classes de risco anteriores
    parent.classList.remove('risk-low', 'risk-medium', 'risk-high');

    if (type === 'fund') {
      if (value >= threshold) {
        parent.classList.add('risk-low');
      } else if (value >= threshold * 0.5) {
        parent.classList.add('risk-medium');
      } else {
        parent.classList.add('risk-high');
      }
    } else {
      if (value >= 500) {
        parent.classList.add('risk-low');
      } else if (value >= 0) {
        parent.classList.add('risk-medium');
      } else {
        parent.classList.add('risk-high');
      }
    }
  });
}

// Alertas inteligentes
function checkSmartAlerts() {
  const alerts = [];

  // Verificar projeções negativas
  const projectionData = getProjectedBalanceTrend(6);
  const negativeMonths = projectionData.filter(item => item.balance < 0);

  if (negativeMonths.length > 0) {
    alerts.push({
      type: 'danger',
      message: `Projeção negativa detectada em ${negativeMonths.length} meses. Considere reduzir gastos.`,
      icon: '📉'
    });
  }

  // Verificar limites de categoria ultrapassados
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  let recordedBudgetAlert = false;

  state.categories.forEach(category => {
    const limitCents = Number.isSafeInteger(category.limitCents)
      ? category.limitCents
      : toCents(category.limit || 0);
    if (limitCents > 0) {
      const spentCents = state.transactions
        .filter(t => t.type === 'expense'
          && t.status === 'paid'
          && t.category === category.id
          && periodMatches(t.date, currentYear, currentMonth))
        .reduce((sum, t) => sum + (
          Number.isSafeInteger(t.valueCents) ? t.valueCents : toCents(t.value)
        ), 0);

      const usagePercent = (spentCents / limitCents) * 100;
      const level = usagePercent >= 100 ? 'exceeded' : usagePercent >= state.settings.notifyOnLimitReached ? 'near' : null;
      const alertId = level ? `in-app-budget:${currentYear}-${String(currentMonth).padStart(2, '0')}:${category.id}:${level}` : null;
      if (alertId && state.notifications.some((item) => item.id === alertId)) return;

      if (level === 'exceeded') {
        alerts.push({
          type: 'danger',
          message: `Limite da categoria "${category.name}" ultrapassado (${usagePercent.toFixed(0)}%).`,
          icon: '🚨'
        });
      } else if (level === 'near') {
        alerts.push({
          type: 'warning',
          message: `Categoria "${category.name}" atingiu ${usagePercent.toFixed(0)}% do limite.`,
          icon: '⚠️'
        });
      }
      if (alertId) {
        const timestamp = new Date().toISOString();
        state.notifications.push({
          id: alertId,
          type: 'budget-limit-in-app',
          categoryId: category.id,
          period: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
          level,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
          version: 1
        });
        recordedBudgetAlert = true;
      }
    }
  });
  if (recordedBudgetAlert) saveState();

  // Verificar baixo saldo
  const currentBalance = calculateCurrentBalance();
  const avgExpense = calculateAverageMonthlyExpense();

  if (currentBalance < avgExpense * 0.5) {
    alerts.push({
      type: 'warning',
      message: 'Saldo baixo detectado. Menos de 0.5x suas despesas médias.',
      icon: '💰'
    });
  }

  // Mostrar alertas
  displayAlerts(alerts);
}

function displayAlerts(alerts) {
  const container = document.getElementById('alertsContainer');
  if (!container) {
    // Criar container de alertas se não existir
    const alertsDiv = document.createElement('div');
    alertsDiv.id = 'alertsContainer';
    alertsDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; max-width: 400px;';
    document.body.appendChild(alertsDiv);
  }

  const alertsContainer = document.getElementById('alertsContainer');

  alerts.forEach((alert, index) => {
    setTimeout(() => {
      const alertElement = document.createElement('div');
      alertElement.className = `alert-banner alert-${alert.type}`;
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-exclamation-triangle';
      icon.setAttribute('aria-hidden', 'true');
      const message = document.createElement('span');
      message.textContent = `${alert.icon} ${alert.message}`;
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'alert-dismiss';
      dismiss.setAttribute('aria-label', 'Dispensar alerta');
      dismiss.textContent = '×';
      dismiss.addEventListener('click', () => alertElement.remove());
      alertElement.append(icon, message, dismiss);

      alertsContainer.appendChild(alertElement);

      // Auto-remover após 10 segundos
      setTimeout(() => {
        if (alertElement.parentElement) {
          alertElement.remove();
        }
      }, 10000);
    }, index * 500); // Delay para mostrar alertas sequencialmente
  });
}

// Análise de tendências históricas vs projeções
function renderTrendAnalysis() {
  const historicalData = getHistoricalBalanceTrend(12);
  const projectionData = getProjectedBalanceTrend(6);

  // Cálculos de tendência
  const firstBalance = historicalData.length > 0 ? historicalData[0].balance : 0;
  const lastBalance = historicalData.length > 0 ? historicalData[historicalData.length - 1].balance : 0;
  const growthAmount = lastBalance - firstBalance;
  const growthPercent = firstBalance !== 0 ? (growthAmount / Math.abs(firstBalance)) * 100 : 0;
  const avgMonthlyGrowth = growthAmount / Math.max(historicalData.length, 1);
  
  const finalProjectedBalance = projectionData.length > 0 ? projectionData[projectionData.length - 1].balance : lastBalance;
  const projectedGrowth = finalProjectedBalance - lastBalance;
  const projectedGrowthPercent = lastBalance !== 0 ? (projectedGrowth / Math.abs(lastBalance)) * 100 : 0;
  
  // Identificar picos e vales
  const maxBalance = Math.max(...historicalData.map(item => item.balance), lastBalance);
  const minBalance = Math.min(...historicalData.map(item => item.balance), lastBalance);
  const volatility = maxBalance - minBalance;
  
  // Verificar quando ficar negativo em projeção
  let negativeMonth = null;
  for (let i = 0; i < projectionData.length; i++) {
    if (projectionData[i].balance < 0) {
      negativeMonth = i + 1;
      break;
    }
  }
  
  // Tendência: melhorando ou piorando
  const recentMonths = historicalData.slice(-3);
  const recentAvg = recentMonths.length > 0 ? recentMonths.reduce((sum, item) => sum + item.balance, 0) / recentMonths.length : lastBalance;
  const trendDirection = lastBalance > recentAvg ? 'crescente' : lastBalance < recentAvg ? 'decrescente' : 'estável';
  const trendColor = lastBalance > recentAvg ? '#22c55e' : lastBalance < recentAvg ? '#ef4444' : '#f59e0b';

  // Criar gráfico comparativo
  const ctx = dom.chartSavingsGoal?.getContext('2d');
  if (ctx) {
    const combinedLabels = [];
    const combinedData = [];

    // Dados históricos
    historicalData.forEach(item => {
      combinedLabels.push(item.label);
      combinedData.push(item.balance);
    });

    // Dados projetados
    projectionData.forEach(item => {
      combinedLabels.push(`${item.month}/${item.year} (proj.)`);
      combinedData.push(item.balance);
    });

    charts.savingsGoal = renderChart(charts.savingsGoal, dom.chartSavingsGoal, {
      type: 'line',
      data: {
        labels: combinedLabels,
        datasets: [{
          label: 'Saldo Real',
          data: historicalData.map(item => item.balance),
          borderColor: 'rgba(56, 189, 248, 1)',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          tension: 0.4
        }, {
          label: 'Projeção',
          data: [...Array(historicalData.length).fill(null), ...projectionData.map(item => item.balance)],
          borderColor: 'rgba(245, 158, 11, 1)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderDash: [5, 5],
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#f8fafc' } },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
              }
            }
          }
        },
        scales: chartScaleOptions()
      }
    });
  }

  // Análise textual detalhada
  const analysisContainer = document.getElementById('trendAnalysisDetails');
  if (analysisContainer) {
    const volatilityLevel = volatility > lastBalance ? 'Alta' : volatility > lastBalance * 0.5 ? 'Moderada' : 'Baixa';
    const volatilityColor = volatility > lastBalance ? '#ef4444' : volatility > lastBalance * 0.5 ? '#f59e0b' : '#22c55e';
    const negativeWarning = negativeMonth ? `Em ${negativeMonth} mês(es)` : 'Não identificado';
    const negativeColor = negativeMonth ? '#ef4444' : '#22c55e';
    const firstHalf = historicalData.length > 0 ? historicalData[0].balance : 0;
    const secondHalf = historicalData.length > Math.floor(historicalData.length / 2) ? historicalData[Math.floor(historicalData.length / 2)].balance : 0;
    const isAccelerating = (lastBalance - secondHalf) > (secondHalf - firstHalf);

    const htmlContent = `
      <div style="margin-top: 1.5rem;">
        <h4 style="margin-bottom: 1rem; color: var(--accent);">Análise Detalhada de Tendências</h4>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 1rem; border-radius: 8px;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Posição Histórica</div>
            <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Saldo atual: <span style="color: ${lastBalance >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(lastBalance)}</span></div>
            <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;">Crescimento: <span style="color: ${growthAmount >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(growthAmount)} (${growthPercent.toFixed(1)}%)</span></div>
            <div style="font-size: 0.85rem; color: #cbd5e1;">Média mensal: ${formatCurrency(avgMonthlyGrowth)}</div>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;">
              <span style="color: #94a3b8;">Intervalo:</span> ${formatCurrency(minBalance)} até ${formatCurrency(maxBalance)}
            </div>
          </div>
          
          <div style="background: rgba(139, 92, 246, 0.1); border-left: 4px solid #a855f7; padding: 1rem; border-radius: 8px;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Tendência</div>
            <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Direção: <span style="color: ${trendColor};">${trendDirection}</span></div>
            <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;">Volatilidade: <span style="color: ${volatilityColor}; font-weight: 600;">${volatilityLevel}</span></div>
            <div style="font-size: 0.85rem; color: #cbd5e1;">Amplitude: ${formatCurrency(volatility)}</div>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;">
              <span style="color: #94a3b8;">Aceleração:</span> <span style="font-weight: 600;">${isAccelerating ? 'Acelerada' : 'Desacelerada'}</span>
            </div>
          </div>
          
          <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 1rem; border-radius: 8px;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Projeção 6 meses</div>
            <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Saldo final: <span style="color: ${finalProjectedBalance >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(finalProjectedBalance)}</span></div>
            <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem;">Evolução: <span style="color: ${projectedGrowth >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(projectedGrowth)} (${projectedGrowthPercent.toFixed(1)}%)</span></div>
            <div style="font-size: 0.85rem; color: #cbd5e1;">Por mês: ${formatCurrency(projectedGrowth / 6)}</div>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;">
              <span style="color: #94a3b8;">Ponto crítico:</span> <span style="font-weight: 600; color: ${negativeColor};">${negativeWarning}</span>
            </div>
          </div>
          
          <div style="background: rgba(100, 116, 139, 0.1); border-left: 4px solid #6b7280; padding: 1rem; border-radius: 8px;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Saúde Geral</div>
            <div style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 0.25rem;">Financeira: <span style="font-weight: 600; color: ${lastBalance > 0 ? '#22c55e' : '#ef4444'};">${lastBalance > 0 ? 'Positiva' : 'Crítica'}</span></div>
            <div style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 0.25rem;">Estabilidade: <span style="font-weight: 600;">${volatility < 1000 ? 'Boa' : '⚠️ Instável'}</span></div>
            <div style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 0.25rem;">Ritmo: <span style="font-weight: 600;">${Math.abs(avgMonthlyGrowth) > 500 ? 'Rápido' : 'Moderado'}</span></div>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.85rem;">
              <span style="font-weight: 600;">${lastBalance > 5000 ? '🟢' : lastBalance > 0 ? '🟡' : '🔴'} Status</span>
            </div>
          </div>
        </div>
        
        <div style="background: rgba(100, 116, 139, 0.1); padding: 1rem; border-radius: 8px;">
          <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.75rem;">Insights e Recomendações</div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem;">
            <div>${lastBalance > 0 ? '✅' : '🚨'} ${lastBalance > 0 ? 'Saldo positivo: Estrutura sáudável' : 'Saldo negativo: Ação urgente'}</div>
            <div>${avgMonthlyGrowth > 0 ? '📈' : '📉'} ${avgMonthlyGrowth > 0 ? 'Trajetória positiva' : 'Tendência negativa'}</div>
            <div>${volatility < 1000 ? '✅' : '⚠️'} ${volatility < 1000 ? 'Fluxo estável' : 'Fluxo volátil'}</div>
            <div>${projectedGrowth >= 0 ? '🎯' : '⚠️'} ${projectedGrowth >= 0 ? 'Projeção positiva' : 'Projeção negativa'}</div>
          </div>
        </div>
      </div>
    `;
    
    analysisContainer.innerHTML = htmlContent;
  }
}

// Funções auxiliares para cálculos
function calculateAverageMonthlyIncome() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const monthlyIncomes = [];
  for (let index = 0; index < 12; index += 1) {
    let month = currentMonth - index;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    monthlyIncomes.push(sumByPeriod(year, month, 'income'));
  }

  return monthlyIncomes.reduce((sum, item) => sum + item, 0) / monthlyIncomes.length;
}

function calculateAverageMonthlyExpense() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const monthlyExpenses = [];
  for (let index = 0; index < 12; index += 1) {
    let month = currentMonth - index;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    monthlyExpenses.push(sumByPeriod(year, month, 'expense'));
  }

  return monthlyExpenses.reduce((sum, item) => sum + item, 0) / monthlyExpenses.length;
}

function calculateMonthlyBalance(year, month) {
  const income = sumByPeriod(year, month, 'income');
  const expense = sumByPeriod(year, month, 'expense');
  return income - expense;
}

function getHistoricalBalanceTrend(months) {
  const data = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const balance = calculateMonthlyBalance(year, month);
    data.push({
      label: `${labelsMonths[month - 1].substring(0, 3)}/${year.toString().substring(2)}`,
      balance: balance,
      month,
      year
    });
  }

  return data;
}

function getProjectedBalanceTrend(months) {
  const data = [];
  const now = new Date();
  const avgIncome = calculateAverageMonthly('income', 3);
  const avgExpense = calculateAverageMonthly('expense', 3);
  const monthlyNet = avgIncome - avgExpense;
  let currentBalance = calculateCurrentBalance();

  for (let i = 1; i <= months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    currentBalance += monthlyNet;
    data.push({
      label: `${labelsMonths[month - 1].substring(0, 3)}/${year.toString().substring(2)}`,
      balance: currentBalance,
      month,
      year
    });
  }

  return data;
}

// Inicializar novas funcionalidades
function initNewFeatures() {
  initReportTabs();
  renderSavedScenarios();
  renderSavingsGoalProgress();
  renderRiskAnalysis();
  renderTrendAnalysis();
  checkSmartAlerts();

  // Vincular eventos
  dom.setSavingsGoal?.addEventListener('click', setSavingsGoal);
  dom.saveCurrentScenario?.addEventListener('click', saveCurrentScenario);
}

// ==================== GOALS FUNCTIONS ====================
function renderGoals() {
  const balanceCents = calculateCurrentBalance();
  const container = dom.goalsContainer;
  container.innerHTML = '';

  if (state.goals.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 2rem;">Nenhuma meta definida. Clique em "Adicionar Meta" para começar.</p>';
    return;
  }

  state.goals.forEach((goal, index) => {
    const targetCents = Number.isSafeInteger(goal.targetCents) ? goal.targetCents : toCents(goal.targetValue);
    const progress = targetCents > 0 ? Math.max(0, Math.min((balanceCents / targetCents) * 100, 100)) : 0;
    const currentValueCents = Math.max(0, Math.min(balanceCents, targetCents));
    const safeColor = /^#[0-9a-f]{6}$/i.test(goal.color || '') ? goal.color : '#38bdf8';

    const goalElement = document.createElement('div');
    goalElement.className = 'goal-item';
    goalElement.innerHTML = `
      <div class="goal-header">
        <h5 class="goal-title">${sanitizeHtml(goal.name)}</h5>
        <div class="goal-actions">
          <button class="edit-goal" data-index="${index}" title="Editar meta" aria-label="Editar meta ${sanitizeHtml(goal.name)}">
            <i class="fa-solid fa-edit"></i>
          </button>
          <button class="delete-goal" data-index="${index}" title="Excluir meta" aria-label="Excluir meta ${sanitizeHtml(goal.name)}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width: ${progress}%; background-color: ${safeColor};"></div>
      </div>
      <div class="goal-progress-text">
        <span>${formatCurrencyFromCents(currentValueCents)}</span>
        <span>${formatCurrencyFromCents(targetCents)}</span>
      </div>
    `;

    container.appendChild(goalElement);
  });

  // Attach event listeners
  container.querySelectorAll('.edit-goal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      editGoal(index);
    });
  });

  container.querySelectorAll('.delete-goal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      deleteGoal(index);
    });
  });
}

function openGoalModal(goal = null, index = -1) {
  const modal = dom.goalModal;
  activateModal(modal);
  dom.goalModalTitle.textContent = goal ? 'Editar Meta' : 'Nova Meta';
  dom.goalName.value = goal ? goal.name : '';
  dom.goalTarget.value = goal
    ? (convertBaseCentsToInputValue(
      Number.isSafeInteger(goal.targetCents) ? goal.targetCents : toCents(goal.targetValue)
    ) ?? '')
    : '';
  dom.goalColor.value = goal ? goal.color : '#38bdf8';

  dom.goalForm.dataset.editIndex = index;
}

function saveGoal() {
  const name = dom.goalName.value.trim();
  const targetValue = parseFloat(dom.goalTarget.value);
  const color = dom.goalColor.value;

  if (!name || name.length > 100 || !Number.isFinite(targetValue) || targetValue <= 0
    || !/^#[0-9a-f]{6}$/i.test(color)) {
    showToast('Preencha todos os campos corretamente.', 'error');
    return;
  }

  const targetCents = convertInputAmountToBaseCents(targetValue);
  if (!Number.isSafeInteger(targetCents) || targetCents <= 0) {
    showToast(`Cadastre uma taxa de câmbio válida para ${state.settings.currency}.`, 'error');
    return;
  }
  const editIndex = parseInt(dom.goalForm.dataset.editIndex);
  const existing = editIndex >= 0 ? state.goals[editIndex] : null;
  const timestamp = new Date().toISOString();
  const goal = {
    ...(existing || {}),
    id: existing?.id || createId(),
    name,
    targetCents,
    targetValue: fromCents(targetCents),
    color,
    visible: true,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: (existing?.version || 0) + 1
  };

  if (editIndex >= 0) {
    state.goals[editIndex] = goal;
  } else {
    state.goals.push(goal);
  }

  saveState();
  renderGoals();
  closeModals();
  showToast(`Meta "${name}" ${editIndex >= 0 ? 'atualizada' : 'criada'} com sucesso!`, 'success');
}

function editGoal(index) {
  const goal = state.goals[index];
  if (goal) {
    openGoalModal(goal, index);
  }
}

function deleteGoal(index) {
  const goal = state.goals[index];
  showDangerConfirmModal(
    'Excluir meta',
    `Deseja excluir a meta "${sanitizeHtml(goal.name)}"?`,
    'EXCLUIR',
    () => {
      state.goals.splice(index, 1);
      saveState();
      renderGoals();
      showToast('Meta excluída com sucesso.', 'success');
    }
  );
}

window.addEventListener('DOMContentLoaded', () => {
  init();
  initNewFeatures();
});