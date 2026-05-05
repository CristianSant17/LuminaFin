/*
  LuminaFin - Sistema de controle financeiro pessoal com SPA, localStorage, charts e administração.
  Todos os módulos são escritos em JavaScript puro para garantir compatibilidade e desempenho.
*/

const STORAGE_KEY = 'LuminaFin-v1';

// ==================== PHASE 11: MÚLTIPLAS MOEDAS ====================
const currencySettings = {
  'BRL': { symbol: 'R$', name: 'Real Brasileiro', rate: 1.0 },
  'USD': { symbol: '$', name: 'Dólar Americano', rate: 5.20 },
  'EUR': { symbol: '€', name: 'Euro' , rate: 5.80 },
  'GBP': { symbol: '£', name: 'Libra Esterlina', rate: 6.50 },
  'JPY': { symbol: '¥', name: 'Iene Japonês', rate: 0.035 },
  'CAD': { symbol: 'C$', name: 'Dólar Canadense', rate: 3.85 }
};

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
  deletedItems: [], // Trash bin para recuperação de dados deletados
  sort: { key: 'date', order: 'desc' },
  pagination: { page: 1, pageSize: 10 },
  filters: { year: 2026, month: 4, type: 'all', search: '', category: 'all' },
  reportYear: 2026
};

let dom = {};

const charts = {
  incomeExpense: null,
  categorySpending: null,
  balanceTrend: null,
  topExpenses: null,
  reportCategory: null,
  reportMonthly: null,
  reportPayment: null,
  purchaseProjection: null,
  balanceProjection: null,
  savingsGoal: null
};

const labelsMonths = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const paymentMethods = ['Pix','Cartão','Dinheiro','Boleto','Débito','Saldo'];
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => showToast('Service Worker registrado. Offline suportado.', 'success'))
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

/**
 * Gerenciador de Estado Centralizado
 * PHASE 9: Padrão Observable para reatividade
 */
class AppStateManager {
  constructor(initialState) {
    this.state = initialState;
    this.observers = [];
  }
  
  subscribe(observer) {
    this.observers.push(observer);
  }
  
  notify(changes) {
    this.observers.forEach(obs => obs(changes));
  }
  
  setState(newState) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    this.notify({ old: oldState, new: this.state });
  }
}

/**
 * Gerenciador de Transações
 * PHASE 9: Encapsulação de lógica de transações
 */
class TransactionManager {
  constructor(state) {
    this.state = state;
  }
  
  add(transaction) {
    this.state.transactions.push({ ...transaction, id: transaction.id || createId() });
    return this.state.transactions[this.state.transactions.length - 1];
  }
  
  update(id, updates) {
    const tx = this.state.transactions.find(t => t.id === id);
    if (tx) {
      Object.assign(tx, updates);
      return tx;
    }
    return null;
  }
  
  delete(id) {
    const index = this.state.transactions.findIndex(t => t.id === id);
    if (index >= 0) {
      return this.state.transactions.splice(index, 1)[0];
    }
    return null;
  }
  
  find(predicate) {
    return this.state.transactions.filter(predicate);
  }
  
  getByPeriod(year, month, type = 'all') {
    return this.find(t => {
      const date = new Date(t.date);
      const yearMatch = date.getFullYear() === year;
      const monthMatch = date.getMonth() + 1 === month;
      const typeMatch = type === 'all' || t.type === type;
      return yearMatch && monthMatch && typeMatch;
    });
  }
}

/**
 * Gerenciador de Categorias
 * PHASE 9: Encapsulação de lógica de categorias
 */
class CategoryManager {
  constructor(state) {
    this.state = state;
  }
  
  add(category) {
    this.state.categories.push({ ...category, id: category.id || createId() });
    return this.state.categories[this.state.categories.length - 1];
  }
  
  update(id, updates) {
    const cat = this.state.categories.find(c => c.id === id);
    if (cat) {
      Object.assign(cat, updates);
      return cat;
    }
    return null;
  }
  
  delete(id) {
    const index = this.state.categories.findIndex(c => c.id === id);
    if (index >= 0) {
      return this.state.categories.splice(index, 1)[0];
    }
    return null;
  }
  
  getByType(type) {
    return this.state.categories.filter(c => c.type === type);
  }
}

/**
 * Gerenciador de Gastos Fixos
 * PHASE 9: Encapsulação de lógica de gastos fixos
 */
class FixedExpenseManager {
  constructor(state) {
    this.state = state;
  }
  
  add(expense) {
    this.state.fixedExpenses.push({ ...expense, id: expense.id || createId() });
    return this.state.fixedExpenses[this.state.fixedExpenses.length - 1];
  }
  
  update(id, updates) {
    const exp = this.state.fixedExpenses.find(e => e.id === id);
    if (exp) {
      Object.assign(exp, updates);
      return exp;
    }
    return null;
  }
  
  delete(id) {
    const index = this.state.fixedExpenses.findIndex(e => e.id === id);
    if (index >= 0) {
      return this.state.fixedExpenses.splice(index, 1)[0];
    }
    return null;
  }
  
  getActive() {
    return this.state.fixedExpenses.filter(e => e.active);
  }
}

// ==================== FIM ESTRUTURAS DE CLASSE - PHASE 9 ====================

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
  const currencyInfo = currencySettings[currency] || currencySettings['BRL'];
  const decimals = currency === 'JPY' ? 0 : 2;
  const formatted = value.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return formatted;
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
      if (!category.limit || category.limit === 0) return;
      
      const spent = state.transactions
        .filter(t => {
          const date = new Date(t.date);
          return t.category === category.id && 
                 t.type === 'expense' &&
                 date.getFullYear() === year && 
                 date.getMonth() + 1 === month;
        })
        .reduce((sum, t) => sum + t.value, 0);
      
      const percentage = (spent / category.limit) * 100;
      const threshold = state.settings.notifyOnLimitReached || 80;
      
      if (percentage >= threshold && percentage < 100) {
        const title = `⚠️ Limite próximo: ${category.icon} ${category.name}`;
        const body = `Você gastou ${percentage.toFixed(0)}% do limite de ${formatCurrency(category.limit)}`;
        notificationSystem.sendNotification(title, body);
      } else if (percentage >= 100) {
        const title = `🚨 Limite ultrapassado: ${category.icon} ${category.name}`;
        const body = `Você ultrapassou o limite em ${formatCurrency(spent - category.limit)}!`;
        notificationSystem.sendNotification(title, body);
      }
    });
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

const exportManager = {
  exportToExcel: (year) => {
    const transactions = state.transactions.filter(t => new Date(t.date).getFullYear() === year);

    let csv = 'Data,Categoria,Subcategoria,Tipo,Descrição,Valor,Pagamento,Status\n';

    transactions.forEach(t => {
      const category = getCategory(t.category);
      const categoryName = category ? category.name : t.category;
      const type = t.type === 'income' ? 'Entrada' : 'Saída';
      const status = t.status === 'paid' ? 'Pago' : t.status === 'pending' ? 'Pendente' : 'Agendado';
      
      csv += `"${t.date}","${categoryName}","${t.subcategory || '-'}","${type}","${t.description}","${t.value.toFixed(2)}","${t.payment || '-'}","${status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `LuminaFin-${year}.csv`;
    link.click();
    showToast('✓ Arquivo CSV exportado com sucesso!', 'success');
  },

  generatePDFContent: (year) => {
    const monthNames = ['Ano todo', ...labelsMonths];
    const totalIncome = state.transactions.filter(t => new Date(t.date).getFullYear() === year && t.type === 'income').reduce((sum, t) => sum + t.value, 0);
    const totalExpense = state.transactions.filter(t => new Date(t.date).getFullYear() === year && t.type === 'expense').reduce((sum, t) => sum + t.value, 0);
    const balance = totalIncome - totalExpense;
    const forecast = renderForecastData(year);

    let rows = state.transactions
      .filter(t => new Date(t.date).getFullYear() === year)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => {
        const category = getCategory(t.category);
        const type = t.type === 'income' ? '+ Entrada' : '- Saída';
        return `<tr><td>${t.date}</td><td>${type}</td><td>${category?.name || t.category}</td><td>${sanitizeHtml(t.description)}</td><td>${formatCurrency(t.value)}</td></tr>`;
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
    <div class="summary-card"><strong>Receitas</strong><p>${formatCurrency(totalIncome)}</p></div>
    <div class="summary-card"><strong>Despesas</strong><p>${formatCurrency(totalExpense)}</p></div>
    <div class="summary-card"><strong>Saldo</strong><p>${formatCurrency(balance)}</p></div>
    <div class="summary-card"><strong>Projeção média</strong><p>${formatCurrency(forecast.reduce((sum, item) => sum + item.projectedBalance, 0) / Math.max(forecast.length, 1))}</p></div>
  </div>
  <h3>Transações</h3>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead>
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

  downloadPDF: (year) => {
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
  } catch (error) {
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
 * Throttle: Limita execução da função a um intervalo fixo
 * @param {Function} func - Função a ser executada
 * @param {number} limit - Intervalo mínimo em ms
 * @returns {Function} Função com throttle aplicado
 */
function throttle(func, limit = 100) {
  let lastRun = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      func.apply(this, args);
      lastRun = now;
    }
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
    const trashItem = {
      id: item.id,
      type,
      data: { ...item },
      deletedAt: new Date().toISOString(),
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
  const count = trashBin.listTrash().length;
  const statusText = count === 0 ? 'Lixeira vazia' : `${count} item${count === 1 ? '' : 's'} na lixeira`;
  const statusElement = document.getElementById('trashStatusText');
  if (statusElement) statusElement.textContent = statusText;
}

function restoreLastTrashItem() {
  const items = trashBin.listTrash();
  if (items.length === 0) {
    showToast('Lixeira vazia.', 'warning');
    return;
  }

  const lastItem = items[items.length - 1];
  const restored = trashBin.restoreFromTrash(lastItem.id);
  if (!restored) {
    showToast('Não foi possível restaurar o item.', 'error');
    return;
  }

  if (lastItem.type === 'transaction') {
    state.transactions.push(restored);
  } else if (lastItem.type === 'category') {
    state.categories.push(restored);
    rebuildCategoryDropdowns();
  } else if (lastItem.type === 'fixedExpense') {
    state.fixedExpenses.push(restored);
  }

  saveState();
  renderAllUI();
  showToast('Item restaurado da lixeira.', 'success');
}

function emptyTrash() {
  if (!confirm('Deseja esvaziar permanentemente a lixeira?')) return;
  state.deletedItems = [];
  saveState();
  renderTrashStatus();
  showToast('Lixeira esvaziada permanentemente.', 'success');
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
  return div.innerHTML;
}

// ==================== PHASE 3: FUNÇÕES AUXILIARES - ELIMINANDO DUPLICAÇÃO ====================

/**
 * Renderiza todos os componentes da UI (consolidando múltiplas chamadas)
 * PHASE 3: Elimina duplicação de renderização
 */
function renderAllUI(options = {}) {
  const { dashboard = true, transactions = true, categories = true, fixed = true, reports = true, limits = true, editor = true, trash = true } = options;
  calcCache.clear();
  if (dashboard) renderDashboard();
  if (transactions) renderTransactionTable();
  if (categories) renderCategoryTable();
  if (fixed) renderFixedTable();
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
 * Limpa inputs de um formulário
 * PHASE 3: Função genérica para limpar múltiplos campos
 */
function clearForm(...inputIds) {
  inputIds.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      } else {
        input.value = '';
      }
    }
  });
}

/**
 * Abre modal genérica com título (consolida padrão repetido)
 * PHASE 3: Reduz duplicação de abertura de modais
 */
function openModal(modalId, titleId, titleText) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    const titleEl = document.getElementById(titleId);
    if (titleEl) titleEl.textContent = titleText;
  }
}

/**
 * Obtém valores de múltiplos campos de formulário
 * PHASE 3: Reduz duplicação de extração de dados
 */
function getFormValues(...fieldIds) {
  const values = {};
  fieldIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      values[id] = element.type === 'checkbox' ? element.checked : element.value;
    }
  });
  return values;
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
 * Obtém sugestões de descrições baseado em histórico
 * PHASE 4: Auto-complete para descrições de transações
 */
function getSuggestions(query = '', limit = 5) {
  const lowerQuery = query.toLowerCase();
  
  // Coletar descrições únicas e recentes
  const descriptions = [...new Set(state.transactions.map(t => t.description))]
    .filter(d => d.toLowerCase().includes(lowerQuery))
    .sort((a, b) => {
      const aLast = state.transactions.filter(t => t.description === a).pop()?.date;
      const bLast = state.transactions.filter(t => t.description === b).pop()?.date;
      return new Date(bLast) - new Date(aLast);
    })
    .slice(0, limit);
  
  return descriptions;
}

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
 * Calcula Month-over-Month (MoM) - variação percentual de um mês para outro
 * PHASE 5: Variação % entre períodos
 */
function calculateMoM(year, month, type = 'expense') {
  const currentMonth = sumByPeriod(year, month, type);
  const previousMonth = month === 1
    ? sumByPeriod(year - 1, 12, type)
    : sumByPeriod(year, month - 1, type);
  
  if (previousMonth === 0) return { value: 'N/A', direction: 'neutral' };
  
  const percentage = ((currentMonth - previousMonth) / previousMonth) * 100;
  const direction = percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'neutral';
  
  return {
    value: Math.abs(percentage).toFixed(1) + '%',
    direction,
    numeric: percentage
  };
}

/**
 * Calcula tendência: média dos últimos 3 meses
 * PHASE 5: Média móvel de 3 meses
 */
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
    months.push(sumByPeriod(y, m, type));
  }
  
  const average = months.reduce((a, b) => a + b, 0) / 3;
  return average;
}

/**
 * Calcula sazonalidade: identifica quais meses tém mais gastos
 * PHASE 5: Análise de padrões mensais
 */
function analyzeSeasonality(year, type = 'expense') {
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total: sumByPeriod(year, i + 1, type),
    label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i]
  }));
  
  monthly.sort((a, b) => b.total - a.total);
  
  return {
    highest: monthly[0],
    lowest: monthly[monthly.length - 1],
    average: monthly.reduce((sum, m) => sum + m.total, 0) / 12,
    all: monthly
  };
}

/**
 * Calcula previsão para próximos meses (baseada em média de 3 meses)
 * PHASE 5: Previsão simples
 */
function forecastNextMonths(year, month, type = 'expense', months = 3) {
  const trend = calculateTrend(year, month, type);
  const lastMonth = month === 1 ? sumByPeriod(year - 1, 12, type) : sumByPeriod(year, month - 1, type);
  const prevMonth = month <= 2 ? sumByPeriod(year - 1, 12 - (2 - month), type) : sumByPeriod(year, month - 2, type);
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
    
    const growthFactor = 1 + (i - 1) * 0.02;
    const predicted = Math.round((basePrediction * growthFactor) * 100) / 100;
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
  const balance = state.transactions.reduce((sum, item) => {
    return sum + (item.type === 'income' ? item.value : -item.value);
  }, 0);
  return Math.round(balance * 100) / 100;
}

/**
 * Calcula o saldo acumulado até o final do mês anterior ao especificado
 * @param {number} year - Ano
 * @param {number} month - Mês (1-12)
 * @returns {number} Saldo acumulado até o final do mês anterior
 */
function calculateBalanceUpToPreviousMonth(year, month) {
  const previousMonthDate = new Date(year, month - 1, 0); // Último dia do mês anterior
  
  const transactionsUpToPreviousMonth = state.transactions.filter((transaction) => {
    const transactionDate = new Date(transaction.date);
    return transactionDate <= previousMonthDate;
  });
  
  const balance = transactionsUpToPreviousMonth.reduce((sum, item) => {
    return sum + (item.type === 'income' ? item.value : -item.value);
  }, 0);
  
  return Math.round(balance * 100) / 100;
}

function calculatePurchaseProjection({ amount, installments = 1, monthlyIncome, monthlyExpense }) {
  const income = typeof monthlyIncome === 'number' && monthlyIncome >= 0 ? monthlyIncome : calculateAverageMonthly('income', 3);
  const expense = typeof monthlyExpense === 'number' && monthlyExpense >= 0 ? monthlyExpense : calculateAverageMonthly('expense', 3);
  const monthlyNet = Math.round((income - expense) * 100) / 100;
  const installmentValue = Math.round((amount / Math.max(installments, 1)) * 100) / 100;
  const remainingBudget = Math.round((monthlyNet - installmentValue) * 100) / 100;
  return {
    amount,
    installments,
    income,
    expense,
    monthlyNet,
    installmentValue,
    remainingBudget,
    canAfford: remainingBudget >= 0,
    currentBalance: calculateCurrentBalance(),
    totalCost: amount,
    status: remainingBudget >= 0 ? 'Compra compatível com o orçamento mensal estimado.' : 'Atenção: compra deixa o orçamento mensal negativo.',
    upfrontStatus: installments === 1
      ? (calculateCurrentBalance() >= amount ? 'Saldo atual suficiente para pagar à vista.' : 'Saldo atual pode não ser suficiente para pagar à vista.')
      : ''
  };
}

function renderPurchaseProjection() {
  if (!dom.purchaseProjectionResult) return;
  const amount = parseFloat(dom.purchaseValue?.value) || 0;
  const installments = Math.max(1, Number(dom.purchaseInstallments?.value) || 1);
  const monthlyIncome = dom.purchaseMonthlyIncome?.value.trim() === '' ? NaN : parseFloat(dom.purchaseMonthlyIncome?.value);
  const monthlyExpense = dom.purchaseMonthlyExpense?.value.trim() === '' ? NaN : parseFloat(dom.purchaseMonthlyExpense?.value);
  
  // Obter saldo atual automaticamente
  const currentBalance = calculateCurrentBalance();

  if (amount <= 0) {
    dom.purchaseProjectionResult.innerHTML = '<div>Nenhum valor de compra informado.</div>';
    if (charts.purchaseProjection) {
      charts.purchaseProjection.destroy();
      charts.purchaseProjection = null;
    }
    return;
  }

  const projection = calculatePurchaseProjection({
    amount,
    installments,
    monthlyIncome: !isNaN(monthlyIncome) ? monthlyIncome : undefined,
    monthlyExpense: !isNaN(monthlyExpense) ? monthlyExpense : undefined
  });

  // Calcular saldo após a compra e análises elaboradas
  const balanceAfterPurchase = currentBalance - amount;
  const emergencyFund = (projection.expense * 3);
  const minSafeBalance = projection.expense * 1;
  const monthsOfCoverageAfterPurchase = projection.remainingBudget > 0 ? (balanceAfterPurchase / projection.expense) : 0;
  const recoveryMonths = balanceAfterPurchase < 0 ? Math.ceil(Math.abs(balanceAfterPurchase) / Math.max(projection.remainingBudget, 1)) : 0;
  
  const balanceHealthColor = balanceAfterPurchase >= 0 ? '#16a34a' : '#dc2626';
  const balanceHealthStatus = balanceAfterPurchase >= 0 ? '✅ Saldo positivo' : '🚨 Saldo ficará negativo';
  const recoveryStatus = recoveryMonths > 0 ? `<div style="color: #f59e0b;">⏱️ Recuperação em aprox. ${recoveryMonths} meses</div>` : '';

  dom.purchaseProjectionResult.innerHTML = `
    <div style="background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
      <div><strong>💰 Análise de Impacto Financeiro</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Saldo atual:</strong> <span style="font-size: 1.1rem; color: ${currentBalance >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(currentBalance)}</span></div>
      <div style="margin-top: 0.5rem;"><strong>Valor da compra:</strong> <span style="font-size: 1.1rem; color: #f59e0b;">${formatCurrency(amount)}</span></div>
      <div style="margin-top: 0.5rem; font-size: 1.2rem; font-weight: 700; background: rgba(${balanceAfterPurchase >= 0 ? '22, 197, 94' : '239, 68, 68'}, 0.2); padding: 0.75rem; border-radius: 6px;">
        <strong>Saldo final:</strong> <span style="color: ${balanceHealthColor};">${formatCurrency(balanceAfterPurchase)}</span>
      </div>
      <div style="margin-top: 0.5rem; color: ${balanceHealthColor}; font-weight: 600;">${balanceHealthStatus}</div>
      ${recoveryStatus}
    </div>
    
    <div style="margin-top: 1rem; padding: 1rem; background: rgba(100, 116, 139, 0.1); border-radius: 8px;">
      <div><strong>📊 Detalhamento Financeiro</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Parcelas:</strong> ${projection.installments}x de ${formatCurrency(projection.installmentValue)}</div>
      <div><strong>Renda mensal:</strong> ${formatCurrency(projection.income)}</div>
      <div><strong>Despesa mensal:</strong> ${formatCurrency(projection.expense)}</div>
      <div><strong>Superávit mensal atual:</strong> ${formatCurrency(projection.remainingBudget)}</div>
      <div><strong>% da renda em parcela:</strong> ${((projection.installmentValue / projection.income) * 100).toFixed(1)}%</div>
      <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3);"><strong>Cobertura de despesas:</strong> ${monthsOfCoverageAfterPurchase.toFixed(1)} meses</div>
      <div><strong>Fundo de emergência ideal:</strong> ${formatCurrency(emergencyFund)}</div>
      <div><strong>Gap para emergência:</strong> <span style="color: ${(balanceAfterPurchase - emergencyFund) >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(Math.max(0, emergencyFund - balanceAfterPurchase))}</span></div>
    </div>
    
    <div style="font-weight:600; color:${projection.canAfford ? '#16a34a' : '#dc2626'}; margin-top: 1rem;">${projection.status}</div>
    ${projection.upfrontStatus ? `<div style="margin-top: 0.5rem;">${projection.upfrontStatus}</div>` : ''}
  `;

  // Render chart com saldo atual incluído
  const chartData = {
    labels: ['Saldo Atual', 'Renda Mensal', 'Gastos Mensais', 'Parcela da Compra', 'Saldo Restante'],
    datasets: [{
      label: 'Valor (R$)',
      data: [currentBalance, projection.income, projection.expense, projection.installmentValue, Math.max(0, projection.remainingBudget)],
      backgroundColor: [
        currentBalance >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)', // green or red for current balance
        'rgba(34, 197, 94, 0.8)', // green for income
        'rgba(239, 68, 68, 0.8)', // red for expenses
        'rgba(245, 158, 11, 0.8)', // orange for installment
        projection.remainingBudget >= 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(220, 38, 38, 0.8)' // blue or red for remaining
      ],
      borderColor: [
        currentBalance >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)',
        'rgba(34, 197, 94, 1)',
        'rgba(239, 68, 68, 1)',
        'rgba(245, 158, 11, 1)',
        projection.remainingBudget >= 0 ? 'rgba(59, 130, 246, 1)' : 'rgba(220, 38, 38, 1)'
      ],
      borderWidth: 1
    }]
  };

  // Generate insights
  let insights = [];
  
  // Aviso sobre saldo negativo
  if (currentBalance < 0) {
    insights.push('🚨 Seu saldo atual é negativo! Comprar agora aumentará ainda mais o débito');
  } else if (balanceAfterPurchase < 0) {
    insights.push('⚠️ A compra deixará seu saldo negativo - considere aguardar ou reduzir o valor');
  } else if (balanceAfterPurchase < 1000) {
    insights.push('💡 A compra deixará pouco saldo. Mantenha uma reserva de emergência');
  }

  const budgetPercentage = (projection.installmentValue / projection.income) * 100;
  if (budgetPercentage > 30) {
    insights.push('⚠️ Parcela representa mais de 30% da renda - considere reduzir parcelas');
  } else if (budgetPercentage <= 10) {
    insights.push('✅ Parcela confortável (menos de 10% da renda)');
  }

  if (projection.remainingBudget < 500) {
    insights.push('💰 Saldo restante apertado - revise orçamento mensal');
  }

  if (projection.installments > 12) {
    insights.push('📅 Muitas parcelas - considere prazo menor para reduzir juros');
  }

  if (insights.length === 0) {
    insights.push('🎯 Compra parece adequada ao seu perfil financeiro');
  }

  dom.purchaseInsightsContent.innerHTML = insights.map(insight => `<div>${insight}</div>`).join('');

  // Render chart
  charts.purchaseProjection = renderChart(charts.purchaseProjection, dom.chartPurchaseProjection, {
    type: 'bar',
    data: chartData,
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
}

function calculateBalanceProjection({ startBalance, monthlyIncome, monthlyExpense, months }) {
  const balance = typeof startBalance === 'number' && !Number.isNaN(startBalance) ? startBalance : calculateCurrentBalance();
  const income = typeof monthlyIncome === 'number' && monthlyIncome >= 0 ? monthlyIncome : calculateAverageMonthly('income', 3);
  const expense = typeof monthlyExpense === 'number' && monthlyExpense >= 0 ? monthlyExpense : calculateAverageMonthly('expense', 3);
  const horizon = Math.max(1, Math.round(months));
  const monthlyNet = Math.round((income - expense) * 100) / 100;
  const projectedBalance = Math.round((balance + monthlyNet * horizon) * 100) / 100;
  return { balance, income, expense, horizon, monthlyNet, projectedBalance };
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
  const startBalance = dom.balanceStartValue?.value.trim() === '' ? NaN : parseFloat(dom.balanceStartValue?.value);
  const balanceMonthlyIncome = dom.balanceMonthlyIncome?.value.trim() === '' ? NaN : parseFloat(dom.balanceMonthlyIncome?.value);
  const balanceMonthlyExpense = dom.balanceMonthlyExpense?.value.trim() === '' ? NaN : parseFloat(dom.balanceMonthlyExpense?.value);
  const months = Number(dom.balanceProjectionMonths?.value) || 6;

  const projection = calculateBalanceProjection({
    startBalance: !isNaN(startBalance) ? startBalance : undefined,
    monthlyIncome: !isNaN(balanceMonthlyIncome) ? balanceMonthlyIncome : undefined,
    monthlyExpense: !isNaN(balanceMonthlyExpense) ? balanceMonthlyExpense : undefined,
    months
  });

  // Análises elaboradas
  const savingsRate = (projection.monthlyNet / projection.income) * 100;
  const emergencyFund = projection.expense * 3;
  const monthlyRatio = projection.balance / projection.expense;
  const projectedRatio = projection.projectedBalance / projection.expense;
  const breakEvenMonth = projection.monthlyNet >= 0 ? null : Math.ceil(projection.balance / Math.abs(projection.monthlyNet));
  const excessBudget = projection.monthlyNet > 0 ? projection.monthlyNet : 0;
  const deficitBudget = projection.monthlyNet < 0 ? Math.abs(projection.monthlyNet) : 0;

  const healthStatus = projection.projectedBalance >= 0 ? '✅ Projeção positiva' : '🚨 Projeção negativa';
  const healthColor = projection.projectedBalance >= 0 ? '#16a34a' : '#dc2626';
  const trenddDirection = projection.monthlyNet > 0 ? '📈 Crescimento' : projection.monthlyNet < 0 ? '📉 Declínio' : '→ Estabilidade';

  dom.balanceProjectionResult.innerHTML = `
    <div style="background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
      <div><strong>💰 Posição Financeira Atual</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Saldo inicial:</strong> <span style="font-size: 1.1rem; color: ${projection.balance >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(projection.balance)}</span></div>
      <div style="margin-top: 0.5rem;"><strong>Cobertura de despesas:</strong> <span style="color: ${monthlyRatio >= 3 ? '#22c55e' : monthlyRatio >= 1 ? '#f59e0b' : '#ef4444'};">${monthlyRatio.toFixed(1)}x</span> (${(monthlyRatio * 30).toFixed(0)} dias)</div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: rgba(100, 116, 139, 0.1); border-radius: 8px;">
      <div><strong>📊 Fluxo Financeiro Mensal</strong></div>
      <div style="margin-top: 0.75rem;"><strong>Receita mensal:</strong> <span style="color: #22c55e;">${formatCurrency(projection.income)}</span></div>
      <div><strong>Despesa mensal:</strong> <span style="color: #ef4444;">${formatCurrency(projection.expense)}</span></div>
      <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.3);"><strong>Saldo líquido mensal:</strong> <span style="font-size: 1.1rem; color: ${projection.monthlyNet >= 0 ? '#22c55e' : '#ef4444'};">${formatCurrency(projection.monthlyNet)}</span></div>
      <div><strong>Taxa de economia:</strong> <span style="color: ${savingsRate >= 20 ? '#22c55e' : savingsRate >= 10 ? '#f59e0b' : '#ef4444'};">${savingsRate.toFixed(1)}%</span></div>
      <div style="margin-top: 0.5rem;"><strong>Tendência:</strong> <span>${trenddDirection}</span></div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: rgba(${projection.projectedBalance >= 0 ? '34, 197, 94' : '239, 68, 68'}, 0.1); border-left: 4px solid ${healthColor}; border-radius: 8px;">
      <div><strong>🔮 Projeção em ${projection.horizon} ${projection.horizon === 1 ? 'mês' : 'meses'}</strong></div>
      <div style="margin-top: 0.75rem; font-size: 1.2rem; font-weight: 700; color: ${healthColor};">Saldo final: ${formatCurrency(projection.projectedBalance)}</div>
      <div style="margin-top: 0.5rem; color: ${healthColor}; font-weight: 600;">${healthStatus}</div>
      <div style="margin-top: 0.5rem;"><strong>Cobertura de despesas:</strong> ${projectedRatio.toFixed(1)}x (${(projectedRatio * 30).toFixed(0)} dias)</div>
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
  } else if (savingsRate <= 0) {
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

/**
 * Compara categoria com média histórica
 * PHASE 5: Detecção de anomalias
 */
function compareWithHistoricalAverage(categoryId, year, month) {
  const currentValue = state.transactions
    .filter(t => new Date(t.date).getFullYear() === year && 
                  new Date(t.date).getMonth() + 1 === month &&
                  t.category === categoryId &&
                  t.type === 'expense')
    .reduce((sum, t) => sum + t.value, 0);
  
  const historical = state.transactions
    .filter(t => t.category === categoryId && t.type === 'expense')
    .reduce((sum, t) => sum + t.value, 0) / 12; // Média anual
  
  if (historical === 0) return { comparison: 'N/A', percentage: 0 };
  
  const percentage = ((currentValue - historical) / historical) * 100;
  
  return {
    comparison: percentage > 0 ? 'acima' : 'abaixo',
    percentage: Math.abs(percentage).toFixed(1),
    value: currentValue,
    average: historical.toFixed(2)
  };
}

// ==================== FIM RELATÓRIOS AVANÇADOS - PHASE 5 ====================

// ==================== PHASE 6: NOVAS FUNCIONALIDADES - TAGS, ORÇAMENTO, RECORRÊNCIA ====================

/**
 * Gerencia tags de transações
 * PHASE 6: Sistema de tags para melhor categorização
 */
const tagManager = {
  getTagsFromTransaction: (transactionId) => {
    const tx = state.transactions.find(t => t.id === transactionId);
    return tx?.tags || [];
  },
  
  addTagToTransaction: (transactionId, tag) => {
    const tx = state.transactions.find(t => t.id === transactionId);
    if (tx) {
      if (!tx.tags) tx.tags = [];
      if (!tx.tags.includes(tag)) {
        tx.tags.push(tag);
        saveState();
      }
    }
  },
  
  removeTagFromTransaction: (transactionId, tag) => {
    const tx = state.transactions.find(t => t.id === transactionId);
    if (tx && tx.tags) {
      tx.tags = tx.tags.filter(t => t !== tag);
      saveState();
    }
  },
  
  getAllTags: () => {
    const tags = new Set();
    state.transactions.forEach(tx => {
      if (tx.tags) tx.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  },
  
  getTransactionsByTag: (tag) => {
    return state.transactions.filter(tx => tx.tags && tx.tags.includes(tag));
  }
};

/**
 * Gerencia orçamentos mensais por categoria
 * PHASE 6: Limites de gasto com alertas visuais
 */
const budgetManager = {
  setBudget: (categoryId, amount) => {
    // Salvar orçamento em localStorage com formato de categoria
    const budget = state.categories.find(c => c.id === categoryId);
    if (budget) {
      budget.limit = amount; // Já existia no modelo
      saveState();
    }
  },
  
  getBudgetStatus: (categoryId, year, month) => {
    const budget = state.categories.find(c => c.id === categoryId)?.limit || 0;
    const spent = state.transactions
      .filter(t => new Date(t.date).getFullYear() === year &&
                    new Date(t.date).getMonth() + 1 === month &&
                    t.category === categoryId &&
                    t.type === 'expense')
      .reduce((sum, t) => sum + t.value, 0);
    
    if (budget === 0) return { status: 'no-limit', percentage: 0 };
    
    const percentage = (spent / budget) * 100;
    const status = percentage > 100 ? 'exceeded' : percentage > 80 ? 'warning' : 'ok';
    
    return { status, percentage: Math.round(percentage), spent, budget };
  },
  
  getMonthlyBudgetOverview: (year, month) => {
    return state.categories
      .filter(c => c.type === 'expense' && c.limit > 0)
      .map(c => ({
        category: c.name,
        ...budgetManager.getBudgetStatus(c.id, year, month)
      }));
  }
};

/**
 * Gerencia recorrências customizadas
 * PHASE 6: Padrões de recorrência personalizados
 */
const recurringManager = {
  types: {
    daily: { interval: 1, unit: 'day' },
    weekly: { interval: 7, unit: 'day' },
    biweekly: { interval: 14, unit: 'day' },
    monthly: { interval: 1, unit: 'month' },
    quarterly: { interval: 3, unit: 'month' },
    semiannual: { interval: 6, unit: 'month' },
    annual: { interval: 1, unit: 'year' }
  },
  
  generateRecurringTransactions: (template, startDate, endDate, type) => {
    const recurring = [];
    const typeConfig = this.types[type];
    if (!typeConfig) return recurring;
    
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      const txDate = currentDate.toISOString().slice(0, 10);
      recurring.push({
        ...template,
        id: createId(),
        date: txDate,
        isRecurring: true,
        recurringTemplateId: template.id
      });
      
      // Incrementar data
      if (typeConfig.unit === 'day') {
        currentDate.setDate(currentDate.getDate() + typeConfig.interval);
      } else if (typeConfig.unit === 'month') {
        currentDate.setMonth(currentDate.getMonth() + typeConfig.interval);
      } else if (typeConfig.unit === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + typeConfig.interval);
      }
    }
    
    return recurring;
  },
  
  applyRecurringTransactions: (templateId, endDate) => {
    // Aplicar transações recorrentes até uma certa data
    const template = state.transactions.find(t => t.id === templateId);
    if (!template) return;
    
    const startDate = template.date;
    const recurring = this.generateRecurringTransactions(template, startDate, endDate, 'monthly');
    state.transactions.push(...recurring);
    saveState();
  }
};

// ==================== FIM NOVAS FUNCIONALIDADES - PHASE 6 ====================

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
  });
  
  document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
  });
}

// ==================== FIM ACESSIBILIDADE - PHASE 7 ====================

// ==================== PHASE 10: TESTES BÁSICOS & DEBUGGING ====================

/**
 * Sistema de Testes Básicos
 * PHASE 10: Validação de funcionalidades
 */
const testSuite = {
  tests: [],
  results: [],
  
  assert: (condition, message) => {
    if (!condition) {
      throw new Error(`Asseção falhou: ${message}`);
    }
  },
  
  test: (name, fn) => {
    testSuite.tests.push({ name, fn });
  },
  
  run: () => {
    testSuite.results = [];
    console.group('%c🧠 Executando Testes', 'font-size: 14px; font-weight: bold');
    
    testSuite.tests.forEach(({ name, fn }) => {
      try {
        fn();
        console.log(`%c✅ PASS: ${name}`, 'color: green; font-weight: bold');
        testSuite.results.push({ name, status: 'pass' });
      } catch (error) {
        console.error(`%c❌ FAIL: ${name}`, 'color: red; font-weight: bold');
        console.error(error.message);
        testSuite.results.push({ name, status: 'fail', error: error.message });
      }
    });
    
    const passed = testSuite.results.filter(r => r.status === 'pass').length;
    const failed = testSuite.results.filter(r => r.status === 'fail').length;
    console.log(`%c
🏁 Resumo: ${passed} passed, ${failed} failed`, 'font-size: 12px; font-weight: bold');
    console.groupEnd();
  }
};

/**
 * Testes Unitários para Funções Chave
 * PHASE 10: Validação de lógica principal
 */
const registerTests = () => {
  // Teste de formatação de moeda
  testSuite.test('formatCurrency > Formatação BRL', () => {
    testSuite.assert(
      formatCurrency(1234.56) === 'R$ 1.234,56',
      'Deve formatar 1234.56 como R$ 1.234,56'
    );
  });
  
  // Teste de debounce
  testSuite.test('debounce > Reduz chamadas', () => {
    let callCount = 0;
    const fn = debounce(() => callCount++, 10);
    fn();
    fn();
    fn();
    testSuite.assert(callCount === 0, 'Debounce não deve executar imediatamente');
  });
  
  // Teste de validação
  testSuite.test('validateInput > Validação de email', () => {
    testSuite.assert(
      validateInput('email', 'user@example.com') === true,
      'Deve validar email válido'
    );
    testSuite.assert(
      validateInput('email', 'invalid-email') === false,
      'Deve rejeitar email inválido'
    );
  });
  
  // Teste de sanitização
  testSuite.test('sanitizeHtml > Remove scripts', () => {
    const result = sanitizeHtml('<script>alert(1)</script>Text');
    testSuite.assert(
      !result.includes('<'),
      'Deve remover tags HTML perigosas'
    );
  });
  
  // Teste de cache
  testSuite.test('calcCache > Armazena e recupera', () => {
    calcCache.set('test', 42);
    testSuite.assert(
      calcCache.get('test') === 42,
      'Cache deve recuperar valor armazenado'
    );
  });
  
  // Teste de classe TransactionManager
  testSuite.test('TransactionManager > CRUD de transações', () => {
    const tm = new TransactionManager(state);
    const initialCount = state.transactions.length;
    
    const tx = tm.add({ date: '2024-01-01', type: 'expense', value: 100 });
    testSuite.assert(
      state.transactions.length === initialCount + 1,
      'Deve adicionar transação'
    );
    
    tm.delete(tx.id);
    testSuite.assert(
      state.transactions.length === initialCount,
      'Deve deletar transação'
    );
  });
};

/**
 * Debug Console Aprimorado
 * PHASE 10: Ferramentas de diagnóstico
 */
const debugConsole = {
  // Retorna status da aplicação
  getStatus: () => ({
    transactionCount: state.transactions.length,
    categoryCount: state.categories.length,
    fixedExpenseCount: state.fixedExpenses.length,
    storageUsage: new Blob([JSON.stringify(state)]).size + ' bytes',
    lastSaved: new Date().toLocaleTimeString(),
    cacheSize: Object.keys(calcCache.data).length + ' chaves'
  }),
  
  // Valida integridade dos dados
  validate: () => {
    const issues = [];
    
    // Validar transações
    state.transactions.forEach((tx, idx) => {
      if (!tx.id) issues.push(`Transação [${idx}]: falta ID`);
      if (!tx.date) issues.push(`Transação [${idx}]: falta data`);
      if (!tx.type) issues.push(`Transação [${idx}]: falta tipo`);
      if (tx.value <= 0) issues.push(`Transação [${idx}]: valor inválido`);
    });
    
    // Validar categorias
    state.categories.forEach((cat, idx) => {
      if (!cat.id) issues.push(`Categoria [${idx}]: falta ID`);
      if (!cat.name) issues.push(`Categoria [${idx}]: falta nome`);
    });
    
    return {
      valid: issues.length === 0,
      issues,
      message: issues.length === 0 ? '✅ Dados válidos' : `❌ ${issues.length} problemas encontrados`
    };
  },
  
  // Gera relatório de performance
  getPerformanceReport: () => ({
    timestamp: new Date().toISOString(),
    applicationState: debugConsole.getStatus(),
    dataIntegrity: debugConsole.validate(),
    memoryEstimate: new Blob([JSON.stringify(state)]).size,
    cacheHitRate: 'N/A' // Seria trackado com instrumentação adicional
  }),
  
  // Exporta diagnóstico completo para debug
  exportDiagnostic: () => {
    const diagnostic = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      storage: debugConsole.getStatus(),
      validation: debugConsole.validate(),
      state: JSON.stringify(state, null, 2)
    };
    console.log('%c📑 Diagnóstico Completo', 'font-size: 14px; font-weight: bold');
    console.table(diagnostic.storage);
    return diagnostic;
  }
};

// ==================== FIM TESTES - PHASE 10 ====================


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
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    state = {
      settings: { ...defaultSettings },
      categories: [...defaultCategories],
      transactions: [],
      fixedExpenses: [],
      deletedItems: [],
      sort: { key: 'date', order: 'desc' },
      pagination: { page: 1, pageSize: 10 },
      filters: { year: 2026, month: 4, type: 'all', search: '', category: 'all' },
      reportYear: 2026
    };
    saveState();
    return;
  }
  const parsed = safeParse(saved, null);
  if (parsed && typeof parsed === 'object') {
    state = {
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      categories: Array.isArray(parsed.categories) ? parsed.categories : [...defaultCategories],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      fixedExpenses: Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [],
      deletedItems: Array.isArray(parsed.deletedItems) ? parsed.deletedItems : [],
      sort: parsed.sort || { key: 'date', order: 'desc' },
      pagination: parsed.pagination || { page: 1, pageSize: 10 },
      filters: parsed.filters || { year: 2026, month: 4, type: 'all', search: '', category: 'all' },
      reportYear: parsed.reportYear || 2026
    };
    
    // Migrar dados antigos de gastos fixos (compatibilidade)
    state.fixedExpenses = state.fixedExpenses.map((item) => ({
      ...item,
      type: item.type || 'fixed',
      duration: item.duration || null,
      startMonth: item.startMonth || null
    }));
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
    modal.classList.add('active');
  }
}

function performAutomaticBackup() {
  const backupProgressModal = document.getElementById('backupProgressModal');
  if (backupProgressModal) {
    backupProgressModal.classList.add('active');
  }
  
  setTimeout(() => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.download = `LuminaFin-auto-backup-${timestamp}.json`;
    link.click();
    
    if (backupProgressModal) {
      backupProgressModal.classList.remove('active');
    }
    showToast('✓ Backup automático realizado com sucesso!', 'success');
  }, 500);
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
  
  titleElement.innerHTML = `<i class="fa-solid fa-skull" style="color: #dc2626;"></i> ${title}`;
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
    modal.classList.remove('active');
    if (callback && typeof callback === 'function') {
      callback();
    }
  });
  
  modal.classList.add('active');
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
      tutorialModal.classList.add('active');
      
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
    cardInitialBalance: document.getElementById('cardInitialBalance'),
    cardIncome: document.getElementById('cardIncome'),
    cardExpense: document.getElementById('cardExpense'),
    cardTopExpense: document.getElementById('cardTopExpense'),
    cardDailyAverage: document.getElementById('cardDailyAverage'),
    cardSavedRate: document.getElementById('cardSavedRate'),
    chartIncomeExpense: document.getElementById('chartIncomeExpense'),
    chartCategorySpending: document.getElementById('chartCategorySpending'),
    chartBalanceTrend: document.getElementById('chartBalanceTrend'),
    chartTopExpenses: document.getElementById('chartTopExpenses'),
    transactionSearch: document.getElementById('transactionSearch'),
    transactionYear: document.getElementById('transactionYear'),
    transactionMonth: document.getElementById('transactionMonth'),
    transactionTypeFilter: document.getElementById('transactionTypeFilter'),
    transactionCategory: document.getElementById('transactionCategory'),
    transactionCategoryFilter: document.getElementById('transactionCategoryFilter'),
    transactionPageSize: document.getElementById('transactionPageSize'),
    transactionTableBody: document.querySelector('#transactionTable tbody'),
    transactionPagination: document.getElementById('transactionPagination'),
    categorySearch: document.getElementById('categorySearch'),
    categoryTableBody: document.querySelector('#categoryTable tbody'),
    fixedTableBody: document.querySelector('#fixedTable tbody'),
    reportYear: document.getElementById('reportYear'),
    reportTopExpenses: document.getElementById('reportTopExpenses'),
    spendingHeatmap: document.getElementById('spendingHeatmap'),
    chartReportCategory: document.getElementById('chartReportCategory'),
    chartReportMonthly: document.getElementById('chartReportMonthly'),
    chartReportPayment: document.getElementById('chartReportPayment'),
    reportTopIncomeMonth: document.getElementById('reportTopIncomeMonth'),
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
    savedScenarios: document.getElementById('savedScenarios')
  };

  loadState();
  applyTheme();
  buildNavigation();
  populateSelects();
  renderDashboard();
  renderTransactionTable();
  renderCategoryTable();
  renderFixedTable();
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
  dom.navLinks.forEach((button) => {
    button.addEventListener('click', () => {
      dom.navLinks.forEach((nav) => nav.classList.remove('active'));
      button.classList.add('active');
      const target = button.dataset.target;

      // Mostrar aviso ao acessar admin
      if (target === 'admin') {
        showAdminWarning();
      }

      document.querySelectorAll('.page-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === target);
      });
      dom.pageTitle.textContent = button.textContent.trim();

      // Renderizar página específica se necessário
      if (target === 'reports') {
        renderReportPage();
      } else if (target === 'help') {
        renderHelpPage();
      }
    });
  });
}

function populateSelects() {
  // Get unique years that have transactions
  const yearsWithData = Array.from(new Set(state.transactions.map((item) => new Date(item.date).getFullYear()))).sort((a,b)=>a-b);

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
}

function updateMonthSelectsForYear(yearSelector, monthSelector) {
  // Get months that have data for the selected year (or all years if "all" is selected)
  const selectedYear = yearSelector.value;
  let monthsWithData;

  if (selectedYear === 'all') {
    // Get all unique month-year combinations
    const monthYearPairs = state.transactions.map((item) => {
      const date = new Date(item.date);
      return `${date.getFullYear()}-${date.getMonth() + 1}`;
    });
    monthsWithData = Array.from(new Set(monthYearPairs)).map(pair => {
      const [year, month] = pair.split('-').map(Number);
      return { year, month };
    });
  } else {
    // Get months for specific year
    const year = Number(selectedYear);
    monthsWithData = Array.from(new Set(
      state.transactions
        .filter(item => new Date(item.date).getFullYear() === year)
        .map(item => new Date(item.date).getMonth() + 1)
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
  const categoryOptions = categories.map((cat) => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
  dom.transactionCategory.innerHTML = categoryOptions;
  dom.fixedCategory.innerHTML = categories.filter((cat) => cat.type !== 'income').map((cat) => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
  dom.transactionCategoryFilter.innerHTML = `<option value="all">Todas</option>${categoryOptions}`;
}

function getCurrentFilters() {
  const year = dom.dashboardYear.value === 'all' ? new Date().getFullYear() : Number(dom.dashboardYear.value);
  const month = dom.dashboardMonth.value === 'all' ? new Date().getMonth() + 1 : Number(dom.dashboardMonth.value);
  return { year, month };
}

/**
 * Renderiza dashboard com cards e gráficos
 * @function renderDashboard
 * @description Atualiza cards de saldo/renda/gasto e contrói gráficos
 * @returns {void}
 */
function renderDashboard() {
  const { year, month } = getCurrentFilters();
  // Save the actual selected values (including 'all')
  state.filters.year = dom.dashboardYear.value;
  state.filters.month = dom.dashboardMonth.value;
  saveState();
  
  // Usar cache para cálculos do dashboard
  const cacheKey = calcCache.key('dashboardData', year, month);
  let dashboardData = calcCache.get(cacheKey);
  
  if (!dashboardData) {
    const monthlyTransactions = state.transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return date.getFullYear() === year && date.getMonth() + 1 === month;
    });

    // Calcular saldo inicial (transações com subcategoria "Saldo inicial")
    const initialBalance = monthlyTransactions
      .filter((item) => item.subcategory && item.subcategory.toLowerCase() === 'saldo inicial')
      .reduce((sum, item) => sum + item.value, 0);

    const incomeTotal = monthlyTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.value, 0);
    const expenseTotal = monthlyTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.value, 0);
    
    // Calcular saldo do mês anterior como base
    const previousMonthBalance = calculateBalanceUpToPreviousMonth(year, month);
    
    // Saldo atual = saldo do mês anterior + receitas do mês - despesas do mês
    const balance = previousMonthBalance + incomeTotal - expenseTotal;
    
    const topExpense = monthlyTransactions.filter((item) => item.type === 'expense').reduce((max, item) => Math.max(max, item.value), 0);
    const daysInMonth = new Date(year, month, 0).getDate();
    const average = expenseTotal / Math.max(daysInMonth, 1);
    const savedRate = incomeTotal ? Math.max(0, Math.round(((incomeTotal - expenseTotal) / incomeTotal) * 100)) : 0;
    
    dashboardData = {
      initialBalance,
      incomeTotal,
      expenseTotal,
      balance,
      topExpense,
      average,
      savedRate,
      previousMonthBalance
    };
    
    calcCache.set(cacheKey, dashboardData);
  }

  // Aplicar dados cacheados
  dom.cardBalance.textContent = formatCurrency(dashboardData.balance);
  dom.cardInitialBalance.textContent = formatCurrency(dashboardData.previousMonthBalance);
  dom.cardIncome.textContent = formatCurrency(dashboardData.incomeTotal);
  dom.cardExpense.textContent = formatCurrency(dashboardData.expenseTotal);
  dom.cardTopExpense.textContent = formatCurrency(dashboardData.topExpense);
  dom.cardDailyAverage.textContent = formatCurrency(dashboardData.average);
  dom.cardSavedRate.textContent = `${dashboardData.savedRate}%`;
  
  // PHASE 11: Verificar limites de gastos
  notificationSystem.checkBudgetLimits(year, month);
  
  buildCharts(year, month);
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
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: chartScaleOptions(true) }
  });
}

function sumByPeriod(year, month, type) {
  // Usar cache para evitar recálculos
  const cacheKey = calcCache.key('sumByPeriod', year, month, type);
  let cached = calcCache.get(cacheKey);
  if (cached !== null) return cached;
  
  const result = state.transactions.reduce((total, item) => {
    const date = new Date(item.date);
    return date.getFullYear() === year && date.getMonth() + 1 === month && item.type === type ? total + item.value : total;
  }, 0);
  
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
    const date = new Date(item.date);
    if (date.getFullYear() === year && date.getMonth() + 1 === month && item.type === 'expense') {
      const category = getCategory(item.category)?.name || item.category;
      result[category] = (result[category] || 0) + item.value;
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
      const date = new Date(item.date);
      return date.getFullYear() === year && date.getMonth() + 1 === month && item.type === 'expense';
    })
    .sort((a, b) => b.value - a.value)
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

function chartScaleOptions(_horizontal = false) {
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
    const date = new Date(transaction.date);
    const yearMatch = year === 'all' || date.getFullYear() === Number(year);
    const monthMatch = month === 'all' || date.getMonth() + 1 === Number(month);
    const typeMatch = typeFilter === 'all' || transaction.type === typeFilter;
    const categoryMatch = categoryFilter === 'all' || transaction.category === categoryFilter;
    const textMatch = [transaction.description, transaction.subcategory, getCategory(transaction.category)?.name || '']
      .join(' ').toLowerCase().includes(search);
    return yearMatch && monthMatch && typeMatch && categoryMatch && textMatch;
  });

  const sorted = filtered.sort((a, b) => {
    const key = state.sort.key;
    const direction = state.sort.order === 'asc' ? 1 : -1;
    if (key === 'value') return (a.value - b.value) * direction;
    if (key === 'date') return (new Date(a.date) - new Date(b.date)) * direction;
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
  dom.transactionTableBody.innerHTML = pageData.map((item) => {
    const category = getCategory(item.category);
    const categoryLabel = category ? `${category.icon} ${sanitizeHtml(category.name)}` : sanitizeHtml(item.category);
    const safeSubcategory = sanitizeHtml(item.subcategory || '-');
    const safeDescription = sanitizeHtml(item.description);
    const safePayment = sanitizeHtml(item.payment || '-');
    return `<tr>
      <td>${item.date}</td>
      <td>${categoryLabel}</td>
      <td>${safeSubcategory}</td>
      <td>${item.type === 'income' ? 'Entrada' : 'Saída'}</td>
      <td>${safeDescription}</td>
      <td>${formatCurrency(item.value)}</td>
      <td>${safePayment}</td>
      <td>${formatStatus(item.status)}</td>
      <td>
        <button type="button" class="secondary-button" data-action="edit" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="danger-button" data-action="delete" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  buildPagination(Math.ceil(sorted.length / pageSize));
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

function renderCategoryTable() {
  const search = dom.categorySearch.value.trim().toLowerCase();
  const categories = state.categories.filter((category) => category.name.toLowerCase().includes(search));
  // PHASE 2: Sanitizar dados renderizados
  dom.categoryTableBody.innerHTML = categories.map((category) => {
    const safeName = sanitizeHtml(category.name);
    const subcats = category.subcategories?.map(s => sanitizeHtml(s)).join(', ') || '-';
    const limit = category.limit ? formatCurrency(category.limit) : '-';
    const actions = `<button type="button" class="secondary-button" data-action="edit-category" data-id="${category.id}"><i class="fa-solid fa-pen"></i></button><button type="button" class="danger-button" data-action="delete-category" data-id="${category.id}"><i class="fa-solid fa-trash"></i></button>`;
    return `<tr><td>${category.icon} ${safeName}</td><td>${category.type === 'income' ? 'Entrada' : category.type === 'expense' ? 'Saída' : 'Ambos'}</td><td>${subcats}</td><td>${category.icon}</td><td>${limit}</td><td>${actions}</td></tr>`;
  }).join('');
}

function renderFixedTable() {
  const today = new Date();
  const totalFixed = state.fixedExpenses.reduce((sum, item) => sum + item.value, 0);
  if (dom.fixedTotalSummary) dom.fixedTotalSummary.textContent = formatCurrency(totalFixed);

  // PHASE 2: Sanitizar dados renderizados
  dom.fixedTableBody.innerHTML = state.fixedExpenses.map((item) => {
    const category = getCategory(item.category);
    const dueDate = new Date(today.getFullYear(), today.getMonth(), item.day);
    const nearDue = item.active && daysBetween(today, dueDate) <= 5 && daysBetween(today, dueDate) >= 0;
    const typeLabel = item.type === 'fixed' ? '🔄 Fixo' : '📅 Variável';
    const durationText = item.type === 'variable' && item.duration ? `${item.duration} mês${item.duration > 1 ? 'es' : ''}` : '-';
    const safeDescription = sanitizeHtml(item.description);
    const categoryName = category ? sanitizeHtml(category.name) : sanitizeHtml(item.category);
    return `<tr>
      <td>${safeDescription}</td>
      <td>${category ? `${category.icon} ${categoryName}` : categoryName}</td>
      <td>${formatCurrency(item.value)}</td>
      <td>${typeLabel}</td>
      <td>${item.day}</td>
      <td>${durationText}</td>
      <td>${item.active ? 'Sim' : 'Não'}</td>
      <td>
        <button type="button" class="secondary-button" data-action="edit-fixed" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="danger-button" data-action="delete-fixed" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function daysBetween(a, b) {
  const diff = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
  return diff;
}

function renderReportPage() {
  const year = dom.reportYear.value === 'all' ? new Date().getFullYear() : Number(dom.reportYear.value);
  state.reportYear = dom.reportYear.value; // Save the actual selected value
  renderAnnualCategoryReport(year);
  renderMonthlyComparison(year);
  renderPaymentDistribution(year);
  renderTopExpenses(year);
  renderTopIncomeMonth(year);
  renderHeatmap(year);
  renderProjections(year);
  renderProjectionDashboard();
  renderPurchaseProjection();
  renderBalanceProjection();
  // Novas funcionalidades
  renderSavingsGoalProgress();
  renderRiskAnalysis();
  renderTrendAnalysis();
  renderSavedScenarios();
  checkSmartAlerts();
  saveState();
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
  const savingsRate = totalIncome > 0 ? ((totalBalance / totalIncome) * 100) : 0;
  
  // Análise de tendência ao longo dos meses
  let negativeMonths = 0;
  let cumulativeBalance = forecast.length > 0 ? forecast[0].projectedBalance : 0;
  forecast.forEach((item, index) => {
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
        <div style="margin-top: 0.5rem; color: #94a3b8; font-size: 0.85rem;">Taxa de economia: ${savingsRate.toFixed(1)}%</div>
      </div>
    </div>
    <div style="margin-top: 1rem; padding: 1rem; background: rgba(100, 116, 139, 0.1); border-radius: 8px;">
      <div><strong>⚠️ Análise de Risco</strong></div>
      <div style="margin-top: 0.5rem;">Meses com projeção negativa: <span style="color: ${negativeMonths > 0 ? '#ef4444' : '#22c55e'}; font-weight: 600;">${negativeMonths}/${forecast.length}</span></div>
      <div style="margin-top: 0.25rem;">Saldo mensal médio: <span style="color: ${avgMonthlyNet >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 600;">${formatCurrency(avgMonthlyNet)}</span></div>
    </div>
  `;

  listElement.innerHTML = forecast.map((item, index) => {
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
  state.transactions.filter((item) => new Date(item.date).getFullYear() === year).forEach((item) => {
    const label = item.type === 'expense' ? getCategory(item.category)?.name || item.category : 'Receitas';
    result[label] = (result[label] || 0) + item.value;
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
    const totalIncome = sumByPeriod(year, index + 1, 'income');
    const totalExpense = sumByPeriod(year, index + 1, 'expense');
    return totalIncome - totalExpense;
  });
  charts.reportMonthly = renderChart(charts.reportMonthly, dom.chartReportMonthly, {
    type: 'bar',
    data: { labels: labelsMonths, datasets: [{ label: 'Saldo', data: monthly, backgroundColor: 'rgba(56,189,248,0.75)' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: chartScaleOptions() }
  });
}

function renderPaymentDistribution(year) {
  const breakdown = {};
  state.transactions.filter((item) => new Date(item.date).getFullYear() === year).forEach((item) => {
    breakdown[item.payment || 'Outros'] = (breakdown[item.payment || 'Outros'] || 0) + item.value;
  });
  const items = Object.entries(breakdown);
  charts.reportPayment = renderChart(charts.reportPayment, dom.chartReportPayment, {
    type: 'pie',
    data: { labels: items.map((item) => item[0]), datasets: [{ data: items.map((item) => item[1]), backgroundColor: generatePalette(items.length) }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#f8fafc' } } } }
  });
}

function renderTopExpenses(year) {
  const items = state.transactions.filter((item) => new Date(item.date).getFullYear() === year && item.type === 'expense')
    .sort((a, b) => b.value - a.value).slice(0, 10);
  dom.reportTopExpenses.innerHTML = items.map((item, index) => `<div><strong>#${index + 1}</strong> ${item.description} <span>${formatCurrency(item.value)}</span></div>`).join('') || '<div>Nenhum gasto registrado neste ano.</div>';
}

function renderTopIncomeMonth(year) {
  // Calculate total income for each month
  const monthlyIncome = {};
  state.transactions.filter((item) => new Date(item.date).getFullYear() === year && item.type === 'income').forEach((item) => {
    const month = new Date(item.date).getMonth() + 1;
    monthlyIncome[month] = (monthlyIncome[month] || 0) + item.value;
  });

  // Find the month with highest income
  let topMonth = null;
  let maxIncome = 0;
  Object.entries(monthlyIncome).forEach(([month, income]) => {
    if (income > maxIncome) {
      maxIncome = income;
      topMonth = Number(month);
    }
  });

  if (topMonth) {
    dom.reportTopIncomeMonth.innerHTML = `<div><strong>${labelsMonths[topMonth - 1]}</strong> <span>${formatCurrency(maxIncome)}</span></div>`;
  } else {
    dom.reportTopIncomeMonth.innerHTML = '<div>Nenhuma receita registrada neste ano.</div>';
  }
}

function renderHeatmap(year) {
  const matrix = Array.from({ length: 31 }, () => 0);
  state.transactions.filter((item) => new Date(item.date).getFullYear() === year && item.type === 'expense').forEach((item) => {
    const day = new Date(item.date).getDate() - 1;
    matrix[day] += item.value;
  });
  const maxValue = Math.max(...matrix, 1);
  dom.spendingHeatmap.innerHTML = matrix.map((value, index) => {
    const level = value / maxValue;
    const alpha = 0.12 + level * 0.78;
    return `<div class="heatmap-cell" style="background: rgba(239,68,68,${alpha});">${index + 1}<br>${value ? formatCurrency(value) : '-'}</div>`;
  }).join('');
}

function renderLimitsTable() {
  dom.limitTableBody.innerHTML = state.categories.map((category) => {
    const monthlySpent = state.transactions.filter((item) => item.type === 'expense' && item.category === category.id && new Date(item.date).getFullYear() === state.filters.year && new Date(item.date).getMonth() + 1 === state.filters.month).reduce((sum, item) => sum + item.value, 0);
    const usage = category.limit ? Math.min(100, Math.round((monthlySpent / category.limit) * 100)) : 0;
    const status = category.limit ? `${usage}% usado` : 'Sem limite';
    return `<tr><td>${category.icon} ${category.name}</td><td><input type="number" min="0" data-category="${category.id}" value="${category.limit}" class="limit-input"></td><td>${status}</td></tr>`;
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
      
      // PHASE 2: Validar estrutura e conteúdo
      // Validar categories
      if (parsed.categories && Array.isArray(parsed.categories)) {
        for (let cat of parsed.categories) {
          if (!cat.id || !cat.name || !cat.type) throw new Error('Categoria inválida');
          if (!['income', 'expense'].includes(cat.type)) throw new Error('Tipo de categoria inválido');
          if (cat.name.length > 50) throw new Error('Nome de categoria muito longo');
          if (cat.limit && (cat.limit < 0 || cat.limit > 999999.99)) throw new Error('Limite de categoria inválido');
        }
      }
      
      // Validar transactions
      if (parsed.transactions && Array.isArray(parsed.transactions)) {
        for (let tx of parsed.transactions) {
          if (!tx.id || !tx.date || !tx.type || tx.value === undefined) throw new Error('Transação inválida');
          if (!['income', 'expense'].includes(tx.type)) throw new Error('Tipo de transação inválido');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) throw new Error('Data de transação inválida');
          if (tx.value <= 0 || tx.value > 999999.99) throw new Error('Valor inválido');
          if (tx.description && tx.description.length > 200) throw new Error('Descrição muito longa');
        }
      }
      
      // Validar fixedExpenses
      if (parsed.fixedExpenses && Array.isArray(parsed.fixedExpenses)) {
        for (let fx of parsed.fixedExpenses) {
          if (!fx.id || !fx.description || fx.value === undefined) throw new Error('Gasto fixo inválido');
          if (fx.value <= 0 || fx.value > 999999.99) throw new Error('Valor de gasto fixo inválido');
          if (fx.day < 1 || fx.day > 28) throw new Error('Dia inválido');
          if (!['fixed', 'variable'].includes(fx.type || 'fixed')) throw new Error('Tipo de gasto inválido');
        }
      }
      
      state = {
        settings: parsed.settings || defaultSettings,
        categories: Array.isArray(parsed.categories) ? parsed.categories : defaultCategories,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        fixedExpenses: Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [],
        sort: parsed.sort || state.sort,
        pagination: parsed.pagination || state.pagination,
        filters: parsed.filters || state.filters,
        reportYear: parsed.reportYear || state.reportYear
      };
      
      // Migrar dados antigos de gastos fixos
      state.fixedExpenses = state.fixedExpenses.map((item) => ({
        ...item,
        type: item.type || 'fixed',
        duration: item.duration || null,
        startMonth: item.startMonth || null
      }));
      
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
  const menuOpen = document.body.classList.contains('menu-open');
  if (!menuOpen) return;
  document.body.classList.remove('menu-open');
  updateMenuToggleButton(false);
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
  
  if (document.getElementById('openAddTransaction')) document.getElementById('openAddTransaction').addEventListener('click', () => openTransactionModal());
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
      state.settings.currency = e.target.value;
      saveState();
      renderAllUI();
      showToast(`💱 Moeda alterada para ${currencySettings[e.target.value].name}`, 'success');
    });
    // Carregar moeda salva
    document.getElementById('currencySelect').value = state.settings.currency || 'BRL';
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
  if (document.getElementById('categoryForm')) document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
  if (document.getElementById('fixedForm')) document.getElementById('fixedForm').addEventListener('submit', handleFixedSubmit);
  if (document.getElementById('fixedType')) document.getElementById('fixedType').addEventListener('change', toggleDurationField);
  document.addEventListener('click', handleTableActions);
  document.addEventListener('input', handleLimitInputs);
  
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
}

function handleLimitInputs(event) {
  if (!event.target.matches('.limit-input')) return;
  const categoryId = event.target.dataset.category;
  const value = Number(event.target.value);
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  category.limit = value;
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
function openTransactionModal(transaction = null) {
  // PHASE 3: Usar funções auxiliares para reduzir duplicação
  const modal = document.getElementById('transactionModal');
  modal.classList.add('active');
  const title = transaction ? 'Editar lançamento' : 'Novo lançamento';
  document.getElementById('transactionModalTitle').textContent = title;
  
  const categoryId = transaction?.category || state.categories.find((cat) => cat.type === 'expense')?.id || '';
  setFormValues({
    transactionDate: transaction?.date || new Date().toISOString().slice(0, 10),
    transactionType: transaction?.type || 'expense',
    transactionCategory: categoryId,
    transactionSubcategory: transaction?.subcategory || '',
    transactionValue: transaction?.value || '',
    transactionPayment: transaction?.payment || '',
    transactionStatus: transaction?.status || 'paid',
    transactionDescription: transaction?.description || ''
  });
  modal.dataset.editId = transaction?.id || '';
}

function openInitialBalanceModal() {
  // PHASE 3: Usar funções auxiliares
  const modal = document.getElementById('transactionModal');
  modal.classList.add('active');
  document.getElementById('transactionModalTitle').textContent = 'Adicionar saldo inicial';
  
  const categoryId = state.categories.find((cat) => cat.name.toLowerCase().includes('saldo') || cat.name.toLowerCase().includes('outros'))?.id || state.categories.find((cat) => cat.type === 'both')?.id || '';
  setFormValues({
    transactionDate: new Date().toISOString().slice(0, 10),
    transactionType: 'income',
    transactionCategory: categoryId,
    transactionSubcategory: 'Saldo inicial',
    transactionValue: '',
    transactionPayment: 'Saldo',
    transactionStatus: 'paid',
    transactionDescription: 'Saldo inicial do mês'
  });
  modal.dataset.editId = '';
}

function closeModals() {
  document.querySelectorAll('.modal.active').forEach((modal) => modal.classList.remove('active'));
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

  // PHASE 2: Validação Rigorosa
  if (!date || !category || !description || !value) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  // Validar formato de data (YYYY-MM-DD)
  if (!validateInput('date', date)) {
    showToast('Data deve estar no formato YYYY-MM-DD.', 'error');
    return;
  }

  // Validar se data não é no futuro
  const txDate = new Date(date);
  if (txDate > new Date()) {
    showToast('Data não pode estar no futuro.', 'error');
    return;
  }

  // Validar valor (numérico, positivo, limite máximo R$999.999,99)
  if (!validateInput('currency', value.toString())) {
    showToast('Valor deve ser numérico e positivo (máx: 999.999,99).', 'error');
    return;
  }

  // Validar range de valor
  if (value <= 0 || value > 999999.99) {
    showToast('Valor deve estar entre 0,01 e 999.999,99.', 'error');
    return;
  }

  // Validar descrição (máx 200 caracteres, sem XSS)
  if (description.length > 200) {
    showToast('Descrição deve ter no máximo 200 caracteres.', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9\s\-.,()àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ]+$/.test(description)) {
    showToast('Descrição contém caracteres inválidos.', 'error');
    return;
  }

  // Validar subcategoria se preenchida
  if (subcategory && subcategory.length > 100) {
    showToast('Subcategoria deve ter no máximo 100 caracteres.', 'error');
    return;
  }

  // Validar payment (máx 50 caracteres)
  if (payment && payment.length > 50) {
    showToast('Método de pagamento deve ter no máximo 50 caracteres.', 'error');
    return;
  }

  // Validar que categoria existe
  if (!state.categories.find(cat => cat.id === category)) {
    showToast('Categoria selecionada não existe.', 'error');
    return;
  }

  // Validar type
  if (!['income', 'expense'].includes(type)) {
    showToast('Tipo de transação inválido.', 'error');
    return;
  }

  // Sanitizar descrição
  const safeDescription = sanitizeHtml(description);
  const safeSubcategory = sanitizeHtml(subcategory);
  const safePayment = sanitizeHtml(payment);

  const record = { id: id || createId(), date, type, category, subcategory: safeSubcategory, value, payment: safePayment, status, description: safeDescription };
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
  modal.classList.add('active');
  const title = category ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('categoryModalTitle').textContent = title;
  
  setFormValues({
    categoryName: category?.name || '',
    categoryType: category?.type || 'expense',
    categoryIcon: category?.icon || '',
    categorySubcategories: category?.subcategories?.join(', ') || '',
    categoryLimit: category?.limit || 0
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
  if (!id && state.categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
    showToast('Categoria com este nome já existe.', 'error');
    return;
  }

  // Validar type
  if (!['income', 'expense'].includes(type)) {
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

  // Validar icon (máx 2 caracteres emoji ou símbolo)
  if (icon.length > 2) {
    showToast('Ícone deve ser um emoji ou símbolo simples.', 'error');
    return;
  }

  // Sanitizar nome
  const safeName = sanitizeHtml(name);
  const safeSubcategories = subcategories.map(sub => sanitizeHtml(sub));

  const record = { id: id || createId(), name: safeName, type, icon, subcategories: safeSubcategories, limit, preset: false };
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
  modal.classList.add('active');
  const title = item ? 'Editar gasto' : 'Novo gasto';
  document.getElementById('fixedModalTitle').textContent = title;
  
  const categoryId = item?.category || state.fixedExpenses[0]?.category || state.categories.find((cat)=>cat.type==='expense')?.id || '';
  setFormValues({
    fixedDescription: item?.description || '',
    fixedCategory: categoryId,
    fixedValue: item?.value || '',
    fixedDay: item?.day || 1,
    fixedType: item?.type || 'fixed',
    fixedDuration: item?.duration || '',
    fixedActive: item?.active ? 'true' : 'true'
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
  const startMonth = type === 'variable' ? new Date().toISOString().slice(0, 7) : null; // YYYY-MM

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

  const record = { id: id || createId(), description: safeDescription, category, value, day, active, type, duration, startMonth };
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
  if (type === 'edit') {
    const transaction = state.transactions.find((item) => item.id === id);
    if (transaction) openTransactionModal(transaction);
    return;
  }
  if (type === 'delete') {
    if (!confirm('Deseja excluir este lançamento?')) return;
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
    return;
  }
  if (type === 'edit-category') {
    const category = state.categories.find((item) => item.id === id);
    if (category) openCategoryModal(category);
    return;
  }
  if (type === 'delete-category') {
    if (!confirm('Deseja excluir esta categoria? Isso pode afetar lançamentos.')) return;
    const category = state.categories.find((item) => item.id === id);
    if (category) {
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
    return;
  }
  if (type === 'edit-fixed') {
    const fixed = state.fixedExpenses.find((item) => item.id === id);
    if (fixed) openFixedModal(fixed);
    return;
  }
  if (type === 'delete-fixed') {
    if (!confirm('Excluir este gasto fixo?')) return;
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
    return;
  }
}

function applyFixedExpenses() {
  const now = new Date();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const existingIds = new Set(state.transactions.map((item) => `${item.category}-${item.description}-${item.date}`));
  let added = 0;
  
  state.fixedExpenses.filter((item) => item.active).forEach((fixed) => {
    // Verificar se é gasto variável e se já expirou
    if (fixed.type === 'variable' && fixed.startMonth && fixed.duration) {
      const startDate = new Date(fixed.startMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + fixed.duration, 0);
      if (now > endDate) {
        return; // Gasto já expirou, não lançar
      }
    }
    
    const date = new Date(now.getFullYear(), now.getMonth(), fixed.day).toISOString().slice(0, 10);
    const key = `${fixed.category}-${fixed.description}-${date}`;
    if (!existingIds.has(key)) {
      state.transactions.push({ id: createId(), date, category: fixed.category, subcategory: fixed.description, type: 'expense', description: fixed.description, value: fixed.value, payment: 'Débito', status: 'paid' });
      existingIds.add(key);
      added += 1;
    }
  });
  
  saveState();
  renderTransactionTable();
  renderDashboard();
  renderReportPage();
  updateRawEditor();
  showToast(`${added} gastos lançados para o mês atual.`, 'success');
}

function exportReport(format) {
  const year = dom.reportYear.value === 'all' ? new Date().getFullYear() : Number(dom.reportYear.value);
  const filteredTransactions = state.transactions.filter((item) => new Date(item.date).getFullYear() === year);
  
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
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'LuminaFin-backup.json';
  link.click();
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
    state = {
      settings: parsed.settings || defaultSettings,
      categories: Array.isArray(parsed.categories) ? parsed.categories : defaultCategories,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      fixedExpenses: Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [],
      sort: parsed.sort || state.sort,
      pagination: parsed.pagination || state.pagination,
      filters: parsed.filters || state.filters,
      reportYear: parsed.reportYear || state.reportYear
    };
    
    // Migrar dados antigos de gastos fixos
    state.fixedExpenses = state.fixedExpenses.map((item) => ({
      ...item,
      type: item.type || 'fixed',
      duration: item.duration || null,
      startMonth: item.startMonth || null
    }));
    
    saveState();
    applyTheme();
    populateSelects();
    renderDashboard();
    renderTransactionTable();
    renderCategoryTable();
    renderFixedTable();
    renderReportPage();
    renderLimitsTable();
    showToast('JSON aplicado com sucesso.', 'success');
  } catch (error) {
    console.error(error);
    showToast('Erro ao aplicar JSON. Verifique a sintaxe.', 'error');
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

// Estado para cenários salvos e metas
let scenarios = JSON.parse(localStorage.getItem('luminafin_scenarios') || '[]');
let savingsGoals = JSON.parse(localStorage.getItem('luminafin_goals') || '[]');

// Sistema de abas nos relatórios
function initReportTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const tabId = button.dataset.tab;
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });
}

// Renderizar cenários salvos
function renderSavedScenarios() {
  const container = dom.savedScenarios;
  if (!container) return;

  if (scenarios.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 2rem;">Nenhum cenário salvo ainda.</div>';
    return;
  }

  container.innerHTML = scenarios.map((scenario, index) => `
    <div class="scenario-item">
      <h5>${scenario.name}</h5>
      <p>${scenario.description}</p>
      <div class="scenario-actions">
        <button class="secondary-button" onclick="loadScenario(${index})">Carregar</button>
        <button class="danger-button" onclick="deleteScenario(${index})">Excluir</button>
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

  scenarios.push(scenario);
  localStorage.setItem('luminafin_scenarios', JSON.stringify(scenarios));

  dom.scenarioName.value = '';
  dom.scenarioDescription.value = '';

  renderSavedScenarios();
  showToast('Cenário salvo com sucesso!', 'success');
}

// Carregar cenário
function loadScenario(index) {
  const scenario = scenarios[index];
  if (!scenario) return;

  // Confirmar carregamento
  if (!confirm(`Carregar cenário "${scenario.name}"? Isso substituirá os dados atuais.`)) {
    return;
  }

  // Aplicar dados do cenário
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

  showToast(`Cenário "${scenario.name}" carregado!`, 'success');
}

// Excluir cenário
function deleteScenario(index) {
  if (!confirm('Excluir este cenário permanentemente?')) return;

  scenarios.splice(index, 1);
  localStorage.setItem('luminafin_scenarios', JSON.stringify(scenarios));
  renderSavedScenarios();
  showToast('Cenário excluído.', 'success');
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

  savingsGoals = [goal]; // Apenas uma meta ativa por vez
  localStorage.setItem('luminafin_goals', JSON.stringify(savingsGoals));

  dom.monthlySavingsGoal.value = '';
  dom.goalDeadline.value = 12;

  renderSavingsGoalProgress();
  showToast('Meta de poupança definida!', 'success');
}

function renderSavingsGoalProgress() {
  const container = dom.savingsGoalProgress;
  if (!container) return;

  if (savingsGoals.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 2rem;">Nenhuma meta definida.</div>';
    return;
  }

  const goal = savingsGoals[0];
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

  state.categories.forEach(category => {
    if (category.limit > 0) {
      const spent = state.transactions
        .filter(t => t.type === 'expense' && t.category === category.id &&
                new Date(t.date).getFullYear() === currentYear &&
                new Date(t.date).getMonth() + 1 === currentMonth)
        .reduce((sum, t) => sum + t.value, 0);

      const usagePercent = (spent / category.limit) * 100;

      if (usagePercent >= 100) {
        alerts.push({
          type: 'danger',
          message: `Limite da categoria "${category.name}" ultrapassado (${usagePercent.toFixed(0)}%).`,
          icon: '🚨'
        });
      } else if (usagePercent >= state.settings.notifyOnLimitReached) {
        alerts.push({
          type: 'warning',
          message: `Categoria "${category.name}" atingiu ${usagePercent.toFixed(0)}% do limite.`,
          icon: '⚠️'
        });
      }
    }
  });

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
      alertElement.innerHTML = `
        <i class="fa-solid fa-exclamation-triangle"></i>
        <span>${alert.icon} ${alert.message}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; cursor: pointer; margin-left: auto;">×</button>
      `;

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
    const pairsCount = Math.floor(historicalData.length / 2);
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
  const monthlyIncomes = [];

  for (let month = 1; month <= 12; month++) {
    const income = sumByPeriod(currentYear, month, 'income');
    if (income > 0) monthlyIncomes.push(income);
  }

  return monthlyIncomes.length > 0 ? monthlyIncomes.reduce((a, b) => a + b, 0) / monthlyIncomes.length : 0;
}

function calculateAverageMonthlyExpense() {
  const currentYear = new Date().getFullYear();
  const monthlyExpenses = [];

  for (let month = 1; month <= 12; month++) {
    const expense = sumByPeriod(currentYear, month, 'expense');
    if (expense > 0) monthlyExpenses.push(expense);
  }

  return monthlyExpenses.length > 0 ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length : 0;
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

window.addEventListener('DOMContentLoaded', () => {
  init();
  initNewFeatures();
});