// Plugin de Vite para SEO: dominio por variable, JSON-LD del FAQ (fuente única: faq.json),
// <noscript> con texto real y preload de fuentes críticas (hash de build).
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function seoHtml(siteUrl) {
  const site = (siteUrl || 'https://stodia.vercel.app').replace(/\/+$/, '');
  // El correo de contacto se lee de src/lib/site.ts (fuente única).
  const site_ts = readFileSync(resolve('src/lib/site.ts'), 'utf8');
  const pick = k => new RegExp(k + String.raw`:\s*'([^']+)'`).exec(site_ts)?.[1];
  const email = pick('email') ?? 'contact@synsetsolutions.com';
  const brand = pick('legalName') ?? 'STODIA';
  const brandUrl = pick('brandUrl') ?? site;
  const faq = JSON.parse(readFileSync(resolve('src/pages/faq.json'), 'utf8').replaceAll('{{email}}', email));
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const faqHtml = faq.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('');
  let isBuild = false;
  let outDir = 'dist';
  return {
    name: 'stodia-seo-html',
    configResolved(c) { isBuild = c.command === 'build'; outDir = c.build.outDir; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html
          .replaceAll('__SITE_URL__', site)
          .replaceAll('__SITE_EMAIL__', email)
          .replaceAll('__BRAND__', brand)
          .replaceAll('__BRAND_URL__', brandUrl)
          .replace('<!--FAQ_LD-->', `<script type="application/ld+json" id="ld-faq">${JSON.stringify(faqLd)}</script>`)
          .replace('<!--FAQ_NOSCRIPT-->', faqHtml);
        if (isBuild && ctx.bundle) {
          const pick = re => Object.keys(ctx.bundle).find(k => re.test(k));
          const files = [pick(/caveat-latin-700-normal.*\.woff2$/), pick(/inter-latin-400-normal.*\.woff2$/)].filter(Boolean);
          const tags = files.map(f => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ');
          out = out.replace('<!--FONT_PRELOAD-->', tags);
        } else out = out.replace('<!--FONT_PRELOAD-->', '');
        return out;
      },
    },
    closeBundle() {
      if (!isBuild || site === 'https://stodia.vercel.app') return;
      for (const f of ['robots.txt', 'sitemap.xml']) {
        const p = resolve(outDir, f);
        if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('https://stodia.vercel.app', site));
      }
    },
  };
}
