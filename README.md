# LuminaFin

Organizador financeiro pessoal executado no navegador. Os dados ficam no `localStorage` do dispositivo; não há conexão com banco ou instituição financeira.

## Funcionalidades

- **Dashboard:** capítulos Resumo, Indicadores e Tendências; saldo da conta realizado, saldo aplicado em cofrinhos, patrimônio consolidado, pendências/agendamentos separados e um primeiro estado orientado para configurar dados.
- **Lançamentos:** capítulos Movimentações e Agenda; entradas, despesas e transferências com data, categoria/subcategoria, descrição, valor, pagamento e status; busca, filtros, ordenação e paginação.
- **Saldo inicial:** registros próprios, independentes de texto em categoria ou descrição.
- **Categorias:** receitas, despesas ou ambas, subcategorias e limite mensal; categorias padrão protegidas e exclusão de categorias vinculadas bloqueada.
- **Gastos Fixos:** recorrências mensais e despesas parceladas com início/duração; as ocorrências não são duplicadas no mesmo mês e começam como pendentes ou agendadas conforme a data.
- **Cofrinhos:** capítulos Meus cofrinhos e Regras da simulação; tipos Comum, da Virada e Mercado Livre, metas, status, simulação de rendimento e operações vinculadas aos lançamentos. CDI, taxa-base, bônus por faixa, teto compartilhado, limites e datas promocionais são configuráveis. Aporte/resgate afeta o saldo da conta; compra habilitada no checkout Mercado Livre não lança débito adicional na conta nem aplica a perda do resgate comum.
- **Relatórios:** capítulos Visão geral, Projeções e Planejamento, com subvisões para resumo, despesas, gráficos, receitas, compra, fluxo de saldo, longo prazo, metas, risco e cenários.
- **Configurações:** capítulos Preferências, Dados e segurança, Orçamentos e Ações críticas.
- **Futuro de longo prazo:** simule 1, 3, 5, 10 ou 20 anos com CDI, cenários de rendimento, inflação e aportes mensais. O saldo inicial pode partir dos cofrinhos atuais; a simulação não cria lançamentos.
- **Configurações:** tema, moeda de exibição, taxas de câmbio datadas, notificações, inflação estimada para projeções, limites, backup/restauração, editor JSON validado e lixeira.
- **PWA:** instalação no dispositivo e cache local para uso offline. Recursos externos (gráficos, ícones e fontes) podem não estar disponíveis offline.

## Regras financeiras

- Apenas lançamentos `paid` compõem os totais realizados e o saldo da conta.
- `pending` representa contas a pagar/receber; `scheduled` é usado em projeções. Nenhum dos dois altera o saldo realizado.
- O verificador de compra mostra renda realizada e compromissos pendentes/agendados/fixos separadamente. Receitas pendentes não contam como dinheiro seguro. Cofrinhos só aparecem como alternativa de resgate, com perda estimada de rendimento quando aplicável.
- Valores de lançamentos, saldos, limites, gastos fixos e cofrinhos são persistidos em centavos inteiros. A moeda-base é BRL; outras moedas exigem taxa registrada com data efetiva.
- Trocar a moeda altera a apresentação e a entrada de novos valores, não reescreve valores ou taxas históricas.
- Projeções combinam histórico realizado, pendências/agendamentos e gastos fixos futuros conhecidos; a inflação anual estimada é opcional.
- A simulação de Cofrinhos é educativa, não representa oferta bancária nem promessa de rendimento. Usa CDI anual e percentual-base configuráveis, dias úteis de segunda a sexta (sem calendário de feriados), faixas configuráveis e IR estimado por prazo médio ponderado de depósitos. IOF é desligado por padrão. Revise os parâmetros antes de usar os resultados.
- A projeção de longo prazo é uma hipótese de taxa constante, com aportes ao fim do mês; o valor real desconta inflação, mas não modela impostos, taxas futuras variáveis ou garantias de rentabilidade.
- O Cofrinho da Virada troca para Comum após a campanha se houver saldo ou atividade. Simular uma data futura não altera o cadastro.

## Dados, backup e compatibilidade

O estado é persistido em `LuminaFin-v1`, com schema atual versão 3. A migração é executada automaticamente e preserva dados legados, incluindo saldos iniciais antigos, cenários e metas salvos em chaves separadas.

Exportar um backup baixa um JSON versionado com o estado completo. Importações e alterações pelo editor JSON são validadas antes da substituição e criam um backup do estado anterior. Uma importação inválida não substitui os dados atuais. A lixeira permite restaurar itens removidos.

## Executar localmente

Sirva a pasta por HTTP (módulos ES e Service Worker não funcionam corretamente ao abrir o arquivo diretamente). Por exemplo:

```sh
python -m http.server 8000
```

Abra `http://localhost:8000`.

## Desenvolvimento e validação

Requer Node.js e npm.

```sh
npm install
npm test
npm run lint
npm run check
npm run build
```

O build gera os ícones PNG e copia a aplicação e seus módulos para `dist/`.
