import type { Metadata } from 'next';
import { fontVariables } from '@/lib/fonts';
import { Providers } from '@/components/shared/Providers';
import { CoreUIStyles } from '@/components/layout/CoreUIStyles';
// CoreUI base (LTR) loads before our globals so our design tokens + Tailwind win
// the cascade on shared base selectors. RTL is layered on at runtime by
// <CoreUIStyles/>; dark mode via data-coreui-theme set in ThemeContext.
import '@coreui/coreui/dist/css/coreui.min.css';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'فضل كلينك | Fadl Clinic', template: '%s | Fadl Clinic' },
  description: 'نظام إدارة فضل كلينك | Fadl Clinic Management System',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-density="comfortable" data-text-size="md" data-coreui-theme="light" suppressHydrationWarning>
      <body className={fontVariables}>
        <Providers>
          <CoreUIStyles />
          {children}
        </Providers>
      </body>
    </html>
  );
}
