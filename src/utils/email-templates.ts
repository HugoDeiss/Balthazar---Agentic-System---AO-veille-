/**
 * Email Templates for AO Veille Workflow
 * 
 * Generates HTML email content for daily AO monitoring summaries.
 */

export interface EmailData {
  date: string; // Date of the report (today's date - when email is sent)
  statsBySource: {
    BOAMP: { total: number; high: number; medium: number; low: number };
    MARCHESONLINE: { total: number; high: number; medium: number; low: number };
  };
  relevantAOs: Array<{
    source: string;
    title: string;
    url: string;
    semanticReason: string;
    priority: 'HIGH' | 'MEDIUM';
    acheteur?: string;
    deadline?: string;
  }>;
  lowPriorityAOs: Array<{
    source: string;
    title: string;
    url: string;
    reason?: string; // Explanation why this AO is low priority
  }>;
  noAOsReason?: string; // Explanation if no AOs analyzed
}

/**
 * Format a date string to French format (DD/MM/YYYY)
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date string to French format with day name
 */
function formatDateWithDay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    const dateFormatted = formatDate(dateStr);
    return `${dayName} ${dateFormatted}`;
  } catch {
    return dateStr;
  }
}

/**
 * Generate HTML email content from structured data
 */
export function generateEmailHTML(data: EmailData): string {
  const dateFormatted = formatDateWithDay(data.date);
  const totalAnalyzed = data.statsBySource.BOAMP.total + data.statsBySource.MARCHESONLINE.total;
  const totalRelevant = data.relevantAOs.length;
  const totalLow = data.lowPriorityAOs.length;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veille Appels d'Offres - ${dateFormatted}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 30px 20px; background-color: #1a1a1a; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Veille Appels d'Offres</h1>
              <p style="margin: 10px 0 0; color: #cccccc; font-size: 14px;">${dateFormatted}</p>
            </td>
          </tr>
          
          <!-- Summary Stats -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 20px; font-weight: 600;">Récapitulatif</h2>
              ${totalAnalyzed === 0 ? `
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>Aucun appel d'offres analysé</strong><br>
                  ${data.noAOsReason || 'Aucun appel d\'offres n\'a été trouvé pour cette date.'}
                </p>
              </div>
              ` : `
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
                <p style="margin: 0 0 10px; color: #1a1a1a; font-size: 16px;">
                  <strong>${totalAnalyzed}</strong> appel${totalAnalyzed > 1 ? 's' : ''} d'offres analysé${totalAnalyzed > 1 ? 's' : ''}
                </p>
                ${totalRelevant > 0 ? `
                <p style="margin: 5px 0; color: #28a745; font-size: 14px;">
                  <strong>${totalRelevant}</strong> appel${totalRelevant > 1 ? 's' : ''} pertinent${totalRelevant > 1 ? 's' : ''} (HIGH/MEDIUM)
                </p>
                ` : `
                <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
                  Aucun appel d'offres pertinent identifié
                </p>
                `}
                ${totalLow > 0 ? `
                <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
                  <strong>${totalLow}</strong> appel${totalLow > 1 ? 's' : ''} d'offres à faible priorité (LOW)
                </p>
                ` : ''}
              </div>
              `}
            </td>
          </tr>
          
          ${data.statsBySource.BOAMP.total > 0 ? `
          <!-- BOAMP Section -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 15px; color: #1a1a1a; font-size: 18px; font-weight: 600;">BOAMP</h2>
              <p style="margin: 0 0 15px; color: #6c757d; font-size: 14px;">
                ${data.statsBySource.BOAMP.total} appel${data.statsBySource.BOAMP.total > 1 ? 's' : ''} d'offres analysé${data.statsBySource.BOAMP.total > 1 ? 's' : ''}
                ${data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium > 0 ? `(${data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium} pertinent${data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium > 1 ? 's' : ''})` : ''}
              </p>
            </td>
          </tr>
          ` : ''}
          
          ${data.statsBySource.MARCHESONLINE.total > 0 ? `
          <!-- MarchesOnline Section -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 15px; color: #1a1a1a; font-size: 18px; font-weight: 600;">MarchesOnline</h2>
              <p style="margin: 0 0 15px; color: #6c757d; font-size: 14px;">
                ${data.statsBySource.MARCHESONLINE.total} appel${data.statsBySource.MARCHESONLINE.total > 1 ? 's' : ''} d'offres analysé${data.statsBySource.MARCHESONLINE.total > 1 ? 's' : ''}
                ${data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium > 0 ? `(${data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium} pertinent${data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium > 1 ? 's' : ''})` : ''}
              </p>
            </td>
          </tr>
          ` : ''}
          
          ${data.relevantAOs.length > 0 ? `
          <!-- Relevant AOs Section -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 18px; font-weight: 600;">Appels d'Offres Pertinents</h2>
              ${data.relevantAOs.map((ao, index) => `
              <div style="background-color: #f8f9fa; border-left: 4px solid ${ao.priority === 'HIGH' ? '#198754' : '#6cbf47'}; padding: 20px; margin-bottom: 15px; border-radius: 4px;">
                <div style="display: inline-block; background-color: ${ao.priority === 'HIGH' ? '#198754' : '#6cbf47'}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 10px;">
                  ${ao.priority === 'HIGH' ? 'HAUTE PRIORITÉ' : 'PRIORITÉ MOYENNE'}
                </div>
                <h3 style="margin: 0 0 10px; color: #1a1a1a; font-size: 16px; font-weight: 600;">
                  <a href="${ao.url}" style="color: #007bff; text-decoration: none;">${ao.title}</a>
                </h3>
                ${ao.acheteur ? `
                <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
                  <strong>Acheteur:</strong> ${ao.acheteur}
                </p>
                ` : ''}
                ${ao.deadline ? `
                <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
                  <strong>Date limite:</strong> ${formatDate(ao.deadline)}
                </p>
                ` : ''}
                <p style="margin: 10px 0 0; color: #1a1a1a; font-size: 14px; line-height: 1.6;">
                  <strong>Justification:</strong> ${ao.semanticReason}
                </p>
                <p style="margin: 10px 0 0;">
                  <a href="${ao.url}" style="display: inline-block; background-color: #007bff; color: #ffffff; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">Voir l'appel d'offres →</a>
                </p>
              </div>
              `).join('')}
            </td>
          </tr>
          ` : ''}
          
          ${data.lowPriorityAOs.length > 0 ? `
          <!-- Low Priority AOs Section -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <h2 style="margin: 0 0 15px; color: #1a1a1a; font-size: 18px; font-weight: 600;">Appels d'Offres à Faible Priorité</h2>
              ${data.relevantAOs.length === 0 ? `
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>Pourquoi aucun AO n'est pertinent ?</strong><br>
                  Les appels d'offres ci-dessous ont été analysés mais n'ont pas été jugés pertinents pour Balthazar selon les critères d'analyse sémantique et de mots-clés.
                </p>
              </div>
              ` : `
              <p style="margin: 0 0 15px; color: #6c757d; font-size: 14px;">
                Les appels d'offres suivants ont été analysés mais jugés moins pertinents que ceux listés ci-dessus.
              </p>
              `}
              <div style="margin-top: 15px;">
                ${data.lowPriorityAOs.map(ao => `
                <div style="background-color: #f8f9fa; border-left: 4px solid #e83e8c; padding: 15px; margin-bottom: 12px; border-radius: 4px;">
                  <div style="margin-bottom: 8px;">
                    <span style="display: inline-block; background-color: #e83e8c; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-right: 8px;">FAIBLE PRIORITÉ</span>
                    <a href="${ao.url}" style="color: #007bff; text-decoration: none; font-weight: 500;">${ao.title}</a>
                    <span style="color: #adb5bd; font-size: 12px;"> (${ao.source})</span>
                  </div>
                  ${ao.reason ? `
                  <p style="margin: 8px 0 0; color: #6c757d; font-size: 13px; line-height: 1.5;">
                    <strong>Raison:</strong> ${ao.reason}
                  </p>
                  ` : ''}
                </div>
                `).join('')}
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #dee2e6;">
              <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
                Ce message a été généré automatiquement par le système de veille Balthazar.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of email (simple extraction)
 */
export function generateEmailText(data: EmailData): string {
  const dateFormatted = formatDateWithDay(data.date);
  const totalAnalyzed = data.statsBySource.BOAMP.total + data.statsBySource.MARCHESONLINE.total;
  const totalRelevant = data.relevantAOs.length;
  const totalLow = data.lowPriorityAOs.length;

  let text = `Veille Appels d'Offres - ${dateFormatted}\n\n`;
  text += `Récapitulatif\n`;
  text += `${'='.repeat(50)}\n\n`;

  if (totalAnalyzed === 0) {
    text += `Aucun appel d'offres analysé\n`;
    text += `${data.noAOsReason || 'Aucun appel d\'offres n\'a été trouvé pour cette date.'}\n\n`;
  } else {
    text += `${totalAnalyzed} appel${totalAnalyzed > 1 ? 's' : ''} d'offres analysé${totalAnalyzed > 1 ? 's' : ''}\n`;
    if (totalRelevant > 0) {
      text += `${totalRelevant} appel${totalRelevant > 1 ? 's' : ''} pertinent${totalRelevant > 1 ? 's' : ''} (HIGH/MEDIUM)\n`;
    } else {
      text += `Aucun appel d'offres pertinent identifié\n`;
    }
    if (totalLow > 0) {
      text += `${totalLow} appel${totalLow > 1 ? 's' : ''} d'offres à faible priorité (LOW)\n`;
    }
    text += `\n`;
  }

  if (data.statsBySource.BOAMP.total > 0) {
    text += `BOAMP\n`;
    text += `${'-'.repeat(50)}\n`;
    text += `${data.statsBySource.BOAMP.total} appel${data.statsBySource.BOAMP.total > 1 ? 's' : ''} d'offres analysé${data.statsBySource.BOAMP.total > 1 ? 's' : ''}\n`;
    if (data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium > 0) {
      text += `${data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium} pertinent${data.statsBySource.BOAMP.high + data.statsBySource.BOAMP.medium > 1 ? 's' : ''}\n`;
    }
    text += `\n`;
  }

  if (data.statsBySource.MARCHESONLINE.total > 0) {
    text += `MarchesOnline\n`;
    text += `${'-'.repeat(50)}\n`;
    text += `${data.statsBySource.MARCHESONLINE.total} appel${data.statsBySource.MARCHESONLINE.total > 1 ? 's' : ''} d'offres analysé${data.statsBySource.MARCHESONLINE.total > 1 ? 's' : ''}\n`;
    if (data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium > 0) {
      text += `${data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium} pertinent${data.statsBySource.MARCHESONLINE.high + data.statsBySource.MARCHESONLINE.medium > 1 ? 's' : ''}\n`;
    }
    text += `\n`;
  }

  if (data.relevantAOs.length > 0) {
    text += `Appels d'Offres Pertinents\n`;
    text += `${'='.repeat(50)}\n\n`;
    data.relevantAOs.forEach((ao, index) => {
      text += `${index + 1}. [${ao.priority}] ${ao.title}\n`;
      if (ao.acheteur) {
        text += `   Acheteur: ${ao.acheteur}\n`;
      }
      if (ao.deadline) {
        text += `   Date limite: ${formatDate(ao.deadline)}\n`;
      }
      text += `   Justification: ${ao.semanticReason}\n`;
      text += `   Lien: ${ao.url}\n\n`;
    });
  }

  if (data.lowPriorityAOs.length > 0) {
    text += `Appels d'Offres à Faible Priorité\n`;
    text += `${'='.repeat(50)}\n\n`;
    if (data.relevantAOs.length === 0) {
      text += `Pourquoi aucun AO n'est pertinent ?\n`;
      text += `Les appels d'offres ci-dessous ont été analysés mais n'ont pas été jugés pertinents pour Balthazar selon les critères d'analyse sémantique et de mots-clés.\n\n`;
    } else {
      text += `Les appels d'offres suivants ont été analysés mais jugés moins pertinents que ceux listés ci-dessus.\n\n`;
    }
    data.lowPriorityAOs.forEach((ao, index) => {
      text += `${index + 1}. [FAIBLE PRIORITÉ] ${ao.title} (${ao.source})\n`;
      if (ao.reason) {
        text += `   Raison: ${ao.reason}\n`;
      }
      text += `   Lien: ${ao.url}\n\n`;
    });
  }

  text += `\n---\n`;
  text += `Ce message a été généré automatiquement par le système de veille Balthazar.\n`;

  return text;
}

/**
 * Generate email subject line
 */
export function generateEmailSubject(data: EmailData): string {
  const dateFormatted = formatDate(data.date);
  const totalAnalyzed = data.statsBySource.BOAMP.total + data.statsBySource.MARCHESONLINE.total;
  const totalRelevant = data.relevantAOs.length;

  if (totalAnalyzed === 0) {
    return `Veille AO ${dateFormatted} - Aucun appel d'offres analysé`;
  }

  if (totalRelevant === 0) {
    return `Veille AO ${dateFormatted} - ${totalAnalyzed} AO analysé${totalAnalyzed > 1 ? 's' : ''}, aucun pertinent`;
  }

  return `Veille AO ${dateFormatted} - ${totalRelevant} appel${totalRelevant > 1 ? 's' : ''} d'offres pertinent${totalRelevant > 1 ? 's' : ''} sur ${totalAnalyzed} analysé${totalAnalyzed > 1 ? 's' : ''}`;
}
