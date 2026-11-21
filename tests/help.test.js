import { describe, expect, it } from 'vitest';
import { filterHelpTopics, HELP_TOPICS } from '../src/core/help.js';

describe('Guia Tenho Dúvida', () => {
  it('covers all main modules and financial status rules', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(ids).toEqual([
      'start', 'overview', 'navigation', 'balances', 'modules', 'planning',
      'faq', 'daily', 'data', 'limitations'
    ]);
    const balances = HELP_TOPICS.find((topic) => topic.id === 'balances');
    expect(balances.blocks.some((block) => block.title === 'Paid — pago')).toBe(true);
    expect(balances.blocks.some((block) => block.title === 'Pending — pendente')).toBe(true);
    expect(balances.blocks.some((block) => block.title === 'Scheduled — agendado')).toBe(true);
  });

  it('documents account, card, coffer, backup and PWA limitations', () => {
    const text = JSON.stringify(HELP_TOPICS);
    expect(text).toContain('Cartões');
    expect(text).toContain('Cofrinhos');
    expect(text).toContain('Backup');
    expect(text).toContain('PWA');
  });

  it('includes a three-minute onboarding and practical FAQ with accent-insensitive search', () => {
    expect(HELP_TOPICS.find((topic) => topic.id === 'start').title)
      .toBe('Por onde começar em 3 minutos');
    expect(filterHelpTopics(HELP_TOPICS, 'fatura').some((topic) => topic.id === 'faq')).toBe(true);
    expect(filterHelpTopics(HELP_TOPICS, 'cofrinho').some((topic) => topic.id === 'faq')).toBe(true);
    expect(filterHelpTopics(HELP_TOPICS, 'inexistente')).toEqual([]);
  });
});
