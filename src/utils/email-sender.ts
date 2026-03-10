/**
 * Email Sender Utility
 * 
 * Sends emails via Resend API for AO Veille workflow notifications.
 */

import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Recipient list for AO Veille notifications
// Permet un override via variable d'environnement pour les tests locaux :
// RESEND_TO_OVERRIDE="you@example.com,other@example.com"
const OVERRIDE_TO = process.env.RESEND_TO_OVERRIDE;
const RECIPIENTS = OVERRIDE_TO
  ? OVERRIDE_TO.split(',').map(r => r.trim()).filter(Boolean)
  : [
      'l.lamarlere@balthazar.org',
      'p.rigaud@balthazar.org',
      'a.gaillouste@balthazar.org'
    ];

// Sender email (defaults to Resend's default sender when no custom domain is configured)
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

export interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send email to all recipients
 * 
 * @param subject Email subject line
 * @param htmlBody HTML email body
 * @param textBody Plain text email body (fallback)
 * @returns Result object with success status and optional error message
 */
export async function sendEmail(
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<SendEmailResult> {
  // Validate Resend API key
  if (!process.env.RESEND_API_KEY) {
    const error = 'RESEND_API_KEY environment variable is not set';
    console.error(`❌ Email sending failed: ${error}`);
    return { success: false, error };
  }

  try {
    console.log(`📧 Sending email to ${RECIPIENTS.length} recipient(s)...`);
    console.log(`   Subject: ${subject}`);

    // Send email to all recipients
    // Using 'to' field with array of recipients (Resend supports this)
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: RECIPIENTS,
      subject: subject,
      html: htmlBody,
      text: textBody
    });

    if (error) {
      console.error(`❌ Resend API error:`, error);
      return { success: false, error: JSON.stringify(error) };
    }

    if (data?.id) {
      console.log(`✅ Email sent successfully (ID: ${data.id})`);
      return { success: true, messageId: data.id };
    }

    // Fallback: no error but no message ID either
    console.warn(`⚠️ Email sent but no message ID returned`);
    return { success: true };

  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const errorStack = error?.stack || '';
    console.error(`❌ Exception while sending email:`, errorMessage);
    console.error(`   Stack:`, errorStack);
    return { success: false, error: errorMessage };
  }
}
