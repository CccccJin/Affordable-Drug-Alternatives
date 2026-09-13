import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { narrativeStyles } from './narrativeStyles';

const Molecule = lazy(() => import('../molecules/MoleculeViewer').then(m => ({ default: m.MoleculeViewer })));
const chapters = [
  { name: 'The possibility', word: 'POSSIBILITY', title: 'Small form.\nA wider world.', copy: 'A closer look at the chemistry behind medicines. Explore structures. Discover connections. Ask better questions.' },
  { name: 'The structure', word: 'STRUCTURE', title: 'Look beneath\nthe surface.', copy: 'Every molecule has a signature. Start with a structure and see what makes it distinct.' },
  { name: 'The discovery', word: 'DISCOVERY', title: 'Follow the\nconnections.', copy: 'Explore related compounds through Morgan fingerprints and Tanimoto similarity. A starting point for research.' },
  { name: 'The comparison', word: 'PERSPECTIVE', title: 'Put the details\nside by side.', copy: 'Inspect structures and molecular properties. Refine your search, compare candidates, and export your findings.' },
  { name: 'Your next step', word: 'YOUR MOVE', title: 'Curiosity,\nmeet chemistry.', copy: 'Your next question starts here. Open the research workspace and explore a compound of your own.' },
];

interface ScrollNarrativeProps { onEnterWorkspace: () => void }
export function ScrollNarrative({ onEnterWorkspace }: ScrollNarrativeProps) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const model = useRef<{ update: (p: number) => void; dispose: () => void } | null>(null);
  const goTo = useRef<((target: number | HTMLElement) => void) | null>(null);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  useEffect(() => { setHeaderSlot(document.getElementById('narrative-header-controls')); }, []);

  useEffect(() => {
    const section = root.current, surface = canvas.current;
    if (!section || !surface) return;
    let disposed = false, raf = 0, last = -1, lastChapter = -1;
    let lenis: import('lenis').default | null = null;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => {
      setReduced(media.matches || motionPaused);
      if (media.matches || motionPaused) { lenis?.destroy(); lenis = null; }
      else if (!lenis) void import('lenis').then(({ default: Lenis }) => {
        if (disposed || media.matches || motionPaused || lenis) return;
        lenis = new Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: false,
          prevent: node => !!node.closest('#search-workspace, [role="dialog"]') });
      });
      last = -1;
    };
    motion(); media.addEventListener('change', motion);
    void import('./capsuleScene').then(({ createCapsuleScene }) => {
      if (disposed) return;
      model.current = createCapsuleScene(surface); setReady(true); last = -1;
    }).catch(() => { if (!disposed) setFailed(true); });
    goTo.current = target => {
      if (lenis && !media.matches && !motionPaused) lenis.scrollTo(target, { duration: 1.05 });
      else if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'auto' });
      else target.scrollIntoView({ behavior: 'auto', block: 'start' });
    };
    const frame = (time: number) => {
      if (disposed) return;
      lenis?.raf(time);
      const bounds = section.getBoundingClientRect();
      const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 68;
      section.style.setProperty('--pill-header-height', `${headerHeight}px`);
      const height = window.innerHeight - headerHeight;
      const p = Math.max(0, Math.min(1, (headerHeight - bounds.top) / Math.max(1, bounds.height - height)));
      const chapter = Math.min(4, Math.floor(p * 5));
      if (chapter !== lastChapter) { lastChapter = chapter; setActive(chapter); }
      if (p !== last) {
        section.style.setProperty('--journey', String(p)); section.dataset.progress = p.toFixed(4);
        model.current?.update(media.matches || motionPaused ? 0 : p); last = p;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true; cancelAnimationFrame(raf); media.removeEventListener('change', motion);
      lenis?.destroy(); model.current?.dispose(); model.current = null; goTo.current = null;
    };
  }, [motionPaused]);
  const enter = () => {
    const workspace = document.getElementById('search-workspace');
    if (workspace && goTo.current) goTo.current(workspace); else onEnterWorkspace();
  };
  const selectChapter = (index: number) => {
    const section = root.current; if (!section) return;
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 68;
    const start = section.getBoundingClientRect().top + window.scrollY - header;
    const distance = section.offsetHeight - window.innerHeight + header;
    goTo.current?.(Math.max(0, start + distance * (index === 0 ? 0 : (index + 0.15) / 5)));
  };
  return (
    <section ref={root} className="pill-journey" data-motion={reduced ? 'reduced' : 'full'} aria-label="A closer look at molecular discovery">
      <style>{narrativeStyles}</style>
      <div className="pill-stage" data-chapter={active}>
        {headerSlot && createPortal(<div className="pill-header-controls"><button type="button" aria-label="Reduce animation" aria-pressed={reduced} onClick={() => setMotionPaused(value => !value)}>Motion {reduced ? 'off' : 'on'}</button><button type="button" onClick={enter}>Skip intro <span aria-hidden="true">↗</span></button></div>, headerSlot)}
        <div className="pill-word" aria-hidden="true" key={active}>{chapters[active].word}</div>
        <div className="pill-orbit" aria-hidden="true" />
        <div className="pill-visual" aria-label="Three-dimensional pearl and teal capsule" role="img">
          <canvas ref={canvas} className={ready ? 'is-ready' : ''} aria-hidden="true" />
          {!ready && <div className="pill-fallback" aria-hidden="true"><i /><i /></div>}
          {failed && <span className="pill-fallback-note">Static preview</span>}
          <div className="pill-specimen" aria-hidden="true"><span>FORM / 001</span><span>CONCEPT CAPSULE</span></div>
        </div>
        <div className="pill-copy-wrap">
          {chapters.map((chapter, index) => (
            <article key={chapter.name} className={`pill-copy ${active === index ? 'is-active' : ''}`} aria-hidden={active !== index} inert={active !== index}>
              <div className="pill-eyebrow"><span className="pill-dot" /> {String(index + 1).padStart(2, '0')} / {chapter.name}</div>
              <h2>{chapter.title}</h2><p>{chapter.copy}</p>
              {(index === 0 || index === 4) && <button className="pill-action" type="button" onClick={enter}>Explore Compounds <span aria-hidden="true">↗</span></button>}
              {index === 1 && active === 1 && <div className="pill-structure"><Suspense fallback={<span>Drawing structure...</span>}><Molecule smiles="CC(=O)OC1=CC=CC=C1C(=O)O" width={180} height={95} label="Aspirin" /></Suspense><span>ASPIRIN<br />RDKit structure from SMILES</span></div>}
              {index === 2 && <Link className="pill-text-link" to="/results?query=Aspirin&type=name" tabIndex={active === index ? 0 : -1}>Explore the aspirin neighborhood <span aria-hidden="true">↗</span></Link>}
              {index === 3 && <div className="pill-property-labels"><span>STRUCTURE</span><span>MW</span><span>logP</span><span>SIMILARITY</span></div>}
            </article>
          ))}
        </div>
        <div className="pill-bottomline">
          <div className="pill-scroll-cue"><span aria-hidden="true">↓</span><span>{reduced ? 'SCROLL TO EXPLORE' : 'SCROLL TO TURN'}<small>{reduced ? 'Reduced motion enabled' : 'A new perspective with every scroll'}</small></span></div>
          <nav className="pill-chapters" aria-label="Introduction chapters">{chapters.map((chapter, index) => <button type="button" key={chapter.name} aria-label={`Chapter ${index + 1}: ${chapter.name}`} aria-current={active === index ? 'step' : undefined} onClick={() => selectChapter(index)}><span>{String(index + 1).padStart(2, '0')}</span><i /></button>)}</nav>
          <span className="pill-research">FOR RESEARCH.<br />FOR THE CURIOUS.</span>
        </div>
        <div className="pill-progress" aria-hidden="true" />
      </div>
      <div className="pill-endnote">Structural similarity does not establish clinical interchangeability. <Link to="/alternatives">Explore FDA-rated equivalence ↗</Link></div>
    </section>
  );
}
