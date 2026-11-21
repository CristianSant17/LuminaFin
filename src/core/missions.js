export const MISSION_DEFINITIONS = Object.freeze([
  { id: 'initial-balance', title: 'Registrar o saldo inicial', description: 'Informe quanto existe na conta antes dos próximos lançamentos.', kind: 'essential', action: 'balance', section: 'dashboard' },
  { id: 'categories', title: 'Revisar categorias e limites', description: 'Personalize a classificação ou ajuste um limite mensal.', kind: 'essential', action: 'categories', section: 'categories' },
  { id: 'fixed-expenses', title: 'Cadastrar gastos fixos', description: 'Prepare contas recorrentes ou parcelas conhecidas do mês.', kind: 'essential', action: 'fixed', section: 'fixed' },
  { id: 'credit-card', title: 'Configurar um cartão', description: 'Cadastre limite, fechamento e vencimento para acompanhar faturas.', kind: 'essential', action: 'cards', section: 'creditCards' },
  { id: 'coffer', title: 'Criar o primeiro cofrinho', description: 'Separe uma reserva ou objetivo com regras próprias.', kind: 'essential', action: 'coffers', section: 'coffers' },
  { id: 'first-transaction', title: 'Registrar o primeiro lançamento', description: 'Adicione uma entrada ou saída real para iniciar o histórico.', kind: 'essential', action: 'transaction', section: 'transactions' },
  { id: 'pocket-check', title: 'Simular uma compra', description: 'Use “Cabe no bolso?” para testar o impacto de uma compra.', kind: 'routine', action: 'pocket', section: 'reports' },
  { id: 'goal', title: 'Criar uma meta', description: 'Defina um objetivo de reserva ou compra.', kind: 'routine', action: 'goal', section: 'dashboard' },
  { id: 'backup', title: 'Fazer o primeiro backup', description: 'Exporte uma cópia segura do estado atual.', kind: 'routine', action: 'backup', section: 'admin' }
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
  if (Array.isArray(state?.goals) && state.goals.length > 0) completed.add('goal');
  if (Array.isArray(state?.savingsGoals) && state.savingsGoals.length > 0) completed.add('goal');
  return {
    ...missionState,
    completedIds: MISSION_DEFINITIONS
      .filter((mission) => completed.has(mission.id))
      .map((mission) => mission.id)
  };
}

export function markMissionCompleted(state, missionId) {
  if (!MISSION_DEFINITIONS.some((mission) => mission.id === missionId)) return state;
  const current = deriveMissionProgress(state);
  if (!current.completedIds.includes(missionId)) current.completedIds.push(missionId);
  current.updatedAt = new Date().toISOString();
  return { ...state, missions: current };
}
