/**
 * Feedback Workflow — HITL pipeline
 *
 * 1. enrich-context   : Load feedback + AO from Supabase
 * 2. agent-propose    : aoFeedbackTuningAgent diagnoses and proposes a fix
 * 3. user-confirm     : Email Pablo with confirm/reject links → suspend → resume
 * 4. apply-correction : Apply keyword_red_flag or rag_chunk correction
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { aoFeedbackTuningAgent, feedbackProposalSchema } from '../agents/ao-feedback-tuning-agent';
import { insertAndIndexChunk } from '../../utils/rag-indexer';
import { signFeedbackToken } from '../../utils/feedback-token';
import { sendEmail } from '../../utils/email-sender';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ──────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────

const workflowInputSchema = z.object({
  feedbackId: z.string().uuid(),
});

const enrichedContextSchema = z.object({
  feedbackId: z.string().uuid(),
  feedback: z.object({
    id: z.string(),
    source_id: z.string(),
    client_id: z.string(),
    reason: z.string().nullable(),
    status: z.string(),
  }),
  ao: z.object({
    title: z.string(),
    acheteur: z.string().nullable(),
    human_readable_reason: z.string().nullable(),
    keyword_breakdown: z.any().nullable(),
    matched_keywords_detail: z.any().nullable(),
    llm_skipped: z.boolean().nullable(),
    llm_skip_reason: z.string().nullable(),
    decision_gate: z.string().nullable(),
    rejet_raison: z.string().nullable(),
    url_ao: z.string().nullable(),
  }),
});

const agentProposalSchema = enrichedContextSchema.extend({
  proposal: feedbackProposalSchema,
});

const userConfirmResumeSchema = z.object({
  approved: z.boolean(),
});

const userConfirmOutputSchema = agentProposalSchema.extend({
  approved: z.boolean(),
});

// ──────────────────────────────────────────────────
// Step 1: enrich-context
// ──────────────────────────────────────────────────

const enrichContextStep = createStep({
  id: 'enrich-context',
  inputSchema: workflowInputSchema,
  outputSchema: enrichedContextSchema,
  execute: async ({ inputData }) => {
    const { feedbackId } = inputData;

    const { data: feedback, error: fbError } = await supabase
      .from('ao_feedback')
      .select('id, source_id, client_id, reason, status')
      .eq('id', feedbackId)
      .single();

    if (fbError || !feedback) {
      throw new Error(`Feedback ${feedbackId} introuvable: ${fbError?.message}`);
    }

    const { data: ao, error: aoError } = await supabase
      .from('appels_offres')
      .select(`
        title, acheteur, human_readable_reason,
        keyword_breakdown, matched_keywords_detail,
        llm_skipped, llm_skip_reason,
        decision_gate, rejet_raison, url_ao
      `)
      .eq('source_id', feedback.source_id)
      .single();

    if (aoError || !ao) {
      throw new Error(`AO ${feedback.source_id} introuvable: ${aoError?.message}`);
    }

    return { feedbackId, feedback, ao };
  },
});

// ──────────────────────────────────────────────────
// Step 2: agent-propose
// ──────────────────────────────────────────────────

const agentProposeStep = createStep({
  id: 'agent-propose',
  inputSchema: enrichedContextSchema,
  outputSchema: agentProposalSchema,
  execute: async ({ inputData }) => {
    const { feedbackId, feedback, ao } = inputData;

    const prompt = `Un AO a été signalé comme non pertinent par un consultant Balthazar.

## Informations sur l'AO
- Titre : ${ao.title}
- Acheteur : ${ao.acheteur ?? '—'}
- Raison de sélection initiale : ${ao.human_readable_reason ?? '—'}
- Decision gate : ${ao.decision_gate ?? '—'}
- Raison de rejet initiale : ${ao.rejet_raison ?? '—'}
- LLM skipped : ${ao.llm_skipped ? 'Oui (' + ao.llm_skip_reason + ')' : 'Non'}

## Retour du consultant
${feedback.reason ?? '(aucune raison fournie)'}

Diagnostique la cause du faux positif et propose une correction ciblée.`;

    const result = await aoFeedbackTuningAgent.generate(prompt, {
      structuredOutput: { schema: feedbackProposalSchema },
    });

    const proposal = result.object as z.infer<typeof feedbackProposalSchema>;

    // Update feedback in DB
    await supabase
      .from('ao_feedback')
      .update({
        status: 'agent_proposed',
        agent_diagnosis: proposal.diagnosis_fr,
        agent_proposal: proposal.proposal_fr,
        correction_type: proposal.correction_type,
      })
      .eq('id', feedbackId);

    return { feedbackId, feedback, ao, proposal };
  },
});

// ──────────────────────────────────────────────────
// Step 3: user-confirm (HITL)
// ──────────────────────────────────────────────────

const userConfirmStep = createStep({
  id: 'user-confirm',
  inputSchema: agentProposalSchema,
  outputSchema: userConfirmOutputSchema,
  resumeSchema: userConfirmResumeSchema,
  execute: async ({ inputData, resumeData, runId, suspend }) => {
    const { feedbackId, feedback, ao, proposal } = inputData;

    // If resumed with a decision
    if (resumeData) {
      const { approved } = resumeData;

      await supabase
        .from('ao_feedback')
        .update({ status: approved ? 'agent_proposed' : 'rejected' })
        .eq('id', feedbackId);

      return { feedbackId, feedback, ao, proposal, approved };
    }

    // First pass: send email and suspend
    await supabase
      .from('ao_feedback')
      .update({ status: 'awaiting_confirm' })
      .eq('id', feedbackId);

    const mastraUrl = process.env.MASTRA_URL ?? '';
    const token = signFeedbackToken(feedback.source_id);
    const confirmUrl = `${mastraUrl}/api/feedback/confirm?runId=${runId}&approved=true&ao_id=${feedback.source_id}&token=${token}`;
    const rejectUrl = `${mastraUrl}/api/feedback/confirm?runId=${runId}&approved=false&ao_id=${feedback.source_id}&token=${token}`;

    const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><style>
body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; }
.box { background: #f8f9fa; border-left: 4px solid #007bff; padding: 16px; margin: 16px 0; }
.btn { display: inline-block; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: 600; margin-right: 8px; }
.btn-confirm { background: #28a745; color: white; }
.btn-reject { background: #dc3545; color: white; }
</style></head>
<body>
  <h2>Correction proposée par l'agent</h2>
  <p><strong>AO signalé :</strong> ${escapeHtml(ao.title)}</p>

  <div class="box">
    <strong>Diagnostic :</strong><br>${escapeHtml(proposal.diagnosis_fr)}
  </div>

  <div class="box">
    <strong>Proposition :</strong><br>${escapeHtml(proposal.proposal_fr)}<br>
    <em>Type : ${proposal.correction_type === 'keyword_red_flag' ? 'Ajout red flag' : 'Chunk RAG'}</em>
    ${proposal.correction_type === 'keyword_red_flag' && proposal.technical_payload.red_flag_to_add
      ? `<br>Valeur : <code>${escapeHtml(proposal.technical_payload.red_flag_to_add)}</code>`
      : ''}
  </div>

  <div class="box">
    <strong>Impact attendu :</strong><br>${escapeHtml(proposal.impact_fr)}
    ${proposal.conflicts_with_existing ? `<br><strong style="color:#dc3545">⚠️ Conflit potentiel :</strong> ${escapeHtml(proposal.conflict_detail ?? '')}` : ''}
  </div>

  <p>
    <a href="${confirmUrl}" class="btn btn-confirm">✅ Confirmer la correction</a>
    <a href="${rejectUrl}" class="btn btn-reject">❌ Refuser</a>
  </p>
</body>
</html>`;

    const emailText = `Correction proposée pour AO : ${ao.title}

Diagnostic : ${proposal.diagnosis_fr}

Proposition : ${proposal.proposal_fr}
Type : ${proposal.correction_type}

Impact : ${proposal.impact_fr}

Confirmer : ${confirmUrl}
Refuser : ${rejectUrl}`;

    await sendEmail(
      `[Balthazar] Correction à confirmer — ${ao.title.slice(0, 50)}`,
      emailHtml,
      emailText
    );

    await suspend({ feedbackId, runId, proposal });

    // Unreachable after suspend, but required for type inference
    return { feedbackId, feedback, ao, proposal, approved: false };
  },
});

// ──────────────────────────────────────────────────
// Step 4: apply-correction
// ──────────────────────────────────────────────────

const applyCorrectionStep = createStep({
  id: 'apply-correction',
  inputSchema: userConfirmOutputSchema,
  outputSchema: z.object({ applied: z.boolean(), message: z.string() }),
  execute: async ({ inputData }) => {
    const { feedbackId, feedback, proposal, approved } = inputData;

    if (!approved) {
      await supabase.from('ao_feedback').update({ status: 'rejected' }).eq('id', feedbackId);
      return { applied: false, message: 'Correction refusée par l\'utilisateur.' };
    }

    const { correction_type, technical_payload } = proposal;

    if (correction_type === 'keyword_red_flag') {
      const value = technical_payload.red_flag_to_add;
      if (!value) {
        return { applied: false, message: 'Aucun red flag à ajouter.' };
      }

      const { error } = await supabase.from('keyword_overrides').insert({
        client_id: feedback.client_id ?? 'balthazar',
        type: 'red_flag',
        value,
        reason: proposal.proposal_fr,
        feedback_id: feedbackId,
        active: true,
      });

      if (error) throw new Error(`Erreur insertion keyword_override: ${error.message}`);

      console.log(`✅ Red flag "${value}" ajouté pour ${feedback.client_id}`);

    } else if (correction_type === 'rag_chunk') {
      const { chunk_title, chunk_content, chunk_type } = technical_payload;
      if (!chunk_content) {
        return { applied: false, message: 'Aucun contenu de chunk fourni.' };
      }

      await insertAndIndexChunk({
        indexName: 'policies',
        text: chunk_content,
        metadata: {
          chunk_id: `feedback_${feedbackId}`,
          title: chunk_title ?? 'Correction feedback',
          type: chunk_type ?? 'exclusion_rule',
          source: 'feedback',
          feedback_id: feedbackId,
        },
      });

      console.log(`✅ Chunk RAG inséré depuis feedback ${feedbackId}`);
    }

    await supabase.from('ao_feedback').update({ status: 'applied' }).eq('id', feedbackId);

    return { applied: true, message: `Correction "${correction_type}" appliquée.` };
  },
});

// ──────────────────────────────────────────────────
// Workflow assembly
// ──────────────────────────────────────────────────

export const feedbackWorkflow = createWorkflow({
  id: 'feedbackWorkflow',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ applied: z.boolean(), message: z.string() }),
})
  .then(enrichContextStep)
  .then(agentProposeStep)
  .then(userConfirmStep)
  .then(applyCorrectionStep)
  .commit();

// ──────────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
