import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before the tool import so vi.mock hoisting takes effect
vi.mock('../_shared/supabase', () => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'ilike', 'insert', 'update', 'limit', 'order', 'single', 'gte', 'or'];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  return { supabase: { from: vi.fn().mockReturnValue(chain) } };
});

import { supabase } from '../_shared/supabase';
import { checkDuplicateCorrection } from '../check-duplicate-correction';

function getChain() {
  return (supabase.from as ReturnType<typeof vi.fn>).mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkDuplicateCorrection', () => {
  describe('keyword_red_flag', () => {
    it('retourne isDuplicate=true si une règle similaire existe', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        // final resolution
        data: [{ id: 'ov-1', value: 'transport scolaire', type: 'red_flag', feedback_id: 'fb-1' }],
      } as unknown as ReturnType<typeof vi.fn>;

      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: undefined,
        // Supabase returns { data, error } directly when awaited on builder
      });

      // Easier: mock the entire supabase chain to resolve with data
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'ov-1', value: 'transport scolaire', type: 'red_flag', feedback_id: 'fb-1' }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateCorrection.execute({
        client_id: 'balthazar',
        correction_type: 'keyword_red_flag',
        value: 'transport scolaire',
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingValue).toBe('transport scolaire');
      expect(result.existingType).toBe('red_flag');
    });

    it('retourne isDuplicate=false si aucune règle similaire', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateCorrection.execute({
        client_id: 'balthazar',
        correction_type: 'keyword_red_flag',
        value: 'domaine inconnu',
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.existingFeedbackId).toBeNull();
      expect(result.message).toBe('Aucune règle similaire détectée — correction nouvelle.');
    });
  });

  describe('rag_chunk', () => {
    it('retourne isDuplicate=true si un chunk similaire a été appliqué', async () => {
      // La logique utilise includes() dans les deux sens :
      // existingValue.includes(searchValue) OU searchValue.includes(existingValue)
      // Ici : 'conseil pme' est contenu dans 'conseil pme directif' → match
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'fb-42', correction_value: 'conseil PME', correction_type: 'rag_chunk' }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateCorrection.execute({
        client_id: 'balthazar',
        correction_type: 'rag_chunk',
        value: 'conseil PME directif',  // contient 'conseil pme' → isDuplicate=true
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingFeedbackId).toBe('fb-42');
      expect(result.existingType).toBe('rag_chunk');
    });

    it('retourne isDuplicate=false si aucun chunk similaire', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateCorrection.execute({
        client_id: 'balthazar',
        correction_type: 'rag_chunk',
        value: 'nouvelle règle inexistante',
      });

      expect(result.isDuplicate).toBe(false);
    });
  });
});
