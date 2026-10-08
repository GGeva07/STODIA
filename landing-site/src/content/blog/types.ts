/** Bloque de contenido de un artículo (renderizado por la página de artículo del blog). */
export type Block =
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'table'; caption?: string; head: string[]; rows: string[][] }
  | { t: 'callout'; title: string; text: string }
  | { t: 'h3'; text: string };

export interface Section {
  /** h2 visible; el id para ancla se deriva con slugify si no se define. */
  h2: string;
  id?: string;
  blocks: Block[];
}

export interface Article {
  /** URL: /blog/<slug> (minúsculas, guiones, sin tildes). */
  slug: string;
  /** <title> y h1 (≤ 60 caracteres ideal). */
  title: string;
  /** meta description 140-160 caracteres. */
  description: string;
  /** ISO yyyy-mm-dd */
  date: string;
  updated?: string;
  category: 'Administración' | 'Finanzas' | 'Normativa' | 'Tecnología' | 'Padres y comunidad' | 'Guías';
  readMinutes: number;
  /** Palabra clave principal + secundarias. */
  keywords: string[];
  /** Resumen de 2-3 frases al inicio (útil para featured snippet / respuesta directa). */
  summary: string;
  sections: Section[];
  faq?: { q: string; a: string }[];
  /** slugs de artículos relacionados */
  related?: string[];
  /** Fuentes oficiales consultadas (nombre + URL) para E-E-A-T. */
  sources?: { name: string; url: string }[];
}
