import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Seo, { DEFAULT_DESC, DEFAULT_TITLE } from '../components/Seo';
import Community from '../components/landing/Community';
import Faq from '../components/landing/Faq';
import Features from '../components/landing/Features';
import FinalCta from '../components/landing/FinalCta';
import Footer from '../components/landing/Footer';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import Resources from '../components/landing/Resources';
import Modules from '../components/landing/Modules';
import { canAnimate, useLandingMotion } from '../components/landing/motion';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import './landing/landing.css';

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const scrolled = useLandingMotion(root, progress);
  const { hash } = useLocation();

  // Enlaces entrantes tipo /#demo (desde el blog o el pie): la landing es lazy, así que se desplaza al ancla al montar.
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  return (
    <div ref={root} className={`landing ${canAnimate() ? 'motion' : ''}`}>
      <Seo title={DEFAULT_TITLE} description={DEFAULT_DESC} path="/" landing />
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <div ref={progress} className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left scale-x-0 bg-gradient-to-r from-accent via-sky-400 to-yellow-400" aria-hidden="true" />
      <Header scrolled={scrolled} />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <Hero />
        <Modules />
        <Features />
        <Community />
        <Resources />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
