import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import CookieConsent from './components/landing/CookieConsent';
import { applySeo, DEFAULT_DESC } from './components/Seo';
import { RequireAuth, RequireScreen } from './components/Guards';
import { NAV, homeFor } from './lib/access';
import { needsServerSetup } from './lib/api';
import { isNative } from './lib/native';
import { isAppShell, isPublicPath } from './lib/publicRoutes';
import { LEGAL_ROUTES, SITE } from './lib/site';
import { useSession } from './lib/session';
import { screenComponent } from './screens';

// Code-splitting: la landing/legales y la app interna viven en bundles distintos.
const Landing = lazy(() => import('./pages/Landing'));
const Terminos = lazy(() => import('./pages/legal/Terminos'));
const Privacidad = lazy(() => import('./pages/legal/Privacidad'));
const Cookies = lazy(() => import('./pages/legal/Cookies'));
const DerechosArco = lazy(() => import('./pages/legal/DerechosArco'));
const BlogIndex = lazy(() => import('./pages/blog/BlogIndex'));
const BlogArticle = lazy(() => import('./pages/blog/BlogArticle'));
const Login = lazy(() => import('./pages/Login'));
const ServerSetup = lazy(() => import('./pages/ServerSetup'));
const AppLayout = lazy(() => import('./layouts/AppLayout'));
const MobileLayout = lazy(() => import('./mobile/MobileLayout'));
const TutorApp = lazy(() => import('./mobile/TutorApp'));
const ListaApp = lazy(() => import('./mobile/ListaApp'));

const SCREEN_IDS = NAV.flatMap(g => g.items.map(i => i[0]));

// SEO de las páginas legales (canonical, OG, robots). Títulos y descripciones = los de cada página en src/pages/legal.
const LEGAL_SEO: Record<string, { title: string; description: string }> = {
  [LEGAL_ROUTES.terminos]: { title: 'Términos y Condiciones', description: 'Términos y condiciones de uso del sitio web y de la licencia del sistema de gestión escolar STODIA en República Dominicana.' },
  [LEGAL_ROUTES.privacidad]: { title: 'Política de Privacidad', description: 'Cómo STODIA trata los datos personales conforme a la Ley 172-13 de República Dominicana: finalidades, derechos ARCO, menores, seguridad y transferencias.' },
  [LEGAL_ROUTES.cookies]: { title: 'Política de Cookies', description: 'Qué cookies y almacenamiento local usa STODIA, para qué sirven, cuánto duran y cómo puede gestionarlas o retirar su consentimiento.' },
  [LEGAL_ROUTES.arco]: { title: 'Derechos ARCO', description: 'Guía y plantilla para ejercer los derechos de acceso, rectificación, cancelación y oposición sobre sus datos personales en STODIA, conforme a la Ley 172-13.' },
};

/** En la app nativa, PWA instalada o Electron `/` no es marketing: va directo al login/inicio. */
const isAppContext = () => isNative || isAppShell();

function Home() {
  const { user } = useSession();
  return <Navigate to={user ? homeFor(user.rol) : '/login'} replace />;
}

/** `/` muestra la landing en el navegador; en la app (nativa/PWA/Electron) conserva el comportamiento anterior. */
function Root() {
  return isAppContext() ? <Home /> : <Landing />;
}

export default function App() {
  const { pathname } = useLocation();
  const publicPath = isPublicPath(pathname) && !(pathname === '/' && isAppContext());

  // Rutas de la app: título genérico y noindex (la landing/legales ponen su propio SEO con <Seo/>).
  useEffect(() => {
    const clean = pathname.replace(/\/+$/, '') || '/';
    const legal = LEGAL_SEO[clean];
    if (legal) applySeo({ title: `${legal.title} | ${SITE.name}`, description: legal.description, path: clean });
    else if (!publicPath) applySeo({ title: 'STODIA | Sistema Escolar Integral', description: DEFAULT_DESC, path: pathname, noindex: true });
  }, [publicPath, pathname]);

  // La landing y las páginas legales son accesibles sin servidor configurado; el resto exige /servidor en nativo.
  if (!publicPath && needsServerSetup() && pathname !== '/servidor') return <Navigate to="/servidor" replace />;

  return (
    <>
      <Suspense fallback={publicPath ? <div style={{ minHeight: '100vh' }} /> : <div className="p-6 text-sm text-slate-500">Cargando…</div>}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          <Route path={LEGAL_ROUTES.terminos} element={<Terminos />} />
          <Route path={LEGAL_ROUTES.privacidad} element={<Privacidad />} />
          <Route path={LEGAL_ROUTES.cookies} element={<Cookies />} />
          <Route path={LEGAL_ROUTES.arco} element={<DerechosArco />} />

          <Route path="/login" element={<Login />} />
          <Route path="/servidor" element={<ServerSetup />} />
          <Route path="/sin-acceso" element={<div className="p-6">Tu rol no tiene pantallas asignadas.</div>} />

          {/* Móvil / PWA */}
          <Route path="/m" element={<RequireAuth><MobileLayout /></RequireAuth>}>
            <Route path="tutor/*" element={<RequireScreen id="portal"><TutorApp /></RequireScreen>} />
            <Route path="lista/*" element={<RequireScreen id="asistencia"><ListaApp /></RequireScreen>} />
          </Route>

          {/* Escritorio: una ruta por pantalla de NAV; `/*` permite sub-rutas dentro de la pantalla */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            {SCREEN_IDS.map(id => {
              const Screen = screenComponent(id);
              return Screen ? (
                <Route key={id} path={`/${id}/*`} element={<RequireScreen id={id}><Screen /></RequireScreen>} />
              ) : null;
            })}
          </Route>

          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      {publicPath && <CookieConsent />}
    </>
  );
}
