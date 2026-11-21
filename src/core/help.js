export const HELP_TOPICS = [
  {
    id: 'start',
    title: 'Por onde começar em 3 minutos',
    intro: 'Você não precisa configurar tudo antes de usar. Com o saldo inicial e um lançamento, o LuminaFin já mostra uma visão útil.',
    blocks: [
      { title: 'O mínimo para começar', items: ['1. Informe quanto há na conta em Saldo inicial.', '2. Registre uma entrada ou saída recente em Lançamentos.', '3. Confira o saldo e os indicadores no Dashboard.', 'Categorias, gastos fixos, cartão e cofrinhos podem ser configurados depois.'] },
      { title: 'Quer explorar primeiro?', items: ['Carregue dados de demonstração para conhecer gráficos, faturas e cofrinhos.', 'A demonstração substitui os dados atuais após criar um backup automático.', 'Use “Limpar demonstração e começar do zero” quando quiser remover o exemplo com segurança.'] }
    ]
  },
  {
    id: 'overview',
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
      { title: 'Áreas disponíveis', items: ['Dashboard: visão do período, composição da conta e projeções.', 'Lançamentos: cadastro, edição, filtros e status dos movimentos.', 'Cartões: limites, compras parceladas e faturas.', 'Cofrinhos: reservas, metas e rendimentos simulados.', 'Gastos Fixos: recorrências fixas ou por duração.', 'Categorias: classificação e limites mensais.', 'Relatórios: análises, cenários, metas e projeções.', 'Tenho Dúvida: busca de respostas e orientações.', 'Configurações: moeda, aparência, backup e dados.'] }
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
    id: 'faq',
    title: 'FAQ prático',
    intro: 'Respostas rápidas para as dúvidas mais comuns durante o uso.',
    blocks: [
      { title: 'Pago, pendente e agendado', items: ['Pago altera o saldo realizado quando afeta a conta.', 'Pendente ainda não foi concluído; aparece como compromisso, sem alterar o saldo realizado.', 'Agendado é uma previsão futura e também não altera o saldo realizado.'] },
      { title: 'Cartão e cofrinhos', items: ['Uma compra no crédito compromete o limite e a fatura, mas não reduz a conta na hora.', 'Aporte é uma transferência da conta para um cofrinho, não uma despesa de consumo.', 'O rendimento do cofrinho é uma estimativa local e pode ser ajustado para corresponder ao valor observado.'] },
      { title: 'Offline, sincronização e backup', items: ['Depois de carregar, o app pode funcionar offline neste navegador; recursos externos podem depender de internet.', 'Sincronize por pareamento local ou pacote. Antes de aplicar, o app valida e salva um backup no dispositivo.', 'Backup exporta um arquivo que você deve guardar fora do navegador. Não há sincronização bancária nem nuvem automática.'] }
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
      { title: 'Backup e importação', items: ['Crie backups JSON periodicamente pela seção Configurações; todos os módulos vêm selecionados por padrão e você pode escolher o que exportar.', 'Ao restaurar, somente os módulos marcados são substituídos; vínculos necessários podem incluir categorias relacionadas.', 'Antes de importar, o estado atual é baixado como backup síncrono. O arquivo recebido é validado antes de gravar, e formatos antigos continuam aceitos.', 'Um lembrete discreto avisa quando nunca houve backup, quando ele está antigo ou quando há alterações posteriores; você pode adiá-lo.'] },
      { title: 'Sincronização entre dispositivos', items: ['O pareamento WebRTC transfere dados diretamente entre dois navegadores; não usa servidor de dados ou conta em nuvem.', 'Sem um serviço de sinalização, a oferta e a resposta precisam ser trocadas por QR Code ou cópia de texto, e os dispositivos devem estar na mesma rede local.', 'O pacote offline pode ser comprimido, exportado como arquivo único ou lido por QR quando couber.', 'Ao receber dados, escolha mesclar por IDs e timestamps ou substituir tudo. O estado atual recebe um backup local síncrono antes da gravação, e o pacote é validado pelo schema completo.', 'A mesclagem resolve conflitos pelo updatedAt, versão e exclusão mais recente; faça um backup externo antes de mudanças importantes.'] },
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

export function filterHelpTopics(topics, query) {
  const search = String(query || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (!search) return topics;
  return topics.filter((topic) => {
    const text = [
      topic.title,
      topic.intro,
      ...topic.blocks.flatMap((block) => [block.title, ...block.items])
    ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    return text.includes(search);
  });
}
