import { useRef } from 'react';
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
import './landing.css';

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const scrolled = useLandingMotion(root, progress);
  return <div ref={root} className={`landing ${canAnimate() ? 'motion' : ''}`}>
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <div ref={progress} className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left scale-x-0 bg-gradient-to-r from-accent via-sky-400 to-yellow-400" aria-hidden="true" />
    <Header scrolled={scrolled} />
    <main id="contenido" tabIndex={-1} className="outline-none"><Hero /><Modules /><Features /><Community /><Resources /><Faq /><FinalCta /></main>
    <Footer />
  </div>;
}
