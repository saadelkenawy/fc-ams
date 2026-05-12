import type { Metadata } from 'next';
import { fontVariables } from '@/lib/fonts';
import { Providers } from '@/components/shared/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'فضل كلينك | Fadl Clinic', template: '%s | Fadl Clinic' },
  description: 'نظام إدارة فضل كلينك | Fadl Clinic Management System',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-density="comfortable" data-text-size="md" suppressHydrationWarning>
      <body className={fontVariables}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
