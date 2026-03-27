/**
 * Feedback HTTP handlers for the AO feedback system.
 *
 * GET  /api/feedback          — Show feedback form for an AO
 * POST /api/feedback/submit   — Submit feedback and trigger workflow
 * GET  /api/feedback/confirm  — Confirm or reject agent proposal (HITL resume)
 */

import { createClient } from '@supabase/supabase-js';
import { verifyFeedbackToken, signFeedbackToken } from '../../utils/feedback-token';
import { inngest } from '../inngest';
import type { Mastra } from '@mastra/core/mastra';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/feedback
// ─────────────────────────────────────────────────────────────────────────────

export async function handleFeedbackForm(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const aoId = url.searchParams.get('ao_id');
  const token = url.searchParams.get('token');

  if (!aoId || !token || !verifyFeedbackToken(aoId, token)) {
    return new Response('Lien invalide ou expiré.', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const { data: ao, error } = await supabase
    .from('appels_offres')
    .select('title, acheteur, deadline, url_ao, human_readable_reason, source_id')
    .eq('source_id', aoId)
    .single();

  if (error || !ao) {
    return new Response('Appel d\'offres introuvable.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const deadlineFormatted = ao.deadline
    ? new Date(ao.deadline).toLocaleDateString('fr-FR')
    : '—';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signaler un AO non pertinent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #333; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    textarea { width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
    button { margin-top: 12px; background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background: #c82333; }
    .reason-badge { background: #f8f9fa; border-left: 3px solid #6c757d; padding: 8px 12px; font-size: 13px; margin-bottom: 20px; color: #555; }
  </style>
</head>
<body>
  <h1>${escapeHtml(ao.title)}</h1>
  <div class="meta">
    ${ao.acheteur ? `<strong>Acheteur :</strong> ${escapeHtml(ao.acheteur)}<br>` : ''}
    ${ao.deadline ? `<strong>Date limite :</strong> ${deadlineFormatted}<br>` : ''}
    ${ao.url_ao ? `<a href="${escapeHtml(ao.url_ao)}" target="_blank">Voir l'annonce →</a>` : ''}
  </div>
  ${ao.human_readable_reason ? `<div class="reason-badge">Décision initiale : ${escapeHtml(ao.human_readable_reason)}</div>` : ''}
  <form method="POST" action="${process.env.MASTRA_URL}/api/feedback/submit">
    <input type="hidden" name="ao_id" value="${escapeHtml(aoId)}">
    <input type="hidden" name="token" value="${escapeHtml(token)}">
    <label for="reason">Pourquoi cet AO n'est-il pas pertinent pour Balthazar ?</label>
    <textarea id="reason" name="reason" placeholder="Ex: hors secteur, trop opérationnel, concurrent identifié..."></textarea>
    <button type="submit">Signaler comme non pertinent</button>
  </form>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/feedback/submit
// ─────────────────────────────────────────────────────────────────────────────

export async function handleFeedbackSubmit(req: Request): Promise<Response> {
  let body: Record<string, string>;
  try {
    const formData = await req.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } catch {
    return new Response('Requête invalide.', { status: 400 });
  }

  const { ao_id: aoId, token, reason } = body;

  if (!aoId || !token || !verifyFeedbackToken(aoId, token)) {
    return new Response('Lien invalide ou expiré.', { status: 400 });
  }

  // Insert feedback
  const { data: feedback, error } = await supabase
    .from('ao_feedback')
    .insert({
      source_id: aoId,
      client_id: 'balthazar',
      feedback: 'not_relevant',
      reason: reason ?? '',
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !feedback) {
    console.error('[feedback-submit] Insert error:', error);
    return new Response('Erreur lors de l\'enregistrement.', { status: 500 });
  }

  // Trigger Inngest event
  await inngest.send({
    name: 'ao.feedback.submitted',
    data: { feedbackId: feedback.id, aoId },
  });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Signalement enregistré</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; color: #333; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h1>Signalement enregistré</h1>
  <p>Merci. Le système va analyser ce retour et vous proposer une correction sous peu.</p>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/feedback/confirm
// ─────────────────────────────────────────────────────────────────────────────

export async function handleFeedbackConfirm(req: Request, mastra: Mastra): Promise<Response> {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  const approvedStr = url.searchParams.get('approved');
  const aoId = url.searchParams.get('ao_id');
  const token = url.searchParams.get('token');

  if (!runId || !approvedStr || !aoId || !token || !verifyFeedbackToken(aoId, token)) {
    return new Response('Lien invalide ou paramètres manquants.', { status: 400 });
  }

  const approved = approvedStr === 'true';

  try {
    const workflow = mastra.getWorkflow('feedbackWorkflow');
    const run = await workflow.getWorkflowRunById(runId);

    if (!run) {
      return new Response('Run introuvable.', { status: 404 });
    }

    await run.resume({
      step: 'user-confirm',
      resumeData: { approved },
    });
  } catch (err: any) {
    console.error('[feedback-confirm] Resume error:', err?.message);
    return new Response('Erreur lors de la reprise du workflow.', { status: 500 });
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${approved ? 'Correction confirmée' : 'Correction refusée'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; color: #333; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="icon">${approved ? '✅' : '❌'}</div>
  <h1>${approved ? 'Correction confirmée' : 'Correction refusée'}</h1>
  <p>${approved ? 'La correction a été appliquée au système.' : 'La proposition de correction a été rejetée.'}</p>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
