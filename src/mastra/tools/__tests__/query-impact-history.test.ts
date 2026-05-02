import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../_shared/supabase';
import { queryImpactHistory } from '../query-impact-history';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockFeedbackThen(aos: { source_id: string; title: string; priority: string; deadline: string | null; analyzed_at: string }[]) {
  (supabase.from as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce({
      // First call: fetch the feedback record
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { correction_value: 'transport scolaire', correction_type: 'keyword_red_flag', processed_at: '2026-04-01T06:00:00Z' },
            error: null,
          }),
        }),
      }),
    })
    .mockReturnValueOnce({
      // Second call: fetch matching AOs
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: aos, error: null }),
        }),
      }),
    });
}

describe('queryImpactHistory', () => {
  it('retourne les bons comptages pour un feedback existant avec AOs affectés', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    mockFeedbackThen([
      { source_id: 'ao-1', title: 'Transport scolaire Grenoble', priority: 'HIGH', deadline: tomorrow, analyzed_at: '2026-04-15T06:00:00Z' },
      { source_id: 'ao-2', title: 'Transport scolaire Lyon', priority: 'LOW', deadline: tomorrow, analyzed_at: '2026-04-16T06:00:00Z' },
      { source_id: 'ao-3', title: 'Transport scolaire expiré', priority: 'MEDIUM', deadline: '2026-01-01', analyzed_at: '2026-04-10T06:00:00Z' },
    ]);

    const result = await (queryImpactHistory.execute as any)({ feedback_id: 'fb-1', client_id: 'balthazar' });

    expect(result.found).toBe(true);
    expect(result.correction_value).toBe('transport scolaire');
    expect(result.total_matching_aos).toBe(3);
    expect(result.open_affected).toBe(2); // ao-3 est expiré
    expect(result.high_medium_count).toBe(1);
    expect(result.low_count).toBe(1);
    expect(result.applied_at).toBe('2026-04-01T06:00:00Z');
  });

  it('retourne found=false si le feedback est introuvable', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });

    const result = await (queryImpactHistory.execute as any)({ feedback_id: 'inexistant', client_id: 'balthazar' });

    expect(result.found).toBe(false);
    expect(result.total_matching_aos).toBe(0);
  });

  it('retourne found=false si ni feedback_id ni value fournis', async () => {
    const result = await (queryImpactHistory.execute as any)({ client_id: 'balthazar' });

    expect(result.found).toBe(false);
    expect(result.summary).toBe('Aucune valeur à rechercher.');
  });

  it('fonctionne avec value directe sans feedback_id', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [
              { source_id: 'ao-1', title: 'Mobilité douce', priority: 'HIGH', deadline: null, analyzed_at: '2026-04-20T06:00:00Z' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const result = await (queryImpactHistory.execute as any)({ value: 'mobilité', client_id: 'balthazar' });

    expect(result.found).toBe(true);
    expect(result.correction_value).toBe('mobilité');
    expect(result.total_matching_aos).toBe(1);
  });
});
