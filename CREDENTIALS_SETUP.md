# Credentials Setup Guide

This file documents the external credentials that are not yet configured.
All services run fine without them — delivery is gracefully skipped and logged.
Fill these in when you're ready to enable real notifications.

---

## 1. Email (SMTP)

### What it enables
Appointment reminders, billing receipts, password reset emails sent to patients and staff.

### Option A — Gmail (easiest for testing)

1. Go to your Google Account → **Security** → **2-Step Verification** → enable it.
2. Go to **Security** → **App passwords** → create one for "Mail / Other (Custom name)" → name it "Fadl Clinic".
3. Google gives you a 16-character app password (e.g. `abcd efgh ijkl mnop`). Remove the spaces.

Fill in `docker-compose.override.yml`:
```yaml
notification-service:
  environment:
    SMTP_HOST: smtp.gmail.com
    SMTP_PORT: "587"
    SMTP_SECURE: "false"
    SMTP_USER: your-gmail@gmail.com
    SMTP_PASS: abcdefghijklmnop          # 16-char app password, no spaces
    SMTP_FROM: "Fadl Clinic <your-gmail@gmail.com>"
```

### Option B — SendGrid (recommended for production)

1. Sign up at sendgrid.com → free tier allows 100 emails/day.
2. Go to **Settings** → **API Keys** → **Create API Key** → "Full Access".
3. Verify a Sender Identity (your clinic's domain or a single email address).

Fill in `docker-compose.override.yml`:
```yaml
notification-service:
  environment:
    SMTP_HOST: smtp.sendgrid.net
    SMTP_PORT: "587"
    SMTP_SECURE: "false"
    SMTP_USER: apikey                    # literal string "apikey"
    SMTP_PASS: SG.xxxxxxxxxxxxxxxxxxxx   # your SendGrid API key
    SMTP_FROM: "Fadl Clinic <no-reply@yourdomain.com>"
```

### Option C — AWS SES

1. Open AWS Console → **Simple Email Service** → verify your domain or email.
2. Go to **SMTP Settings** → **Create SMTP Credentials** → download the CSV.

Fill in `docker-compose.override.yml`:
```yaml
notification-service:
  environment:
    SMTP_HOST: email-smtp.eu-west-1.amazonaws.com  # use your region
    SMTP_PORT: "587"
    SMTP_SECURE: "false"
    SMTP_USER: AKIAIOSFODNN7EXAMPLE       # from the CSV
    SMTP_PASS: wJalrXUtnFEMI/K7MDENG     # from the CSV
    SMTP_FROM: "Fadl Clinic <no-reply@yourdomain.com>"
```

### After filling in credentials

```bash
docker compose up -d notification-service
# Test by triggering any appointment — the service logs will show "sent" or "failed"
docker compose logs -f notification-service
```

---

## 2. SMS (Twilio)

### What it enables
Appointment reminders and confirmations sent as SMS to patient phone numbers.

### Steps

1. Sign up at [twilio.com](https://www.twilio.com) — free trial gives $15 credit.
2. From the **Console Dashboard**, copy:
   - **Account SID** — starts with `AC`, looks like `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token** — click the eye icon to reveal it
3. Go to **Phone Numbers** → **Manage** → **Buy a number** (or use the free trial number).
   - Choose a number with SMS capability.
   - Copy the number in E.164 format: `+1xxxxxxxxxx`

Fill in `docker-compose.override.yml`:
```yaml
notification-service:
  environment:
    TWILIO_ACCOUNT_SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    TWILIO_AUTH_TOKEN: your_auth_token_here
    TWILIO_FROM_NUMBER: "+1xxxxxxxxxx"
```

### Trial account limitation
Twilio trial accounts can only send SMS to **verified phone numbers**.
Go to **Console** → **Phone Numbers** → **Verified Caller IDs** to add test numbers.
This restriction is removed once you upgrade to a paid account.

### After filling in credentials

```bash
docker compose up -d notification-service
docker compose logs -f notification-service
# Trigger an appointment to generate an SMS notification and watch the logs
```

---

## 3. Applying changes

After editing `docker-compose.override.yml`, restart only the notification service:

```bash
docker compose up -d notification-service
```

No rebuild needed — environment variables are injected at container start.

To verify the service picked up the config:

```bash
docker compose logs notification-service | grep -E "\[email\]|\[sms\]|SMTP|Twilio"
```

---

## 4. Current status

| Channel | Status          | Blocker                        |
|---------|-----------------|--------------------------------|
| Email   | Skipped (logged) | Need SMTP credentials          |
| SMS     | Skipped (logged) | Need Twilio account + number   |
| Chatbot | Working          | OpenRouter key already set     |

---

## 5. Security note

`docker-compose.override.yml` is in `.gitignore` — credentials in it are never committed.
For production deployments, move these values to a secrets manager (AWS Secrets Manager, HashiCorp Vault, Docker Swarm secrets) and inject them at runtime.
