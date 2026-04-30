import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../balthazar-rag-tools', () => ({
  getVectorStore: vi.fn(() => ({
    deleteVector: vi.fn().mockResolvedValue(undefined),
  })),
  embedQuery: vi.fn(),
}));

import { supabase } from '../_shared/supabase';
import { getVectorStore } from '../balthazar-rag-tools';
import { deactivateRAGChunk } from '../deactivate-rag-chunk';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockFeedbackLookup(feedback: { id: string; correction_type: string; correction_value: string; status: string } | null) {
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: feedback, error: feedback ? null : { message: 'not found' } }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }),
  });
}

describe('deactivateRAGChunk', () => {
  it('désactive un chunk rag_chunk en status applied', async () => {
    const mockStore = { deleteVector: vi.fn().mockResolvedValue(undefined) };
    (getVectorStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);

    // First call: fetch feedback; second call: update status
    (supabase.from as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'fb-1', correction_type: 'rag_chunk', correction_value: 'conseil stratégique', status: 'applied' },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      });

    const result = await deactivateRAGChunk.execute({ feedback_id: 'fb-1', reason: 'règle trop large' });

    expect(result.deactivated).toBe(true);
    expect(result.message).toContain('conseil stratégique');
    expect(mockStore.deleteVector).toHaveBeenCalledWith({ indexName: 'policies', id: 'feedback_fb-1' });
  });

  it('retourne deactivated=false si le feedback est introuvable', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });

    const result = await deactivateRAGChunk.execute({ feedback_id: 'inexistant', reason: 'test' });

    expect(result.deactivated).toBe(false);
    expect(result.message).toBe('Feedback introuvable.');
  });

  it('retourne deactivated=false si le type n\'est pas rag_chunk', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'fb-2', correction_type: 'keyword_red_flag', correction_value: 'transport', status: 'applied' },
            error: null,
          }),
        }),
      }),
    });

    const result = await deactivateRAGChunk.execute({ feedback_id: 'fb-2', reason: 'test' });

    expect(result.deactivated).toBe(false);
    expect(result.message).toContain('deactivateOverride');
  });

  it('retourne deactivated=false si le chunk n\'est pas en status applied', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'fb-3', correction_type: 'rag_chunk', correction_value: 'test', status: 'agent_proposed' },
            error: null,
          }),
        }),
      }),
    });

    const result = await deactivateRAGChunk.execute({ feedback_id: 'fb-3', reason: 'test' });

    expect(result.deactivated).toBe(false);
    expect(result.message).toContain('agent_proposed');
  });

  it('continue même si deleteVector échoue (chunk absent du store)', async () => {
    const mockStore = { deleteVector: vi.fn().mockRejectedValue(new Error('vector not found')) };
    (getVectorStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);

    (supabase.from as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'fb-4', correction_type: 'rag_chunk', correction_value: 'règle orpheline', status: 'applied' },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      });

    const result = await deactivateRAGChunk.execute({ feedback_id: 'fb-4', reason: 'nettoyage' });

    // Doit quand même marquer le statut en DB
    expect(result.deactivated).toBe(true);
  });
});
