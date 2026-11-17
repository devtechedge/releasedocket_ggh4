import { redactForLog } from '@/domain/security';

export interface EmailMessageInput {
  to: string;
  subject: string;
  textBody: string;
}

export interface EmailSendResult {
  provider: 'resend' | 'local_outbox_log';
  delivered: boolean;
  messageId: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTransactionalEmail(
  msg: EmailMessageInput
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || 'receipts@releasedocket.example';

  if (!apiKey) {
    console.info(
      '[ReleaseDocket Email Outbox - Disconnected]',
      JSON.stringify(
        redactForLog({
          to: msg.to,
          from,
          subject: msg.subject,
        })
      )
    );
    return {
      provider: 'local_outbox_log',
      delivered: true,
      messageId: `local-${Date.now()}`,
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.textBody,
    }),
  });

  if (!res.ok) {
    throw new Error(`Email provider error (${res.status})`);
  }
  const data = (await res.json()) as { id?: string };
  return {
    provider: 'resend',
    delivered: true,
    messageId: data.id ?? `resend-${Date.now()}`,
  };
}
