import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import CookieConsent from './components/landing/CookieConsent';
import { LEGAL_ROUTES } from './lib/site';

const Landing = lazy(() => import('./pages/Landing'));
const BlogIndex = lazy(() => import('./pages/blog/BlogIndex'));
const BlogArticle = lazy(() => import('./pages/blog/BlogArticle'));
const Terminos = lazy(() => import('./pages/legal/Terminos'));
const Privacidad = lazy(() => import('./pages/legal/Privacidad'));
const Cookies = lazy(() => import('./pages/legal/Cookies'));
const DerechosArco = lazy(() => import('./pages/legal/DerechosArco'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Al cambiar de ruta (sin ancla) vuelve arriba. */
function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          <Route path={LEGAL_ROUTES.terminos} element={<Terminos />} />
          <Route path={LEGAL_ROUTES.privacidad} element={<Privacidad />} />
          <Route path={LEGAL_ROUTES.cookies} element={<Cookies />} />
          <Route path={LEGAL_ROUTES.arco} element={<DerechosArco />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CookieConsent />
    </>
  );
}
