import { describe, it, expect } from 'vitest';
import { reasonClassificationSchema } from '../ao-reason-classifier';

// Tests de contrat schema — vérifient que le schéma Zod accepte et rejette les bons types.
// Les tests de comportement LLM réel sont en tests d'intégration (Phase 6).

describe('reasonClassificationSchema', () => {
  describe('Cas A — raison conceptuelle', () => {
    it('valide une classification A valide avec terms', () => {
      const input = {
        type: 'A',
        terms: ['conseil en gestion', 'PME en difficulté'],
        confidence: 0.9,
        explanation: "L'utilisateur décrit un domaine métier hors périmètre.",
      };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('A');
        expect(result.data.terms).toHaveLength(2);
      }
    });

    it('valide un Cas A sans terms (optionnel)', () => {
      const input = { type: 'A', confidence: 0.8, explanation: 'Domaine non pertinent.' };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Cas B — terme précis', () => {
    it('valide une classification B avec term', () => {
      const input = {
        type: 'B',
        term: 'mobilité',
        confidence: 0.95,
        explanation: "L'utilisateur cite le mot 'mobilité' explicitement.",
      };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('B');
        expect(result.data.term).toBe('mobilité');
      }
    });
  });

  describe('Cas C — raison personnelle', () => {
    it('valide une classification C sans terms ni term', () => {
      const input = {
        type: 'C',
        confidence: 0.85,
        explanation: "Raison personnelle sans règle généralisable.",
      };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('C');
        expect(result.data.terms).toBeUndefined();
        expect(result.data.term).toBeUndefined();
      }
    });
  });

  describe('Validation des contraintes', () => {
    it('rejette un type invalide', () => {
      const input = { type: 'D', confidence: 0.8, explanation: 'test' };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejette une confidence > 1', () => {
      const input = { type: 'A', confidence: 1.5, explanation: 'test' };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejette une confidence < 0', () => {
      const input = { type: 'B', term: 'test', confidence: -0.1, explanation: 'test' };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejette un objet sans explanation', () => {
      const input = { type: 'C', confidence: 0.9 };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepte confidence=0.75 (seuil de confirmation UI)', () => {
      const input = { type: 'A', confidence: 0.75, explanation: 'Juste au seuil.' };
      const result = reasonClassificationSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
