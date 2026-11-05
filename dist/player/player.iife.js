(function(){"use strict";function N(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function k(e){return typeof e=="string"}function A(e){return typeof e=="number"}function S(e){return Array.isArray(e)}function F(e){if(!N(e))return null;const t=e.type;return t==="goto"&&k(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&A(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&k(e.variable)&&(k(e.value)||A(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function _(e){if(!N(e))return null;const{type:t,id:n,x:r,y:d,w:i,h:f}=e;if(!k(n)||!A(r)||!A(d)||!A(i)||!A(f))return null;if(t==="text"&&k(e.content))return{type:"text",id:n,x:r,y:d,w:i,h:f,content:e.content};if(t==="button"&&k(e.label)&&S(e.actions)){const c=[];for(const p of e.actions){const u=F(p);if(u===null)return null;c.push(u)}return{type:"button",id:n,x:r,y:d,w:i,h:f,label:e.label,actions:c}}return t==="image"&&k(e.src)&&k(e.alt)?{type:"image",id:n,x:r,y:d,w:i,h:f,src:e.src,alt:e.alt}:t==="field"&&k(e.variable)?{type:"field",id:n,x:r,y:d,w:i,h:f,variable:e.variable}:null}function G(e){if(!N(e))return null;const{id:t,kind:n,elements:r,actions:d}=e;if(!k(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!S(r)||!S(d))return null;const i=[];for(const c of r){const p=_(c);if(p===null)return null;i.push(p)}const f=[];for(const c of d){const p=F(c);if(p===null)return null;f.push(p)}return{id:t,kind:n,elements:i,actions:f}}function P(e){if(!N(e))return null;const{id:t,title:n,theme:r,cards:d}=e;if(!k(t)||!k(n)||!N(r))return null;const{background:i,foreground:f,font:c}=r;if(!k(i)||!k(f)||!k(c)||!S(d))return null;const p=[];for(const u of d){const y=G(u);if(y===null)return null;p.push(y)}return{id:t,title:n,theme:{background:i,foreground:f,font:c},cards:p}}const D=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function z(e){return D.test(e)}function B(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function R(e){return e.elements.filter(t=>t.type==="button")}function q(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function j(e){var b;const t=[],n=new Set,r=l=>n.has(l)?!1:(n.add(l),!0);r(e.id)||t.push("duplicate-id");for(const l of e.cards){!r(l.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const o of l.elements)!r(o.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const d=new Set(e.cards.map(l=>l.id));let i=!1;for(const l of e.cards){for(const o of B(l.actions))if(!d.has(o)){i=!0;break}if(i)break;for(const o of R(l)){for(const a of B(o.actions))if(!d.has(a)){i=!0;break}if(i)break}if(i)break}i&&t.push("invalid-goto"),e.cards.filter(l=>l.kind==="end").length!==1&&t.push("end-card-count");for(const l of e.cards){if(l.kind!=="quiz")continue;const o=R(l),a=o.filter(q).length,h=o.filter(g=>!q(g)).length;if(a!==1||h<1){t.push("quiz-answer");break}}let c=!1;for(const l of e.cards){for(const o of l.elements)if(o.x+o.w>800||o.y+o.h>600){c=!0;break}if(c)break}c&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(l=>l.kind!=="end").length<1&&t.push("no-content-cards");let u=!1;if(z(e.id)||(u=!0),!u)for(const l of e.cards){if(!z(l.id)){u=!0;break}for(const o of l.elements)if(!z(o.id)){u=!0;break}if(u)break}u&&t.push("invalid-id");const y=new Map;for(const l of e.cards){const o=[];for(const a of l.actions)a.type==="goto"&&d.has(a.cardId)&&o.push(a.cardId);y.set(l.id,o)}const s=new Map;for(const l of e.cards)s.set(l.id,0);let m=!1;for(const l of e.cards){if(s.get(l.id)!==0||m)continue;const o=[];for(s.set(l.id,1),o.push({id:l.id,nextIdx:0});o.length>0&&!m;){const a=o[o.length-1],h=(b=y.get(a.id))!=null?b:[];if(a.nextIdx<h.length){const g=h[a.nextIdx];a.nextIdx++;const x=s.get(g);x===1?m=!0:x===0&&(s.set(g,1),o.push({id:g,nextIdx:0}))}else s.set(a.id,2),o.pop()}}return m&&t.push("goto-cycle"),t}function V(e){const t=P(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=j(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function W(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function T(e,t,n,r=X){for(const d of e)switch(d.type){case"goto":{n(d.cardId);return}case"score":{const i=t.variables.score;t.variables.score=(typeof i=="number"?i:0)+d.delta;break}case"set":{t.variables[d.variable]=d.value;break}case"sound":{r(d.sound);break}}}function X(e){}const L='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',v={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},U=[{color:v.tileA,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:v.tileB,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:v.tileC,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:v.tileD,textColor:v.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],Q=900,J=600,K=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${v.paper};
  --color-ink:     ${v.ink};
  --color-rule:    ${v.rule};
  --color-stamp:   ${v.stamp};
  --color-tile-a:  ${v.tileA};
  --color-tile-b:  ${v.tileB};
  --color-tile-c:  ${v.tileC};
  --color-tile-d:  ${v.tileD};
  --color-white:   ${v.white};
  --radius-card:   10px;
  --radius-tile:   12px;
  --rule-gap:      32px;
  --ring-offset:   4px;
  --text-question: 44px;
  --text-tile:     32px;
  --text-body:     22px;
  --text-meta:     20px;
}

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Card stack wrapper ---- */
.sy-card-stack {
  position: relative;
  width: 800px;
  height: 600px;
}

/* Three offset card-edge layers behind the active card */
.sy-card-edge {
  position: absolute;
  top: 0; left: 0;
  width: 800px; height: 600px;
  border-radius: var(--radius-card);
  background: var(--color-paper);
  border: 1.5px solid var(--color-rule);
  pointer-events: none;
}
.sy-card-edge-1 { transform: translate(4px, 4px);   z-index: 1; }
.sy-card-edge-2 { transform: translate(8px, 8px);   z-index: 0; }
.sy-card-edge-3 { transform: translate(12px, 12px); z-index: -1; }

/* ---- Active card ---- */
.sy-card {
  position: absolute;
  top: 0; left: 0;
  width: 800px; height: 600px;
  border-radius: var(--radius-card);
  background-color: var(--color-paper);
  border: 1.5px solid var(--color-rule);
  overflow: hidden;
  z-index: 2;
}

/* Ruled lines — drawn once, starting 40px from top (below ring holes).
   background-size ensures only one gradient layer. */
.sy-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 31px,
    var(--color-rule) 31px,
    var(--color-rule) 32px
  );
  background-position: 0 40px;
  background-size: 100% calc(100% - 40px);
}

/* ---- Ring holes (the punched hole beneath each standing ring loop). Aligned
   to the same x and gap as .sy-rings so a hole sits under each loop. ---- */
.sy-ring-holes {
  position: absolute;
  top: 14px; left: 0;
  width: 800px;
  display: flex;
  justify-content: center;
  gap: 240px;
  pointer-events: none;
  z-index: 10;
}
.sy-ring-hole {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-white);
  border: 1px solid var(--color-rule);
}

/* ---- Standing binder rings (design-system "Rings sit outside the card's clip").
   A sibling of .sy-card, standing ~22px above the card's top edge. The card is
   overflow:hidden so the loops are drawn here, not inside the card. ---- */
.sy-rings {
  position: absolute;
  top: -22px;
  left: 0;
  width: 800px;
  height: 52px;
  display: flex;
  justify-content: center;
  gap: 240px;
  pointer-events: none;
  z-index: 12;
}
.sy-ring svg { display: block; }

/* ---- Derived meta line ("Card N of M"), drawn by the renderer, not stored
   in the stack. Small 20px line in the top-left, above the question. ---- */
.sy-meta-chrome {
  position: absolute;
  left: 48px;
  top: 48px;
  width: 400px;
  height: 32px;
  z-index: 1;
}
.sy-meta-chrome .sy-meta {
  font-size: var(--text-meta);     /* 20px — stays ≥ 18px at min scale */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Derived running-score pill, top-right of the card, read from runtime
   state. Matches the mockup's "Score N" (navy on paper). Derived chrome, never
   stored in the stack. ---- */
.sy-score-chrome {
  position: absolute;
  top: 44px;
  right: 40px;
  z-index: 11;
  display: inline-flex;
  align-items: center;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  font-size: 24px;
  color: var(--color-ink);
}

/* ---- Element positioning ---- */
.sy-element {
  position: absolute;
  z-index: 1;
}

/* ---- Text element — body (story / flash / generic) ---- */
.sy-text {
  font-size: var(--text-body);       /* 22px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Question text — quiz / flash heading ---- */
.sy-question {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}

/* ---- Flash card (play) — front shows the term only; a tap flips to the back
   (the explanation in body type), a tap flips back. Matches
   docs/design/maker/play-flash-back.html. ---- */
.sy-flash {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
}
.sy-flash:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: -3px;
  border-radius: var(--radius-card);
}
/* Front: the term, large and centred. */
.sy-flash-term {
  position: absolute;
  left: 48px;
  top: 232px;
  width: 704px;
  text-align: center;
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
/* Back: the term, small, at the top. */
.sy-flash-term-small {
  position: absolute;
  left: 48px;
  top: 104px;
  width: 704px;
  font-size: 32px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
/* Back: the explanation, in body type (NOT heading type). */
.sy-flash-back {
  position: absolute;
  left: 48px;
  top: 200px;
  width: 704px;
  height: 280px;
  font-size: 26px;
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 40px;
  color: var(--color-ink);
}
/* The "tap to flip" hint, bottom-left on both sides. */
.sy-flash-hint {
  position: absolute;
  left: 48px;
  top: 520px;
  width: 704px;
  font-size: var(--text-meta);       /* 20px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  color: #4a5878;
}
/* "Next Card" shown on the BACK only, bottom-right, clear of the text. */
.sy-flash-next {
  position: absolute;
  left: 408px;
  top: 496px;
  width: 344px;
  height: 56px;
}

/* ---- Meta text (Card N of M) ---- */
.sy-meta {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Field span ---- */
.sy-field {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  color: var(--color-ink);
}

/* ---- Image ---- */
.sy-image {
  display: block;
  object-fit: contain;
}

/* ---- Answer tile (button) ---- */
.sy-tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: var(--radius-tile);
  padding: 0 20px;
  min-height: 56px;
  font-size: var(--text-tile);       /* 32px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
  width: 100%;
  height: 100%;
  text-align: left;
  outline: none;
}
.sy-tile:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}
.sy-tile .sy-tile-shape {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Long labels shrink to fit the tile rather than clipping mid-word. */
.sy-tile .sy-tile-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Generic button (story branch / nav) — chunky paper tab with a pressed
   bottom edge and bold label, per design-system "story buttons as paper tabs". */
.sy-button {
  border: 2px solid var(--color-ink);
  border-bottom-width: 3px;
  border-radius: 10px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: var(--text-tile);       /* 32px — reads as a chunky tab */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
  padding: 8px 16px;
  width: 100%;
  height: 100%;
  outline: none;
}
.sy-button:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}

/* ---- Stamp overlay (on tile) ---- */
/* The earned ink stamp straddles the tile's TOP edge on the label side, mostly
   over the paper above the tile (top:-24px; left:64px), rotated -8deg. It is a
   transparent ink stamp (mix-blend-mode: multiply) — not a paper sticker — so
   the stamp red sits on the 4.67:1 paper pairing and never over the answer word
   (design-system Rubber stamp feedback). */
.sy-stamp {
  position: absolute;
  top: -24px;
  left: 64px;
  right: auto;
  bottom: auto;
  transform: rotate(-8deg) scale(1);
  color: var(--color-stamp);
  font-size: 30px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 4px 10px;
  opacity: 0.92;
  pointer-events: none;
  white-space: nowrap;
  z-index: 20;
}

/* ---- Wrong-answer ✗ stamp ---- */
/* After the shake, a boxed ✗ lands at FULL strength (not a faint mark) over the
   paper at the tile's top edge — same placement as CORRECT, so it reads on the
   4.67:1 paper pairing on a washed-out projector (design-system). */
.sy-wrong-stamp {
  position: absolute;
  top: -24px;
  left: 64px;
  transform: rotate(-8deg);
  color: var(--color-stamp);
  font-size: 44px;
  line-height: 1;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 2px 12px;
  opacity: 1;
  pointer-events: none;
  z-index: 20;
}

/* ---- End card ---- */
.sy-end-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 60px;
  gap: 24px;
  text-align: center;
  position: relative;
  z-index: 1;
}
.sy-end-heading {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
.sy-end-score {
  font-size: 56px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.2;
  color: var(--color-ink);
}
/* End-card stamp collection: one 64px slot per question. Earned slots carry a
   red ✓ stamp (rotated a little, uneven); the rest are empty dashed ink
   outlines. Score = stamps (design-system "the end card is a stamp
   collection"). */
.sy-end-stamps {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  max-width: 620px;
}
.sy-end-slot {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  box-sizing: border-box;
}
.sy-end-slot-empty {
  border: 2px dashed var(--color-ink);
  opacity: 0.3;
}
.sy-end-slot-earned {
  color: var(--color-stamp);
  border: 3px solid var(--color-stamp);
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  font-size: 34px;
  line-height: 1;
  opacity: 0.92;
}

/* ---- Animations ---- */
@keyframes stamp-land {
  0%   { transform: rotate(-8deg) scale(1.4); opacity: 0; }
  60%  { transform: rotate(-8deg) scale(0.92); opacity: 1; }
  80%  { transform: rotate(-8deg) scale(1.04); opacity: 1; }
  100% { transform: rotate(-8deg) scale(1.0);  opacity: 1; }
}

@keyframes tile-shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-6px); }
  40%  { transform: translateX(6px); }
  60%  { transform: translateX(-6px); }
  80%  { transform: translateX(6px); }
  100% { transform: translateX(0); }
}

@keyframes card-exit {
  from { transform: rotateX(0deg);   opacity: 1; }
  to   { transform: rotateX(-90deg); opacity: 0; }
}

@keyframes card-enter {
  from { transform: rotateX(90deg);  opacity: 0; }
  to   { transform: rotateX(0deg);   opacity: 1; }
}

.sy-stamp-animate {
  animation: stamp-land 120ms ease-out forwards;
}

.sy-tile-shake {
  animation: tile-shake 180ms ease-in-out 1;
}

/* After a wrong pick, the right answer is revealed with a faint INK outline
   (not stamp red — this is not an earned stamp) so pupils learn which one it
   was before the card advances. */
.sy-tile-reveal {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}

/* Reduced-motion: replace animations with instant opacity cross-fade */
@media (prefers-reduced-motion: reduce) {
  .sy-stamp-animate { animation: none; opacity: 0.92; }
  .sy-tile-shake    { animation: none; }
  .sy-card-exit, .sy-card-enter { animation: none; opacity: 1; transition: opacity 100ms; }
}

/* ---- Aria-live region (visually hidden) ---- */
.sy-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
`;let M=!1;function Y(){if(M)return;const e=document.createElement("style");e.textContent=K,document.head.appendChild(e),M=!0}let I=null;function Z(){if(I)return I;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),I=e,e}function ee(e,t){e.innerHTML=t}function te(e){return e.cards.filter(t=>t.kind==="quiz").length}function ne(e,t,n,r,d,i){var b;const f=typeof n.variables.score=="number"?n.variables.score:0,c=te(n.stack),p=document.createElement("div");p.className="sy-end-card";const u=e.elements.find(l=>l.type==="text"),y=u&&u.type==="text"?u.content:"Well done!",s=document.createElement("h1");s.className="sy-end-heading",s.textContent=y,p.appendChild(s);const m=document.createElement("p");if(m.className="sy-end-score",m.setAttribute("data-testid","end-score"),m.textContent=`Score ${f} of ${c}`,p.appendChild(m),c>0){const l=document.createElement("div");l.className="sy-end-stamps",l.setAttribute("aria-label",`${f} of ${c} stamp${c!==1?"s":""} earned`);const o=[-8,-5,-10,-6,-9,-4,-7];for(let a=0;a<c;a++){const h=document.createElement("span");if(a<f){h.className="sy-end-slot sy-end-slot-earned",h.textContent="✓";const g=(b=o[a%o.length])!=null?b:-8;h.style.transform=`rotate(${g}deg)`}else h.className="sy-end-slot sy-end-slot-empty";h.setAttribute("aria-hidden","true"),l.appendChild(h)}p.appendChild(l)}i.textContent=`${y}. Score ${f} of ${c}.`;for(const l of e.elements){if(l.type!=="button")continue;const o=document.createElement("div");o.style.marginTop="16px";const a=document.createElement("button");a.className="sy-button",a.style.width="auto",a.style.height="auto",a.textContent=l.label,a.addEventListener("click",()=>{T(l.actions,n,h=>r(h,!1),d)}),o.appendChild(a),p.appendChild(o)}t.appendChild(p)}function oe(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function ae(e,t,n,r,d,i){var o,a,h,g;const f=e.elements.filter(x=>x.type==="text"),c=(a=(o=f[0])==null?void 0:o.content)!=null?a:"",p=(g=(h=f[1])==null?void 0:h.content)!=null?g:"",u=e.elements.filter(x=>x.type==="button"),y=p.trim().length>0,s=document.createElement("div");s.className="sy-flash",y&&(s.setAttribute("role","button"),s.setAttribute("tabindex","0"),s.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(s);let m="front";const b=()=>{if(s.innerHTML="",m==="front"){const x=document.createElement("p");if(x.className="sy-flash-term",x.textContent=c,s.appendChild(x),y){const C=document.createElement("p");C.className="sy-flash-hint",C.textContent="Tap the card to see the answer",s.appendChild(C)}i.textContent=c}else{const x=document.createElement("p");x.className="sy-flash-term-small",x.textContent=c,s.appendChild(x);const C=document.createElement("p");C.className="sy-flash-back",C.textContent=p,s.appendChild(C);const w=document.createElement("p");w.className="sy-flash-hint",w.textContent="Tap the card to flip back",s.appendChild(w),i.textContent=p?`${c}: ${p}`:c}if(m==="back")for(const x of u){const C=document.createElement("div");C.className="sy-flash-next";const w=document.createElement("button");w.className="sy-button",w.textContent=x.label,w.addEventListener("click",me=>{me.stopPropagation(),T(x.actions,n,ye=>r(ye,!1),d)}),C.appendChild(w),s.appendChild(C)}},l=()=>{y&&(m=m==="front"?"back":"front",b(),oe()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation="card-enter 240ms ease-out"))};s.addEventListener("click",l),s.addEventListener("keydown",x=>{(x.key==="Enter"||x.key===" "||x.key==="Spacebar")&&(x.preventDefault(),l())}),b()}function ie(e,t,n,r,d=pe,i={}){Y();const f=Z();t.innerHTML="";const c=document.createElement("div");c.className="sy-card-stack";for(let o=1;o<=3;o++){const a=document.createElement("div");a.className=`sy-card-edge sy-card-edge-${o}`,c.appendChild(a)}const p=document.createElement("div");p.className="sy-card";const u=document.createElement("div");u.className="sy-ring-holes",u.setAttribute("aria-hidden","true");for(let o=0;o<2;o++){const a=document.createElement("div");a.className="sy-ring-hole",u.appendChild(a)}p.appendChild(u);const y=document.createElement("div");if(y.className="sy-rings",y.setAttribute("aria-hidden","true"),y.innerHTML=`<span class="sy-ring">${L}</span><span class="sy-ring">${L}</span>`,e.kind==="end"){ne(e,p,n,r,d,f),c.appendChild(p),c.appendChild(y),t.appendChild(c);return}if(typeof i.position=="number"&&typeof i.total=="number"&&i.total>0){const o=document.createElement("div");o.className="sy-meta-chrome";const a=document.createElement("p");a.className="sy-meta",a.textContent=`Card ${i.position} of ${i.total}`,o.appendChild(a),p.appendChild(o)}const s=n.variables.score;if(typeof s=="number"){const o=document.createElement("div");o.className="sy-score-chrome",o.setAttribute("aria-label",`Score ${s}`),o.textContent=`Score ${s}`,p.appendChild(o)}if(e.kind==="flash"){const o=e.elements.filter(g=>g.type==="text"),a=e.elements.filter(g=>g.type==="button");if(o.length>=2||a.length>=1){ae(e,p,n,r,d,f),c.appendChild(p),c.appendChild(y),t.appendChild(c);return}}const m=e.kind==="quiz",b=m?e.elements.filter(o=>o.type==="button"&&o.actions.length>0):[];let l=0;for(const o of e.elements){const a=document.createElement("div");switch(a.className="sy-element",se(a,o),o.type){case"text":{const h=document.createElement("p");h.className=m||e.kind==="flash"?"sy-question":"sy-text",h.textContent=o.content,a.appendChild(h);break}case"button":{const h=m&&o.actions.length>0,g=re(o,h,b.length,h?l:0,n,r,d,f);a.appendChild(g),h&&l++;break}case"image":{const h=document.createElement("img");h.setAttribute("src",o.src),h.setAttribute("alt",o.alt),h.className="sy-image",h.style.width="100%",h.style.height="100%",a.appendChild(h);break}case"field":{const h=document.createElement("span");h.className="sy-field";const g=n.variables[o.variable];h.textContent=g!==void 0?String(g):"",a.appendChild(h);break}}p.appendChild(a)}c.appendChild(p),c.appendChild(y),t.appendChild(c)}function se(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function re(e,t,n,r,d,i,f,c){const p=t?U[r%4]:void 0,u=document.createElement("button");if(p){u.className="sy-tile",u.style.backgroundColor=p.color,u.style.color=p.textColor,e.actions.some(m=>m.type==="score"&&m.delta>0)&&u.setAttribute("data-correct","true");const y=document.createElement("span");y.className="sy-tile-shape",y.style.color=p.textColor,ee(y,p.shapePath),u.appendChild(y);const s=document.createElement("span");s.className="sy-tile-label",s.textContent=e.label,u.appendChild(s)}else u.className="sy-button",u.textContent=e.label;return u.addEventListener("click",()=>{le(u,e,p,d,i,f,c)}),u}function le(e,t,n,r,d,i,f){const c=t.actions.some(s=>s.type==="score"&&s.delta>0),p=e.closest(".sy-card");p&&p.querySelectorAll(".sy-tile, .sy-button").forEach(s=>{s.disabled=!0});const u=t.actions.find(s=>s.type==="goto"),y=t.actions.filter(s=>s.type!=="goto");if(T(y,r,ue,i),n)if(c)ce(e,f),t.actions.some(m=>m.type==="sound")||i("cheer"),setTimeout(()=>{u&&u.type==="goto"&&d(u.cardId,!1)},Q);else{if(de(e),t.actions.some(m=>m.type==="sound")||i("buzz"),p){const m=p.querySelector('.sy-tile[data-correct="true"]');m&&m!==e&&m.classList.add("sy-tile-reveal")}setTimeout(()=>{u&&u.type==="goto"&&d(u.cardId,!1)},J)}else u&&u.type==="goto"&&d(u.cardId,!1)}function ce(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function de(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function pe(e){}function ue(e){}function fe(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const d=window.innerWidth,i=window.innerHeight,f=Math.min(d*.9/800,i*.9/600);e.style.transform=`scale(${f})`}n();const r=new ResizeObserver(n);return r.observe(document.body),function(){r.disconnect()}}function O(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,r=n.createOscillator(),d=n.createGain();r.connect(d),d.connect(n.destination);const i=n.currentTime,f=.5;e==="cheer"?(r.type="triangle",r.frequency.setValueAtTime(440,i),r.frequency.linearRampToValueAtTime(880,i+f),d.gain.setValueAtTime(0,i),d.gain.linearRampToValueAtTime(.3,i+.05),d.gain.linearRampToValueAtTime(0,i+f)):(r.type="sawtooth",r.frequency.setValueAtTime(150,i),d.gain.setValueAtTime(.3,i),d.gain.linearRampToValueAtTime(0,i+f)),r.start(i),r.stop(i+f),r.onended=()=>{try{n.close()}catch(c){}}}catch(t){}}function E(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const $=240;function H(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function he(e,t,n={}){var y;const r=W(e);n.startCardId!==void 0&&e.cards.some(s=>s.id===n.startCardId)&&(r.currentCardId=n.startCardId);const i=((y=n.scaler)!=null?y:fe)(t);t.style.perspective="1200px";const f=n.flip!==!1;let c=null;function p(s,m){const b=e.cards.find(a=>a.id===s);if(!b){E(t);return}r.currentCardId=s;const l=e.cards.findIndex(a=>a.id===s),o=l>=0?{position:l+1,total:e.cards.length}:{};if(ie(b,t,r,u,O,o),f&&!H()){const a=t.querySelector(".sy-card");a&&(a.style.transformOrigin="top center",a.style.animation=`card-enter ${$}ms ease-out`)}T(b.actions,r,a=>u(a,!0),O)}function u(s,m){if(m){if(r.autoNavCount++,r.autoNavCount>20){E(t);return}}else r.autoNavCount=0;if(!e.cards.some(l=>l.id===s)){E(t);return}const b=t.querySelector(".sy-card");f&&!m&&!H()&&b?(b.style.transformOrigin="top center",b.style.animation=`card-exit ${$}ms ease-out forwards`,c!==null&&clearTimeout(c),c=setTimeout(()=>{c=null,p(s)},$)):p(s)}return p(r.currentCardId),function(){c!==null&&(clearTimeout(c),c=null),i(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){E(e);return}const r=(t=n.textContent)!=null?t:"",d=JSON.parse(r),i=V(d);if(!i.valid){E(e);return}he(i.stack,e)}catch(n){E(e)}})})();
