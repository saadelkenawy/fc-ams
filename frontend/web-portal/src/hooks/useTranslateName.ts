'use client';

import { useState } from 'react';
import { chatbotApi } from '@/lib/api';

export function useTranslateName() {
  const [translating, setTranslating] = useState<'ar' | 'en' | null>(null);

  async function translate(name: string, from: 'ar' | 'en'): Promise<string> {
    const target = from === 'ar' ? 'en' : 'ar';
    setTranslating(target);
    try {
      const { data } = await chatbotApi.post<{ data: { transliterated: string } }>(
        '/chat/translate-name',
        { name, from },
      );
      return data.data.transliterated ?? '';
    } catch {
      return '';
    } finally {
      setTranslating(null);
    }
  }

  return { translate, translating };
}
