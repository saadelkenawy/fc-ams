'use client';

import { useEffect } from 'react';
import { useLang } from '@/contexts/LanguageContext';

/**
 * CoreUI ships separate prebuilt LTR and RTL stylesheets. The LTR base is
 * imported statically in the root layout (so it lands in the cascade before our
 * globals). When the UI is in RTL we additionally load the RTL sheet from
 * /public — it declares the same selectors with mirrored values and, loading
 * last, wins for the flipped properties. Removing it reverts to LTR.
 */
const RTL_HREF = '/coreui/coreui.rtl.min.css';
const RTL_ID = 'coreui-rtl-stylesheet';

export function CoreUIStyles() {
  const { dir } = useLang();

  useEffect(() => {
    const existing = document.getElementById(RTL_ID) as HTMLLinkElement | null;

    if (dir === 'rtl') {
      if (!existing) {
        const link = document.createElement('link');
        link.id = RTL_ID;
        link.rel = 'stylesheet';
        link.href = RTL_HREF;
        document.head.appendChild(link);
      }
    } else if (existing) {
      existing.remove();
    }
  }, [dir]);

  return null;
}
