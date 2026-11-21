export const MISSION_TRACKS = Object.freeze([
  { id: 'basics', title: 'Trilha 1 — Só o básico para começar' },
  { id: 'month', title: 'Trilha 2 — Organizar o mês' },
  { id: 'planning', title: 'Trilha 3 — Guardar e planejar' }
]);

export const MISSION_DEFINITIONS = Object.freeze([
  { id: 'initial-balance', trackId: 'basics', title: 'Registrar o saldo inicial', description: 'Informe quanto existe na conta antes dos próximos lançamentos.', action: 'balance', section: 'dashboard' },
  { id: 'first-transaction', trackId: 'basics', title: 'Adicionar o primeiro lançamento', description: 'Registre uma entrada ou saída real para iniciar seu histórico.', action: 'transaction', section: 'transactions' },
  { id: 'dashboard-check', trackId: 'basics', title: 'Conferir o Dashboard', description: 'Veja sua posição atual e os primeiros indicadores.', action: 'dashboard', section: 'dashboard' },
  { id: 'categories', trackId: 'month', title: 'Definir limites de categorias', description: 'Revise categorias e ajuste limites mensais para sua rotina.', action: 'categories', section: 'categories' },
  { id: 'fixed-expenses', trackId: 'month', title: 'Cadastrar gastos fixos e boletos', description: 'Prepare contas recorrentes ou parcelas conhecidas do mês.', action: 'fixed', section: 'fixed' },
  { id: 'credit-card', trackId: 'month', title: 'Configurar cartão de crédito', description: 'Cadastre limite, fechamento e vencimento para acompanhar faturas.', action: 'cards', section: 'creditCards' },
  { id: 'coffer', trackId: 'planning', title: 'Criar o primeiro cofrinho', description: 'Separe uma reserva ou objetivo com regras que você pode personalizar.', action: 'coffers', section: 'coffers' },
  { id: 'pocket-check', trackId: 'planning', title: 'Testar “Cabe no bolso?”', description: 'Simule uma compra e confira seu impacto antes de decidir.', action: 'pocket', section: 'reports' },
  { id: 'backup', trackId: 'planning', title: 'Fazer o primeiro backup', description: 'Exporte uma cópia local dos seus dados para guardar em segurança.', action: 'backup', section: 'admin' }
]);

export function normalizeMissionState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    completedIds: Array.isArray(source.completedIds)
      ? [...new Set(source.completedIds.filter((id) => typeof id === 'string'))]
      : [],
    dismissed: source.dismissed === true,
    minimized: source.minimized === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
  };
}

export function deriveMissionProgress(state) {
  const missionState = normalizeMissionState(state?.missions);
  const completed = new Set(missionState.completedIds);
  if (Array.isArray(state?.initialBalances) && state.initialBalances.length > 0) completed.add('initial-balance');
  if (Array.isArray(state?.categories) && state.categories.some((item) => item.preset !== true)) completed.add('categories');
  if (Array.isArray(state?.fixedExpenses) && state.fixedExpenses.length > 0) completed.add('fixed-expenses');
  if (Array.isArray(state?.creditCards) && state.creditCards.length > 0) completed.add('credit-card');
  if (Array.isArray(state?.coffers) && state.coffers.length > 0) completed.add('coffer');
  if (Array.isArray(state?.transactions) && state.transactions.some((item) => item.sourceType !== 'demo')) completed.add('first-transaction');
  return {
    ...missionState,
    completedIds: MISSION_DEFINITIONS
      .filter((mission) => completed.has(mission.id))
      .map((mission) => mission.id)
  };
}

export function getCurrentMission(state) {
  const progress = deriveMissionProgress(state);
  return MISSION_DEFINITIONS.find((mission) => !progress.completedIds.includes(mission.id)) || null;
}

export function markMissionCompleted(state, missionId) {
  if (!MISSION_DEFINITIONS.some((mission) => mission.id === missionId)) return state;
  const current = deriveMissionProgress(state);
  if (!current.completedIds.includes(missionId)) current.completedIds.push(missionId);
  current.updatedAt = new Date().toISOString();
  return { ...state, missions: current };
}
