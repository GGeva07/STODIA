// Plugin de Vite del blog (sin dependencias nuevas). En `vite build`, tras copiar dist/:
//  - añade /blog y cada /blog/<slug> a sitemap.xml (lastmod = updated || date)
//  - genera rss.xml
//  - prerenderiza HTML estático por ruta (dist/blog/index.html y dist/blog/<slug>/index.html): el mismo shell de la SPA
//    con title, meta, canonical, Open Graph, JSON-LD y el contenido completo en <noscript> (HTML semántico).
// La SPA se monta igual encima (no es SSR/hidratación): es contenido legible para rastreadores y lectores sin JS.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformWithEsbuild } from 'vite';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadTs(file) {
  const { code } = await transformWithEsbuild(readFileSync(file, 'utf8'), file, { loader: 'ts', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

export default function blogSeo(siteUrl) {
  const site = (siteUrl || 'https://stodia.vercel.app').replace(/\/+$/, '');
  let isBuild = false;
  let outDir = 'dist';

  return {
    name: 'stodia-blog',
    apply: 'build',
    configResolved(c) { isBuild = c.command === 'build'; outDir = c.build.outDir; },
    async closeBundle() {
      if (!isBuild) return;
      const dir = resolve('src/content/blog');
      const inl = await loadTs(resolve('src/lib/inline.ts'));
      const files = readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'index.ts' && f !== 'types.ts' && !f.startsWith('_'));
      const articles = [];
      for (const f of files) {
        try { const m = await loadTs(resolve(dir, f)); if (m.article?.slug) articles.push(m.article); }
        catch (e) { console.warn(`[stodia-blog] no se pudo leer ${f}: ${e.message}`); }
      }
      articles.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
      const slugs = new Set(articles.map(a => a.slug));

      const sitePts = readFileSync(resolve('src/lib/site.ts'), 'utf8');
      const pick = k => new RegExp(k + String.raw`:\s*'([^']+)'`).exec(sitePts)?.[1];
      const ctx = { site, brand: pick('legalName') ?? 'SynsetSolutions', brandUrl: pick('brandUrl') ?? site, image: site + '/og-image.png' };
      const out = p => resolve(outDir, p);

      // ---- sitemap ----
      const sm = out('sitemap.xml');
      if (existsSync(sm)) {
        const last = articles.reduce((m, a) => ((a.updated || a.date) > m ? (a.updated || a.date) : m), '');
        const entries = [
          '  <url><loc>' + site + '/blog</loc>' + (last ? '<lastmod>' + last + '</lastmod>' : '') + '<changefreq>weekly</changefreq><priority>0.8</priority></url>',
          ...articles.map(a => '  <url><loc>' + site + '/blog/' + a.slug + '</loc><lastmod>' + (a.updated || a.date) + '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'),
        ].join('\n');
        const x = readFileSync(sm, 'utf8').replace(/\s*<url><loc>[^<]*\/blog[^<]*<\/loc>.*?<\/url>/g, '');
        writeFileSync(sm, x.replace('</urlset>', entries + '\n</urlset>'));
      }

      // ---- rss ----
      const rfc = d => new Date(d + 'T12:00:00Z').toUTCString();
      const items = articles.map(a => [
        '  <item>',
        '    <title>' + esc(a.title) + '</title>',
        '    <link>' + site + '/blog/' + a.slug + '</link>',
        '    <guid isPermaLink="true">' + site + '/blog/' + a.slug + '</guid>',
        '    <pubDate>' + rfc(a.date) + '</pubDate>',
        '    <category>' + esc(a.category) + '</category>',
        '    <description>' + esc(a.description) + '</description>',
        '  </item>',
      ].join('\n')).join('\n');
      writeFileSync(out('rss.xml'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '<channel>',
        '  <title>Blog de STODIA</title>',
        '  <link>' + site + '/blog</link>',
        '  <description>Recursos para directores y dueños de colegios en República Dominicana.</description>',
        '  <language>es-DO</language>',
        '  <atom:link href="' + site + '/rss.xml" rel="self" type="application/rss+xml" />',
        items,
        '</channel>',
        '</rss>',
        '',
      ].join('\n'));

      // ---- HTML estático por ruta ----
      const shellPath = out('index.html');
      if (!existsSync(shellPath)) return;
      const shell = readFileSync(shellPath, 'utf8');

      const rich = t => inl.parseInline(t, s => slugs.has(s)).map(p =>
        p.k === 'int' ? '<a href="/blog/' + p.slug + '">' + esc(p.v) + '</a>'
        : p.k === 'ext' ? '<a href="' + esc(p.href) + '" rel="noopener noreferrer">' + esc(p.v) + '</a>'
        : p.k === 'b' ? '<strong>' + esc(p.v) + '</strong>' : esc(p.v)).join('');
      const block = b => {
        if (b.t === 'p') return '<p>' + rich(b.text) + '</p>';
        if (b.t === 'h3') return '<h3>' + esc(b.text) + '</h3>';
        if (b.t === 'ul' || b.t === 'ol') return '<' + b.t + '>' + b.items.map(i => '<li>' + rich(i) + '</li>').join('') + '</' + b.t + '>';
        if (b.t === 'callout') return '<aside><strong>' + esc(b.title) + '</strong><p>' + rich(b.text) + '</p></aside>';
        if (b.t === 'table') {
          const cap = b.caption ? '<caption>' + esc(b.caption) + '</caption>' : '';
          const head = '<thead><tr>' + b.head.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead>';
          const rows = b.rows.map(r => '<tr>' + r.map((c, i) => (i === 0 ? '<th scope="row">' + rich(c) + '</th>' : '<td>' + rich(c) + '</td>')).join('') + '</tr>').join('');
          return '<table>' + cap + head + '<tbody>' + rows + '</tbody></table>';
        }
        return '';
      };
      const wrap = inner => '<noscript>\n      <main style="max-width:760px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;line-height:1.6;color:#0F172A">\n'
        + '        <p><a href="/">STODIA</a> / <a href="/blog">Blog</a></p>\n        ' + inner + '\n'
        + '        <p><a href="/#demo">Solicitar una demo de STODIA</a> · <a href="/blog">Más recursos</a> · <a href="/login">Iniciar sesión</a></p>\n      </main>\n    </noscript>';

      const ld = objs => objs.map(o => '<script type="application/ld+json" data-seo-ld>' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n    ');
      const setMeta = (h, attr, key, content) => {
        const re = new RegExp('<meta ' + attr + '="' + key + '" content="[^"]*"\\s*/?>');
        const tag = '<meta ' + attr + '="' + key + '" content="' + esc(content) + '" />';
        return re.test(h) ? h.replace(re, () => tag) : h.replace('</head>', () => '    ' + tag + '\n  </head>');
      };
      const page = ({ title, description, path, type, extra = '', jsonld, body }) => {
        const url = site + path;
        let h = shell
          .replace(/<title>[^<]*<\/title>/, () => '<title>' + esc(title) + '</title>')
          .replace(/<link rel="canonical" href="[^"]*" \/>/, () => '<link rel="canonical" href="' + url + '" />')
          .replace(/<link rel="alternate" hreflang="(es-DO|x-default)" href="[^"]*" \/>/g, (_, l) => '<link rel="alternate" hreflang="' + l + '" href="' + url + '" />')
          .replace(/<script type="application\/ld\+json" id="ld-(app|faq)">.*?<\/script>\s*/g, '');
        h = setMeta(h, 'name', 'description', description);
        h = setMeta(h, 'property', 'og:type', type);
        h = setMeta(h, 'property', 'og:title', title);
        h = setMeta(h, 'property', 'og:description', description);
        h = setMeta(h, 'property', 'og:url', url);
        h = setMeta(h, 'name', 'twitter:title', title);
        h = setMeta(h, 'name', 'twitter:description', description);
        h = h.replace('</head>', () => extra + '    ' + ld(jsonld) + '\n  </head>');
        return h.replace(/<noscript>[\s\S]*?<\/noscript>/, () => wrap(body));
      };
      const write = (rel, html) => { mkdirSync(out(rel), { recursive: true }); writeFileSync(out(rel + '/index.html'), html); };

      const idxDesc = 'Guías, normativa y consejos prácticos para directores y dueños de colegios en República Dominicana: cobros, administración, tecnología y relación con las familias.';
      write('blog', page({
        title: 'Recursos para directores de colegios en RD | STODIA', description: idxDesc, path: '/blog', type: 'website',
        jsonld: inl.indexLd(articles, ctx, 'Recursos para directores de colegios en RD', idxDesc),
        body: '<h1>Recursos para directores de colegios en RD</h1><p>' + esc(idxDesc) + '</p><ul>'
          + articles.map(a => '<li><a href="/blog/' + a.slug + '">' + esc(a.title) + '</a> (' + esc(a.category) + '): ' + esc(a.description) + '</li>').join('') + '</ul>',
      }));

      for (const a of articles) {
        const t = a.title + ' | STODIA';
        const title = t.length <= 60 ? t : a.title;
        const sources = (a.sources ?? []).filter(s => /^https?:\/\//.test(s.url));
        const body = '<article>\n        <h1>' + esc(a.title) + '</h1>\n        <p><time datetime="' + a.date + '">' + a.date + '</time>'
          + (a.updated ? ' · actualizado <time datetime="' + a.updated + '">' + a.updated + '</time>' : '')
          + ' · ' + a.readMinutes + ' min de lectura · ' + esc(a.category) + '</p>\n        <p><strong>' + rich(a.summary) + '</strong></p>\n        '
          + a.sections.map(s => '<section><h2 id="' + esc(s.id ?? inl.slugify(s.h2)) + '">' + esc(s.h2) + '</h2>' + s.blocks.map(block).join('') + '</section>').join('\n        ')
          + (a.faq?.length ? '\n        <section><h2>Preguntas frecuentes</h2>' + a.faq.map(f => '<h3>' + esc(f.q) + '</h3><p>' + rich(f.a) + '</p>').join('') + '</section>' : '')
          + (sources.length ? '\n        <section><h2>Fuentes consultadas</h2><ul>' + sources.map(s => '<li><a href="' + esc(s.url) + '" rel="noopener noreferrer">' + esc(s.name) + '</a></li>').join('') + '</ul></section>' : '')
          + '\n      </article>';
        const extra = '    <meta property="article:published_time" content="' + a.date + '" />\n    <meta property="article:modified_time" content="' + (a.updated || a.date) + '" />\n    <meta property="article:publisher" content="' + ctx.brandUrl + '" />\n';
        write('blog/' + a.slug, page({ title, description: a.description, path: '/blog/' + a.slug, type: 'article', extra, jsonld: inl.articleLd(a, ctx), body }));
      }
      console.log('[stodia-blog] ' + articles.length + ' articulos: sitemap, rss.xml y HTML estatico generados');
    },
  };
}
