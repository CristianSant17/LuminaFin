export const HELP_TOPICS = [
  {
    id: 'start',
    title: 'Visão geral',
    intro: 'O LuminaFin é um organizador financeiro pessoal local. Ele ajuda a registrar movimentos, planejar cenários e acompanhar metas, sem executar operações bancárias.',
    blocks: [
      { title: 'Como usar', items: ['Comece pelo saldo inicial e pelos lançamentos do período.', 'Use categorias para separar receitas e despesas.', 'Revise o Dashboard e os relatórios após registrar dados.'] },
      { title: 'Limitação importante', items: ['Os dados ficam no navegador deste dispositivo.', 'Não há ligação bancária, cartão real, investimento ou envio de dinheiro.', 'Salve backups antes de limpar dados ou trocar de navegador.'] }
    ]
  },
  {
    id: 'navigation',
    title: 'Navegação',
    intro: 'O menu lateral concentra as áreas principais. Em telas menores, use o botão de menu para abrir e fechar a navegação.',
    blocks: [
      { title: 'Áreas disponíveis', items: ['Dashboard: visão do período, composição da conta e projeções.', 'Lançamentos: cadastro, edição, filtros e status dos movimentos.', 'Categorias: classificação e limites mensais.', 'Gastos Fixos: recorrências fixas ou por duração.', 'Cofrinhos: reservas, metas e rendimentos simulados.', 'Cartões: limites, compras parceladas e faturas.', 'Relatórios: análises, cenários, metas e projeções.', 'Configurações: moeda, aparência, backup e dados.'] }
    ]
  },
  {
    id: 'balances',
    title: 'Saldo e status',
    intro: 'A conta realizada usa o saldo inicial próprio e apenas lançamentos que efetivamente impactam a conta.',
    blocks: [
      { title: 'Paid — pago', items: ['Entra no saldo realizado da conta.', 'Usa o impacto informado pelo lançamento ou pelo resgate/pagamento realizado.'] },
      { title: 'Pending — pendente', items: ['Representa uma obrigação ou entrada ainda não concluída.', 'Não entra no saldo realizado, mas pode aparecer em pendências e previsões.'] },
      { title: 'Scheduled — agendado', items: ['Representa um movimento planejado para o futuro.', 'Não entra no saldo realizado até ser convertido ou registrado como pago.'] },
      { title: 'Conta, cofrinhos e cartões', items: ['Aportes de cofrinho reduzem a conta quando pagos.', 'Resgates para a conta aumentam o saldo realizado pelo valor líquido informado.', 'Compras no cartão não reduzem a conta no ato da compra.', 'Pagar uma fatura cria uma saída paid na conta ou resgata o valor selecionado no cofrinho.'] }
    ]
  },
  {
    id: 'modules',
    title: 'Módulos',
    intro: 'Cada módulo resolve uma etapa do planejamento pessoal.',
    blocks: [
      { title: 'Dashboard', items: ['Mostra saldo realizado, saldo projetado, receitas, despesas e posição dos cofrinhos.', 'Os filtros de ano e mês alteram a visão sem mudar os dados registrados.'] },
      { title: 'Lançamentos', items: ['Permite entrada, saída e operação vinculada a cofrinho.', 'As sugestões rápidas aplicam um perfil editável antes do salvamento.', 'Compras no cartão podem usar 1x até 24x e entram nas faturas correspondentes.'] },
      { title: 'Categorias e gastos fixos', items: ['Categorias personalizadas podem receber subcategorias e limite mensal.', 'Gastos fixos indefinidos se repetem; gastos variáveis terminam após a duração informada.', 'Aplicar gastos do mês gera ocorrências pendentes ou agendadas sem duplicar o mês.'] },
      { title: 'Cofrinhos', items: ['Principal e rendimento são apresentados separadamente.', 'Taxa, teto, prazo, limite de depósito, uso em pagamentos e rendimento por dias úteis ou corridos são configuráveis.', 'Rendimentos automáticos podem ser ajustados manualmente por lançamento.'] },
      { title: 'Cartões e faturas', items: ['Uma compra compromete o limite total das parcelas até o pagamento correspondente.', 'Pagar parcela ou fatura libera apenas o valor pago.', 'A aba Faturas filtra o cartão e o ciclo e detalha compra, parcela e saldo.'] }
    ]
  },
  {
    id: 'planning',
    title: 'Metas e planejamento',
    intro: 'Metas, cenários e verificações ajudam a testar decisões antes de executar gastos.',
    blocks: [
      { title: 'Metas', items: ['Crie um objetivo com nome, valor e cor.', 'Os presets são exemplos editáveis e não exigem uma modalidade específica.', 'O progresso usa a posição atual da conta ou da estratégia configurada, conforme o recurso exibido.'] },
      { title: 'Cenários', items: ['Cenários salvam uma fotografia local para comparação futura.', 'Carregar um cenário pode alterar a visão utilizada nas projeções.', 'Eles não substituem os lançamentos reais.'] },
      { title: 'Cabe no bolso?', items: ['Informe o valor e o parcelamento para estimar o impacto mensal.', 'A análise considera saldo atual, posição mensal e cofrinhos disponíveis.', 'A sugestão é uma estimativa local, não uma recomendação financeira automática.'] },
      { title: 'Relatórios', items: ['Revisão geral, gráficos, projeções e análise de risco usam os dados registrados.', 'Compras no cartão aparecem uma vez no histórico de despesas sem abatimento adicional no caixa.'] }
    ]
  },
  {
    id: 'daily',
    title: 'Uso diário',
    intro: 'Fluxos recomendados para manter os dados consistentes.',
    blocks: [
      { title: 'Rotina curta', items: ['Registre o movimento no dia em que ocorreu.', 'Use description clara e subcategoria específica.', 'Revise pendências e faturas em aberto.', 'Faça conferência mensal antes de fechar o período.'] },
      { title: 'Presets e atalhos', items: ['Presets podem ser aplicados com um clique e todos os campos permanecem editáveis.', 'Shift+N abre novo lançamento.', 'Shift+C abre nova categoria.', 'Shift+F abre novo gasto fixo.', 'Ctrl+K ou Cmd+K abre o comando de busca rápido.'] }
    ]
  },
  {
    id: 'data',
    title: 'Dados e segurança',
    intro: 'A persistência é local e deve ser tratada como responsável pelo usuário.',
    blocks: [
      { title: 'localStorage', items: ['O estado, tema e preferências são armazenados no navegador.', 'Limpar dados do navegador remove o histórico salvo.', 'Dados em um navegador não aparecem automaticamente em outros dispositivos.'] },
      { title: 'Backup e importação', items: ['Crie backups JSON periodicamente pela seção Configurações.', 'Antes de importar, faça um backup do estado atual.', 'A importação valida estruturas, migrando dados antigos para o formato atual.'] },
      { title: 'JSON, lixeira e ações críticas', items: ['O editor JSON é avançado: alterações podem invalidar regras ou vínculos.', 'A lixeira permite recuperar alguns itens excluídos conforme a ação disponível.', 'Limpar categorias, lançamentos ou todos os dados exige confirmações explícitas.'] },
      { title: 'Tema e PWA', items: ['Tema claro e escuro podem ser configurados por preferência e cores.', 'O PWA pode instalar o LuminaFin no dispositivo quando o navegador suportar.', 'Uma instalação não cria sincronização bancária ou em nuvem.'] }
    ]
  },
  {
    id: 'limitations',
    title: 'Observações',
    intro: 'Entender as limitações evita interpretações incorretas das projeções.',
    blocks: [
      { title: 'Pontos de atenção', items: ['Rendimentos são simulações locais e não representam oferta ou garantia.', 'A moeda pode ser convertida para visualização, mas valores-base são preservados em BRL.', 'Dias úteis não incluem calendário completo de feriados.', 'Projeções usam premissas configuradas e podem divergir da realidade.', 'O sistema não substitui banco, contabilidade ou assessor financeiro.'] }
    ]
  }
];
