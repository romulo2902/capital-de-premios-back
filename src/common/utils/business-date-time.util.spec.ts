import {
  formatDateTimeForInput,
  parseBusinessDateTime,
} from './business-date-time.util';

describe('business-date-time.util', () => {
  it('parseia datetime-local no fuso da operacao', () => {
    const parsed = parseBusinessDateTime(
      '2026-03-27T10:20',
      'dataSorteio',
      'America/Sao_Paulo',
    );

    expect(parsed.date.toISOString()).toBe('2026-03-27T13:20:00.000Z');
    expect(parsed.localDateTime).toBe('2026-03-27T10:20');
  });

  it('parseia formato brasileiro com hora e minuto', () => {
    const parsed = parseBusinessDateTime(
      '27/03/2026 09:00',
      'dataEncerramento',
      'America/Sao_Paulo',
    );

    expect(parsed.date.toISOString()).toBe('2026-03-27T12:00:00.000Z');
  });

  it('aceita iso com offset quando esta em precisao de minuto', () => {
    const parsed = parseBusinessDateTime(
      '2026-03-27T10:20:00-03:00',
      'dataSorteio',
      'America/Sao_Paulo',
    );

    expect(parsed.date.toISOString()).toBe('2026-03-27T13:20:00.000Z');
    expect(formatDateTimeForInput(parsed.date, 'America/Sao_Paulo')).toBe(
      '2026-03-27T10:20',
    );
  });

  it('rejeita segundos diferentes de zero', () => {
    expect(() =>
      parseBusinessDateTime(
        '2026-03-27T10:20:59-03:00',
        'dataSorteio',
        'America/Sao_Paulo',
      ),
    ).toThrow('precisão de minuto');
  });
});
