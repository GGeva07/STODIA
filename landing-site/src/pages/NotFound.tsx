import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import BlogLayout from '../components/blog/BlogLayout';

export default function NotFound() {
  return (
    <BlogLayout>
      <Seo title="Página no encontrada | STODIA" description="La página que buscas no existe o fue movida." path="/404" noindex />
      <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="font-hand text-6xl font-bold text-accent">404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">No encontramos esta página</h1>
        <p className="mt-4 text-slate-700">Puede que el enlace esté desactualizado. Vuelve al inicio o revisa los recursos del blog.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn btn-primary">Ir al inicio</Link>
          <Link to="/blog" className="btn btn-ghost">Ver el blog</Link>
        </div>
      </section>
    </BlogLayout>
  );
}
