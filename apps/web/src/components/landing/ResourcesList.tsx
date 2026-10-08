import { Link } from 'react-router-dom';
import { ARTICLES } from '../../content/blog';
import ArticleCard from '../blog/ArticleCard';

/** Los 3 artículos más recientes. Vive en su propio chunk (arrastra el contenido del blog) y se carga al acercarse a la sección. */
export default function ResourcesList() {
  const latest = ARTICLES.slice(0, 3);
  if (!latest.length) return null;
  return (
    <>
      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {latest.map(a => <li key={a.slug}><ArticleCard a={a} headingLevel={3} /></li>)}
      </ul>
      <div className="mt-10 text-center">
        <Link to="/blog" className="btn btn-ink">Ver todos los recursos <i className="ph ph-arrow-right" aria-hidden="true" /></Link>
      </div>
    </>
  );
}
