export const narrativeStyles = `
.pill-journey { --ink:#183d39; --muted:#536b65; --accent:#256f60; --journey:0; position:relative; height:580svh; width:100%; color:var(--ink); background:#edf0e8; font-family:'Manrope','Avenir Next',sans-serif; }
.pill-journey *, .pill-journey *::before, .pill-journey *::after { box-sizing:border-box; }
.pill-stage { position:sticky; top:68px; height:calc(100svh - 68px); min-height:610px; width:100%; overflow:visible; isolation:isolate; }
.pill-stage::before { content:''; position:absolute; inset:calc(-1 * var(--pill-header-height,68px)) 0 0; z-index:-2; background:radial-gradient(ellipse at 71% 52%,#fffef7 0%,#edf0e8 44%,#dfe8df 100%); pointer-events:none; }
.pill-stage::after { content:''; position:absolute; inset:calc(-1 * var(--pill-header-height,68px)) 0 0; z-index:-1; opacity:.16; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%238da18e' filter='url(%23n)' opacity='.26' d='M0 0h160v160H0z'/%3E%3C/svg%3E"); pointer-events:none; }
.pill-stage-content { position:absolute; inset:0; overflow:hidden; isolation:isolate; }
header[data-pill-backdrop='true'] { background-color:transparent; border-bottom-color:transparent; box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; color:#183d39; }
header[data-pill-backdrop='true'][data-scrolled='true'] { backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }
header[data-pill-backdrop='true'] .MuiTypography-root,header[data-pill-backdrop='true'] button { color:#183d39; }
header[data-pill-backdrop='true'] .MuiTypography-caption { color:#536b65; }
.pill-journey button { font:inherit; cursor:pointer; }
.pill-journey a { color:inherit; }
.pill-journey button:focus-visible,.pill-journey a:focus-visible { outline:3px solid #b26432; outline-offset:5px; }
.pill-header-controls { display:flex; align-items:center; gap:16px; white-space:nowrap; }
.pill-header-controls button { min-height:40px; padding:8px 0; color:inherit; background:none; border:0; font:12px 'Manrope','Avenir Next',sans-serif; cursor:pointer; }
.pill-header-controls button span { font-size:20px; margin-left:10px; vertical-align:middle; }
.pill-header-controls button:focus-visible { outline:3px solid #b26432; outline-offset:4px; }
.pill-word { position:absolute; left:2.3%; top:65px; width:95.4%; font-size:clamp(70px,12.5vw,235px); line-height:.85; font-weight:800; letter-spacing:-.075em; text-align:center; white-space:nowrap; color:#245747; opacity:.12; z-index:0; animation:pill-word-in .65s ease both; user-select:none; }
.pill-stage[data-chapter='0'] .pill-word { opacity:.92; font-size:12.5vw; }
.pill-stage[data-chapter='4'] .pill-word { font-size:16.2vw; }
.pill-orbit { position:absolute; width:53vw; height:53vw; max-height:720px; max-width:720px; border:1px solid #55786e22; border-radius:50%; top:24%; left:45%; transform:rotate(-23deg) scaleY(.6); z-index:0; }
.pill-orbit::after { content:''; position:absolute; width:7px; height:7px; top:9%; left:19%; border-radius:50%; background:#64897b; }
.pill-visual { position:absolute; inset:15% -1% 7% 25%; pointer-events:none; z-index:2; }
.pill-visual canvas { width:100%; height:100%; display:block; opacity:0; transition:opacity .65s ease; }
.pill-visual canvas.is-ready { opacity:1; }
.pill-specimen { position:absolute; bottom:10%; right:12%; display:grid; gap:5px; font:9px 'SFMono-Regular',Consolas,monospace; letter-spacing:.13em; color:#426354; }
.pill-specimen::before { content:'+'; font-size:25px; position:absolute; left:-28px; top:-7px; font-weight:300; }
.pill-copy-wrap { position:absolute; left:5%; width:35%; top:41%; bottom:14%; z-index:3; }
.pill-copy { position:absolute; inset:0; opacity:0; visibility:hidden; transform:translateY(24px); transition:opacity .38s ease,transform .65s cubic-bezier(.2,.7,.1,1),visibility .38s; }
.pill-copy.is-active { opacity:1; visibility:visible; transform:none; }
.pill-eyebrow { display:flex; gap:10px; align-items:center; text-transform:uppercase; font:10px 'SFMono-Regular',Consolas,monospace; letter-spacing:.13em; margin-bottom:22px; }
.pill-dot { width:6px; height:6px; background:var(--accent); border-radius:50%; }
.pill-copy h2 { font-family:'Manrope','Avenir Next',sans-serif; font-size:clamp(33px,4.1vw,76px); line-height:1.02; font-weight:600; letter-spacing:-.065em; white-space:pre-line; margin:0 0 20px; }
.pill-copy p { max-width:310px; font-size:clamp(13px,1.05vw,16px); line-height:1.65; color:var(--muted); margin:0 0 24px; }
.pill-action { background:var(--ink); color:#f4f5ed; display:flex; justify-content:space-between; gap:32px; align-items:center; border:1px solid var(--ink); padding:14px 20px; border-radius:3px; min-width:230px; font-size:13px!important; transition:background .2s; }
.pill-action:hover { background:#2c6253; }
.pill-action span { font-size:23px; line-height:1; }
.pill-text-link { font-size:12px; text-underline-offset:6px; }
.pill-structure { display:flex; align-items:center; gap:10px; width:max-content; max-width:100%; padding:8px 12px 8px 0; border-top:1px solid #254b3e33; }
.pill-structure>span { font:9px/1.7 'SFMono-Regular',Consolas,monospace; color:var(--muted); }
.pill-structure svg { mix-blend-mode:multiply; }
.pill-property-labels { display:flex; flex-wrap:wrap; gap:15px; border-top:1px solid #254b3e33; padding-top:16px; font:10px 'SFMono-Regular',Consolas,monospace; width:max-content; max-width:100%; }
.pill-bottomline { position:absolute; bottom:27px; left:3.5%; right:3.5%; display:flex; align-items:center; justify-content:space-between; gap:20px; z-index:5; }
.pill-scroll-cue { display:flex; align-items:center; gap:14px; font:10px 'SFMono-Regular',Consolas,monospace; letter-spacing:.1em; }
.pill-scroll-cue>span:first-child { font-size:32px; font-family:serif; line-height:1; }
.pill-scroll-cue small { display:block; margin-top:6px; font:11px 'Manrope','Avenir Next',sans-serif; letter-spacing:0; color:var(--muted); }
.pill-chapters { display:flex; gap:12px; }
.pill-chapters button { width:45px; padding:12px 0; background:none; border:0; color:#6e7d73; font:10px 'SFMono-Regular',Consolas,monospace; }
.pill-chapters button i { display:block; width:100%; height:2px; background:#a8b7ab; margin-top:8px; }
.pill-chapters button[aria-current='step'] { color:var(--ink); }
.pill-chapters button[aria-current='step'] i { background:var(--ink); height:3px; }
.pill-research { text-align:right; font:10px/1.6 'SFMono-Regular',Consolas,monospace; letter-spacing:.1em; }
.pill-progress { position:absolute; bottom:0; width:100%; height:3px; background:#54856f; transform:scaleX(var(--journey)); transform-origin:left; z-index:6; }
.pill-endnote { position:absolute; bottom:0; left:0; right:0; padding:9px 4%; background:#183d39; color:#e4eae1; font-size:11px; text-align:center; z-index:8; }
.pill-endnote a { margin-left:10px; text-underline-offset:3px; }
.pill-fallback { position:absolute; left:30%; top:28%; display:flex; width:43%; height:28%; transform:rotate(-35deg); filter:drop-shadow(0 30px 25px #1b4f3428); }
.pill-fallback i { width:50%; border-radius:100px 0 0 100px; background:linear-gradient(#fffef2,#dadccf); }
.pill-fallback i+i { border-radius:0 100px 100px 0; background:linear-gradient(#79a898,#225947); }
.pill-fallback-note { position:absolute; bottom:20%; left:50%; font-size:11px; }
html.lenis,html.lenis body { height:auto; }
.lenis.lenis-smooth { scroll-behavior:auto!important; }
.lenis.lenis-stopped { overflow:hidden; }
@keyframes pill-word-in { from { transform:translateY(16px); } to { transform:translateY(0); } }
@media (min-width:761px) and (max-height:760px) { .pill-stage { min-height:500px; } .pill-copy-wrap { top:35%; } .pill-copy h2 { font-size:3.6vw; margin-bottom:12px; } .pill-copy p { margin-bottom:14px; } .pill-eyebrow { margin-bottom:14px; } .pill-word { top:58px; } }
@media (max-width:760px) {
 .pill-journey { height:500svh; } .pill-stage { top:60px; height:calc(100svh - 60px); min-height:650px; }
 .pill-topline { top:14px; left:6%; right:6%; font-size:8px; } .pill-topline button { font-size:11px; }
 .pill-word,.pill-stage[data-chapter='0'] .pill-word { top:70px; font-size:12.5vw; }
 .pill-stage[data-chapter='4'] .pill-word { font-size:16vw; }
 .pill-visual { inset:10% -10% 40% -10%; } .pill-orbit { width:95vw; height:95vw; top:11%; left:2%; }
 .pill-specimen { bottom:8%; right:19%; font-size:7px; } .pill-specimen::before { font-size:20px; }
 .pill-copy-wrap { left:7%; width:86%; top:54%; bottom:10%; } .pill-copy h2 { font-size:36px; letter-spacing:-.05em; margin-bottom:12px; }
 .pill-eyebrow { font-size:8px; margin-bottom:12px; } .pill-copy p { font-size:12px; max-width:340px; margin-bottom:14px; line-height:1.5; }
 .pill-action { padding:11px 15px; min-width:210px; font-size:12px!important; width:max-content; }
 .pill-bottomline { bottom:18px; left:7%; right:7%; gap:10px; } .pill-scroll-cue { font-size:8px; gap:8px; } .pill-scroll-cue small,.pill-research { display:none; }
 .pill-chapters { gap:7px; } .pill-chapters button { width:25px; font-size:8px; } .pill-endnote { font-size:10px; } .pill-endnote a { display:block; }
 .pill-structure { padding:0; border:0; transform:scale(.85); transform-origin:top left; } .pill-text-link { font-size:11px; }
}
.pill-journey[data-motion='reduced'] { height:440svh; }
.pill-journey[data-motion='reduced'] .pill-word,.pill-journey[data-motion='reduced'] .pill-copy { animation:none; transition:none; transform:none; }
.pill-journey[data-motion='reduced'] canvas { transition:none; }
.pill-stage { top:var(--pill-header-height,68px); height:calc(100svh - var(--pill-header-height,68px)); }
@media (max-width:760px) and (max-height:740px) { .pill-stage { min-height:0; } .pill-copy-wrap { top:50%; } .pill-copy h2 { font-size:29px; margin-bottom:8px; } .pill-copy p { font-size:11px; margin-bottom:10px; } .pill-eyebrow { margin-bottom:8px; } .pill-visual { bottom:45%; } .pill-specimen { display:none; } .pill-topline button { font-size:10px; padding-left:10px; } .pill-structure { transform:scale(.7); } }
@media (prefers-reduced-motion:reduce) { .pill-journey { height:440svh; } .pill-word,.pill-copy { animation:none; transition:none; transform:none; } .pill-visual canvas { transition:none; } }
`;
