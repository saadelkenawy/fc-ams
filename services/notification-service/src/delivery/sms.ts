import { config } from '../config';

export async function sendSms(to: string, body: string): Promise<'sent' | 'skipped' | 'failed'> {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
    console.info('[sms] Twilio not configured — skipping delivery for:', to);
    return 'skipped';
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`;
    const creds = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: config.TWILIO_FROM_NUMBER, Body: body });
    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    return res.ok ? 'sent' : 'failed';
  } catch (err) {
    console.error('[sms] Send failed:', err);
    return 'failed';
  }
}
