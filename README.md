# LuminaFin - Sistema de Gestão Financeira Pessoal

## 📋 Visão Geral

**LuminaFin** é um aplicativo web de controle financeiro pessoal construído com **HTML5, CSS3 e JavaScript puro** (sem frameworks). O aplicativo funciona totalmente no navegador, com dados persistidos no `localStorage` do navegador.

---

## ✨ Funcionalidades Principais

### 1. **Dashboard**
- **Cards de resumo**: Saldo atual, saldo inicial, entradas, saídas, maior gasto, média diária, taxa de economia
- **Gráficos interativos** (Chart.js):
  - Entradas vs Saídas (últimos 6 meses)
  - Gastos por categoria (pizza)
  - Evolução do saldo (12 meses - linha)
  - Top 5 maiores gastos (horizontal)
- **Filtros**: Selecione ano e mês para visualizar dados específicos
- **Indicador**: Mensagem clara quando dados cumulativos ou de período específico

### 2. **Gerenciador de Lançamentos**
- Adicionar, editar e excluir transações
- Filtros avançados:
  - Busca por descrição/categoria
  - Ano e mês
  - Tipo (entrada/saída)
  - Categoria
  - Itens por página
- **Paginação**: 10, 25 ou 50 itens por página
- **Ordenação**: Clique nos cabeçalhos para ordenar por data, valor, categoria, tipo, status
- **Campos**:
  - Data
  - Tipo (entrada/saída)
  - Categoria e subcategoria
  - Descrição
  - Valor
  - Forma de pagamento (Pix, Cartão, Dinheiro, Boleto, Débito, Saldo)
  - Status (Pago, Pendente, Agendado)

### 3. **Saldo Inicial**
- Botão dedicado no topo: **"Saldo inicial"**
- Campo exclusivo no dashboard mostrando o valor do saldo inicial do mês/período
- Abre modal pré-preenchido para adicionar ou editar saldo inicial
- Diferencia o saldo inicial dos demais lançamentos

### 4. **Gerenciador de Categorias**
- **12 categorias padrão** pré-configuradas:
  - Moradia (7 subcategorias)
  - Alimentação (5 subcategorias)
  - Transporte (5 subcategorias)
  - Salário (receita)
  - Investimentos (receita)
  - Saúde (4 subcategorias)
  - Educação (4 subcategorias)
  - Lazer (5 subcategorias)
  - Vestuário (3 subcategorias)
  - Imprevistos (3 subcategorias)
  - Telefonia/Internet (2 subcategorias)
  - Outros (tipo: ambos, pode ser entrada ou saída)

- **Ações disponíveis**:
  - ✅ **Criar** nova categoria personalizada
  - ✅ **Editar** categoria personalizada
  - ✅ **Excluir** categoria personalizada
  - ⛔ Categorias padrão são apenas leitura (proteção)

- **Campos**:
  - Nome
  - Tipo (Entrada/Saída/Ambos)
  - Ícone emoji
  - Subcategorias (lista separada por vírgula)
  - Limite mensal em reais

- **Limite mensal**: Define o orçamento para a categoria; exibido na tabela de limites

### 5. **Gastos Fixos (Despesas Recorrentes)**
- Adicionar, editar e excluir despesas recorrentes
- **Campos**:
  - Descrição
  - Categoria
  - Valor
  - Dia de vencimento
  - Ativo (sim/não)

- **Ação "Lançar gastos fixos do mês"**: Cria transações dos gastos fixos ativos para o mês atual com um clique

### 6. **Relatórios Detalhados**
- **Gráficos**:
  - Distribuição de receita por categoria (doughnut)
  - Comparativo mês a mês do saldo (barra)
  - Distribuição por forma de pagamento (pizza)

- **Indicadores**:
  - Top 10 maiores gastos (com valores)
  - Mês com mais ganhos no ano selecionado

- **Heatmap**: Visualização de gastos por dia do mês (cores mais intensas = mais gastos)

- **Filtro**: Selecione o ano para visualizar relatórios anuais

### 7. **Painel Administrativo**
- **Ações de dados**:
  - 🗑️ **Limpar todos os dados**: Remove tudo (lançamentos, categorias, configurações)
  - 🗑️ **Excluir lançamentos**: Remove apenas os lançamentos, mantendo categorias e gastos fixos
  - 🔄 **Carregar demo**: Restaura dados de exemplo

- **Tema e cores**:
  - Seletor de cores para background, header, cards e accent
  - Modo claro/escuro com toggle
  - Salvar configurações de tema

- **Gerenciador de limites**: Visualize e edite o limite mensal de cada categoria

- **Editor de dados brutos**:
  - Visualize JSON completo do estado
  - Edite JSON diretamente
  - Aplique mudanças em tempo real

- **Backup e restore**:
  - Baixar backup em JSON
  - Importar backup anterior

### 8. **Tema e Personalização**
- **Dois temas**: Escuro (padrão) e Claro
- **Toggle no sidebar**: Mude entre temas com um clique
- **Cores customizáveis**:
  - Background principal
  - Header/Surface
  - Cards
  - Accent (azul, verde, etc.)
- **Armazenamento**: Tema e cores salvas no localStorage

---

## 🎨 Design e Responsividade

- **Desktop**: Layout em grid com sidebar de 300px
- **Tablet** (≤1100px): Sidebar em cima, conteúdo em coluna única
- **Mobile** (≤720px): 
  - Sidebar compacto ou escondido
  - Tabelas com scroll horizontal
  - Cards empilhados verticalmente
  - Filtros organizados vertical

- **Design**: Neumorfismo moderno com glassmorphism
- **Acessibilidade**: 
  - Labels associadas a inputs
  - Foco visível em botões
  - ARIA labels em botões de ação
  - Suporte a navegação por teclado

---

## 💾 Armazenamento de Dados

- **localStorage**: Todos os dados salvos no navegador
- **Chave de armazenamento**: `LuminaFin-v1`
- **Estrutura do estado**:
  ```javascript
  {
    settings: { themeMode, colors },
    categories: [...],
    transactions: [...],
    fixedExpenses: [...],
    sort: { key, order },
    pagination: { page, pageSize },
    filters: { year, month, type, search, category },
    reportYear: 2026
  }
  ```

- **Backup**: Exportar e importar em JSON

---

## 🛠️ Estrutura Técnica

### Arquivos
- **index.html**: Estrutura HTML, modais, formulários
- **style.css**: Estilos, temas, responsividade (~650 linhas)
- **script.js**: Lógica JavaScript, gerenciamento de estado (~1.200 linhas)

### Dependências Externas
- **Chart.js 4.4.0**: Gráficos interativos
- **Font Awesome 6.5.2**: Ícones
- **Google Fonts (Inter)**: Tipografia

### Padrões
- **SPA** (Single Page Application): Navegação sem recarregar página
- **localStorage API**: Persistência de dados
- **Event Listeners**: Interatividade dinâmica
- **Vanilla JS**: Sem frameworks, máxima compatibilidade

---

## 🚀 Como Usar

### Iniciar
1. Abra `index.html` em um servidor local (use `python -m http.server 8000` ou similar)
2. O site carregará com dados de exemplo (se vazio) ou dados salvos

### Adicionar Transação
1. Clique em **"Novo lançamento"** no topo
2. Preencha: data, tipo, categoria, valor, descrição, forma de pagamento, status
3. Clique em **"Salvar"**
4. A transação aparecerá na aba "Lançamentos" e refletirá no dashboard

### Adicionar Saldo Inicial
1. Clique em **"Saldo inicial"** no topo
2. Defina o valor inicial
3. Clique em **"Salvar"**
4. O valor aparecerá no card "Saldo inicial" no dashboard

### Criar Categoria
1. Vá para aba **"Categorias"**
2. Clique em **"Nova categoria"**
3. Preencha: nome, tipo, ícone, subcategorias, limite
4. Clique em **"Salvar"**
5. Categoria disponível para seleção em lançamentos

### Editar/Excluir Categoria
1. Vá para aba **"Categorias"**
2. Procure a categoria na tabela
3. Clique no ícone de **lápis** (editar) ou **lixeira** (excluir)
4. Confirme as mudanças
5. ⚠️ Categorias padrão não podem ser editadas

### Configurar Gastos Fixos
1. Vá para aba **"Gastos Fixos"**
2. Clique em **"Novo gasto fixo"**
3. Preencha: descrição, categoria, valor, dia de vencimento
4. Clique em **"Salvar"**

### Lançar Gastos Fixos do Mês
1. Vá para aba **"Gastos Fixos"**
2. Clique em **"Lançar gastos fixos do mês"**
3. Os gastos fixos ativos serão adicionados como transações do mês atual

### Visualizar Relatórios
1. Vá para aba **"Relatórios"**
2. Selecione o ano
3. Veja gráficos, heatmap e indicadores

### Mudar Tema
1. No sidebar, encontre o toggle **Dark/Light**
2. Clique no toggle ou use o botão
3. Tema muda instantaneamente

### Customizar Cores
1. Vá para aba **"Administrativo"**
2. Na seção **"Tema e cores"**, clique nos seletores de cor
3. Defina as cores desejadas
4. Clique em **"Salvar tema"**

### Fazer Backup
1. Vá para aba **"Administrativo"**
2. Clique em **"Backup"**
3. Um arquivo JSON será baixado com todos os seus dados

### Restaurar Backup
1. Vá para aba **"Administrativo"**
2. Clique em **"Importar backup"**
3. Selecione um arquivo JSON anteriormente baixado
4. Os dados serão carregados

---

## 📊 Campos e Tipos de Dados

### Transação
```javascript
{
  id: string (UUID ou ID aleatório),
  date: string (YYYY-MM-DD),
  category: string (ID da categoria),
  subcategory: string,
  type: 'income' | 'expense',
  description: string,
  value: number,
  payment: 'Pix' | 'Cartão' | 'Dinheiro' | 'Boleto' | 'Débito' | 'Saldo' | custom,
  status: 'paid' | 'pending' | 'scheduled'
}
```

### Categoria
```javascript
{
  id: string,
  name: string,
  type: 'income' | 'expense' | 'both',
  icon: string (emoji),
  subcategories: [string],
  limit: number (limite mensal em reais),
  preset: boolean (true = padrão, false = customizado)
}
```

### Gasto Fixo
```javascript
{
  id: string,
  description: string,
  category: string (ID da categoria),
  value: number,
  day: number (1-28),
  active: boolean
}
```

---

## ⚙️ Funções Principais do JavaScript

### Gerenciamento de Estado
- `init()`: Inicializa o aplicativo
- `loadState()`: Carrega dados do localStorage
- `saveState()`: Salva estado no localStorage

### Renderização
- `renderDashboard()`: Atualiza cards e gráficos
- `renderTransactionTable()`: Exibe tabela de lançamentos
- `renderCategoryTable()`: Exibe tabela de categorias
- `renderReportPage()`: Exibe relatórios
- `buildCharts()`: Cria gráficos com Chart.js

### Modais
- `openTransactionModal()`: Abre modal de lançamento
- `openCategoryModal()`: Abre modal de categoria
- `openInitialBalanceModal()`: Abre modal de saldo inicial
- `openFixedModal()`: Abre modal de gasto fixo
- `closeModals()`: Fecha todos os modais

### Ações
- `handleTransactionSubmit()`: Salva/edita lançamento
- `handleCategorySubmit()`: Salva/edita categoria
- `handleTableActions()`: Edita/exclui linhas de tabela
- `clearAllData()`: Limpa tudo
- `clearAllTransactions()`: Limpa apenas lançamentos
- `backupData()`: Exporta JSON
- `handleBackupImport()`: Importa JSON

---

## 🐛 Observações Importantes

1. **Data do servidor**: O aplicativo usa `new Date()` local. Certifique-se de que a data do sistema está correta.
2. **localStorage**: Dados são salvos localmente. Limpar cache/cookies pode perder dados. Use backup regularmente.
3. **Limite de 5MB**: localStorage geralmente tem limite de ~5MB. Com muitos lançamentos, pode atingir limite.
4. **Categorias padrão**: Não podem ser excluídas, apenas customizadas em limite/ícone/subcategorias.
5. **Moeda**: Hardcoded para BRL (Real). Para outras moedas, edite a função `formatCurrency()`.

---

## 📱 Compatibilidade

- **Browsers**: Chrome, Firefox, Safari, Edge (últimas 2 versões)
- **Requisitos**: JavaScript ativado, localStorage disponível
- **Mobile**: Responsivo até 320px de largura

---

## 🔒 Segurança

- Dados armazenados localmente (sem servidor)
- Sem requisições HTTP (offline first)
- Sem autenticação (pessoal/local apenas)
- Recomendado: Use em computador/mobiliário pessoal seguro

---

## 📝 Changelog

### v1.2.0 (Atual)
- ✅ Dashboard com cards e gráficos
- ✅ CRUD de lançamentos
- ✅ CRUD de categorias
- ✅ Gastos fixos
- ✅ Relatórios avançados
- ✅ Tema claro/escuro
- ✅ Backup/restore
- ✅ Sistema de cenários salvos
- ✅ Metas de poupança com progresso
- ✅ Análise de risco financeiro
- ✅ Alertas inteligentes
- ✅ Análise de tendências
- ✅ Página de ajuda completa
- ✅ Header fixo no topo
- ✅ Footer com redes sociais
- ✅ PWA (Progressive Web App)
- ✅ Notificações push

### v1.0.0 (Anterior)
- ✅ Dashboard com cards e gráficos
- ✅ CRUD de lançamentos
- ✅ CRUD de categorias
- ✅ Gastos fixos
- ✅ Relatórios
- ✅ Tema claro/escuro
- ✅ Backup/restore
- ✅ Responsividade
- ✅ Saldo inicial dedicado

---

## 📞 Suporte

Para problemas ou dúvidas, verifique:
1. Se localStorage está ativado
2. Se a data do sistema está correta
3. Se o navegador é compatível
4. Tente fazer um backup e restaurar dados de exemplo

---

## 📄 Licença

Projeto de uso pessoal. Livre para modificação e distribuição.

---

**Versão**: 1.0.0  
**Última atualização**: Abril 2026  
**Desenvolvido com**: HTML5, CSS3, JavaScript Vanilla
# LuminaFin
# LuminaFin
