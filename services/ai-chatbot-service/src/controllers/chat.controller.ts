import Anthropic from '@anthropic-ai/sdk';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import * as repo from '../repositories/chat.repository';
import type { JwtPayload } from '@fadl/types';

const anthropic = config.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT_AR = `أنت مساعد طبي ذكي لعيادة فضل كلينك. مهمتك مساعدة المرضى في:
1. وصف الأعراض وفهمها
2. اقتراح التخصص الطبي المناسب للحجز
3. تقديم نصائح صحية عامة (بدون تشخيص قاطع)

تخصصات العيادة: النساء والعقم، القلب والأوعية الدموية، الجلدية، الأطفال والمواليد، الباطنة، العظام، الأنف والأذن والحنجرة، العيون، الجراحة العامة، طب الأسنان، الأعصاب، الطب النفسي، الأورام، المسالك البولية، الغدد الصماء، التغذية.

قواعد مهمة:
- لا تقدم تشخيصًا طبيًا قاطعًا
- اقترح دائمًا الكشف الطبي عند الطبيب
- إذا كانت الأعراض خطيرة (ألم صدر حاد، صعوبة تنفس، فقدان وعي) → وجّه فورًا لطوارئ
- الرد باللغة العربية دائمًا في هذا الوضع

عند الاقتراح أضف في نهاية ردك JSON في هذا الشكل:
{"action": "book_appointment", "specialty": "اسم التخصص بالعربي", "specialtyEn": "Specialty in English", "urgency": "routine|urgent|emergency"}`;

const SYSTEM_PROMPT_EN = `You are a smart medical assistant for Fadl Clinic. Your role is to help patients with:
1. Describing and understanding symptoms
2. Suggesting the right medical specialty for their appointment
3. Providing general health guidance (no definitive diagnoses)

Clinic specialties: Gynecology & Infertility, Cardiology, Dermatology, Pediatrics & Newborn, Internal Medicine, Orthopedics, ENT, Ophthalmology, General Surgery, Dentistry, Neurology, Psychiatry, Oncology, Urology, Endocrinology, Nutrition.

Important rules:
- Never give a definitive medical diagnosis
- Always recommend seeing a doctor
- For serious symptoms (severe chest pain, difficulty breathing, loss of consciousness) → direct immediately to emergency
- Always respond in English in this mode

When making a recommendation, append at the end of your response this JSON:
{"action": "book_appointment", "specialty": "Arabic specialty name", "specialtyEn": "Specialty in English", "urgency": "routine|urgent|emergency"}`;

const messageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message:   z.string().min(1).max(2000),
  language:  z.enum(['ar', 'en']).default('ar'),
  patientId: z.string().uuid().optional(),
});

function extractAction(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[^{}]*"action"\s*:\s*"book_appointment"[^{}]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
}

export async function sendMessage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const input = messageSchema.parse(request.body);

  // Get or create session
  let session = input.sessionId ? await repo.getSession(input.sessionId) : null;
  if (!session) {
    session = await repo.createSession(input.patientId ?? user.sub, input.language, user.branchId ?? 1);
  }

  // Get conversation history
  const history = await repo.getSessionHistory(session.id, config.MAX_HISTORY_TURNS * 2);

  // Save user message
  await repo.saveMessage(session.id, 'user', input.message);

  // Build messages
  const chatMessages = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: input.message },
  ];

  const systemPrompt = session.language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

  let replyText: string;

  if (config.OPENROUTER_API_KEY) {
    // Use OpenRouter (OpenAI-compatible)
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://fadl-clinic.app',
        'X-Title': 'Fadl Clinic AI Assistant',
      },
      body: JSON.stringify({
        model: config.OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
      }),
    });
    if (!orRes.ok) {
      const errBody = await orRes.text();
      throw new Error(`OpenRouter error ${orRes.status}: ${errBody}`);
    }
    const orJson = await orRes.json() as { choices: { message: { content: string } }[] };
    replyText = orJson.choices[0]?.message?.content ?? '';
  } else if (anthropic) {
    const anthropicMessages: Anthropic.MessageParam[] = chatMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const claudeResponse = await anthropic.messages.create({
      model:      config.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   anthropicMessages,
    });
    replyText = (claudeResponse.content[0] as { type: string; text: string }).text ?? '';
  } else {
    replyText = session.language === 'ar'
      ? 'عذراً، خدمة المساعد الذكي غير متاحة حالياً. يرجى الاتصال بالعيادة مباشرة لحجز موعدك.'
      : 'Sorry, the AI assistant is not configured yet. Please contact the clinic directly to book your appointment.';
  }

  // Extract structured action if present
  const action = extractAction(replyText);
  const cleanReply = replyText.replace(/\{[^{}]*"action"\s*:\s*"book_appointment"[^{}]*\}/g, '').trim();

  // Save assistant reply
  await repo.saveMessage(session.id, 'assistant', cleanReply, action ? { action } : {});

  // Update session context with latest action
  if (action) {
    await repo.updateSessionContext(session.id, { ...session.context, lastAction: action });
  }

  void reply.send({
    success: true,
    data: {
      sessionId:   session.id,
      reply:       cleanReply,
      action:      action ?? null,
      language:    session.language,
    },
  });
}

export async function getSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const session = await repo.getSession(id);
  if (!session) {
    void reply.status(404).send({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Chat session not found' } });
    return;
  }
  const history = await repo.getSessionHistory(id, 100);
  void reply.send({ success: true, data: { session, messages: history } });
}
