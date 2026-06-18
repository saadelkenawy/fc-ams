'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CContainer } from '@coreui/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { GlobalSearchOverlay } from '@/components/layout/GlobalSearchOverlay';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';

const PAGE_EASE = [0.25, 0.46, 0.45, 0.94] as const;
const UNFOLDABLE_KEY = 'fcms_sidebar_unfoldable';

function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced  = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: reduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -6 }}
        transition={{ duration: reduced ? 0 : 0.2, ease: PAGE_EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [unfoldable, setUnfoldable]   = useState(false);

  useEffect(() => {
    setUnfoldable(localStorage.getItem(UNFOLDABLE_KEY) === '1');
  }, []);

  function toggleUnfoldable() {
    setUnfoldable((v) => {
      const next = !v;
      localStorage.setItem(UNFOLDABLE_KEY, next ? '1' : '0');
      return next;
    });
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-atmospheric">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--gradient-logo)' }}>
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
            </svg>
          </div>
          <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      {/* Skip to main content — visible on keyboard focus only */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        تخطي للمحتوى / Skip to main content
      </a>

      {/* Flex row: in-flow CoreUI sidebar (order:-1) + content wrapper. On <lg
          CoreUI switches the sidebar to fixed off-canvas, toggled by `visible`. */}
      <div className="d-flex min-vh-100">
        <Sidebar
          visible={sidebarVisible}
          unfoldable={unfoldable}
          onUnfoldableToggle={toggleUnfoldable}
        />

        <div className="wrapper d-flex flex-column flex-grow-1 min-vh-100 bg-atmospheric" style={{ minWidth: 0 }}>
          <Header onMobileMenuToggle={() => setSidebarVisible((o) => !o)} onSearchOpen={() => setSearchOpen(true)} />
          <main id="main-content" className="body flex-grow-1" tabIndex={-1}>
            <CContainer fluid className="px-3 px-lg-4 py-4">
              <ErrorBoundary><PageTransition>{children}</PageTransition></ErrorBoundary>
            </CContainer>
          </main>
        </div>
      </div>

      <GlobalSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
