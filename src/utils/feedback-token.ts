import { createHmac } from 'crypto';

const secret = () => process.env.FEEDBACK_SECRET!;

export function signFeedbackToken(aoId: string): string {
  return createHmac('sha256', secret()).update(aoId).digest('hex');
}

export function verifyFeedbackToken(aoId: string, token: string): boolean {
  const expected = signFeedbackToken(aoId);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
