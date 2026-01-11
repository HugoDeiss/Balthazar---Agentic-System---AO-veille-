// ════════════════════════════════════════════════════════════════
// TESTS UNITAIRES : Détection des rectificatifs
// ════════════════════════════════════════════════════════════════

import { describe, it, expect } from '@jest/globals';
import {
  isRectification,
  detectSubstantialChanges,
  calculateLevenshteinSimilarity
} from '../rectificatif-utils';

describe('isRectification', () => {
  it('devrait détecter un rectificatif via nature_categorise', () => {
    const ao = {
      raw_json: {
        nature_categorise: 'avis_rectificatif'
      }
    };
    expect(isRectification(ao)).toBe(true);
  });
  
  it('devrait détecter un rectificatif via type_avis', () => {
    const ao = {
      raw_json: {
        type_avis: 'Avis rectificatif'
      }
    };
    expect(isRectification(ao)).toBe(true);
  });
  
  it('devrait détecter un rectificatif via annonce_lie', () => {
    const ao = {
      raw_json: {
        annonce_lie: '24-12345'
      }
    };
    expect(isRectification(ao)).toBe(true);
  });
  
  it('ne devrait PAS détecter un AO standard', () => {
    const ao = {
      raw_json: {
        nature_categorise: 'appeloffre/standard',
        annonce_lie: null
      }
    };
    expect(isRectification(ao)).toBe(false);
  });
});

describe('detectSubstantialChanges', () => {
  // ────────────────────────────────────────────────────────────────
  // TEST 1 : Budget modifié > 20%
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter un changement de budget substantiel (+400%)', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 500000, // x5
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe('budget');
    expect(result.changes[0].change_pct).toBe(400);
  });
  
  it('ne devrait PAS détecter un changement de budget < 20%', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 110000, // +10% seulement
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
  
  // ────────────────────────────────────────────────────────────────
  // TEST 2 : Deadline prolongée > 7 jours
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter une prolongation de deadline > 7 jours', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 100000,
      deadline: '2025-03-16', // +15 jours
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe('deadline');
    expect(result.changes[0].days_added).toBe(15);
  });
  
  it('ne devrait PAS détecter une prolongation < 7 jours', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 100000,
      deadline: '2025-03-04', // +3 jours seulement
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
  
  // ────────────────────────────────────────────────────────────────
  // TEST 3 : Type de marché changé
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter un changement de type de marché', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'TRAVAUX', // Changé !
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe('type_marche');
    expect(result.changes[0].old).toBe('SERVICES');
    expect(result.changes[0].new).toBe('TRAVAUX');
  });
  
  // ────────────────────────────────────────────────────────────────
  // TEST 4 : Région changée
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter un changement de région', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Auvergne-Rhône-Alpes', // Changé !
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe('region');
  });
  
  // ────────────────────────────────────────────────────────────────
  // TEST 5 : Critères financiers modifiés
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter un changement de critères financiers', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {
        donnees: {
          CONDITION_PARTICIPATION: {
            CAP_ECO: 'CA minimum : 2M€'
          }
        }
      }
    };
    
    const newAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {
        donnees: {
          CONDITION_PARTICIPATION: {
            CAP_ECO: 'CA minimum : 500k€' // Changé !
          }
        }
      }
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes.some(c => c.field === 'financial_criteria')).toBe(true);
  });
  
  // ────────────────────────────────────────────────────────────────
  // TEST 6 : Changements multiples
  // ────────────────────────────────────────────────────────────────
  it('devrait détecter plusieurs changements substantiels', () => {
    const oldAO = {
      budget_max: 100000,
      deadline: '2025-03-01',
      type_marche: 'SERVICES',
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const newAO = {
      budget_max: 500000, // Changé !
      deadline: '2025-03-20', // Changé !
      type_marche: 'TRAVAUX', // Changé !
      region: 'Île-de-France',
      title: 'Mission de conseil',
      raw_json: {}
    };
    
    const result = detectSubstantialChanges(oldAO, newAO);
    
    expect(result.isSubstantial).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(3);
    expect(result.changes.some(c => c.field === 'budget')).toBe(true);
    expect(result.changes.some(c => c.field === 'deadline')).toBe(true);
    expect(result.changes.some(c => c.field === 'type_marche')).toBe(true);
  });
});

describe('calculateLevenshteinSimilarity', () => {
  it('devrait retourner 1 pour des chaînes identiques', () => {
    const similarity = calculateLevenshteinSimilarity(
      'Mission de conseil',
      'Mission de conseil'
    );
    expect(similarity).toBe(1);
  });
  
  it('devrait retourner ~0.95 pour des chaînes très similaires', () => {
    const similarity = calculateLevenshteinSimilarity(
      'Mission de conseil en stratégie',
      'Mission de conseil en strategie' // 1 lettre différente
    );
    expect(similarity).toBeGreaterThan(0.9);
  });
  
  it('devrait retourner < 0.8 pour des chaînes très différentes', () => {
    const similarity = calculateLevenshteinSimilarity(
      'Mission de conseil',
      'Travaux de rénovation'
    );
    expect(similarity).toBeLessThan(0.8);
  });
  
  it('devrait gérer les chaînes vides', () => {
    const similarity = calculateLevenshteinSimilarity('', '');
    expect(similarity).toBe(1);
  });
});

