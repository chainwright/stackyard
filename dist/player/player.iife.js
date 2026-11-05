(function(){"use strict";function N(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function k(e){return typeof e=="string"}function A(e){return typeof e=="number"}function S(e){return Array.isArray(e)}function R(e){if(!N(e))return null;const t=e.type;return t==="goto"&&k(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&A(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&k(e.variable)&&(k(e.value)||A(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function P(e){if(!N(e))return null;const{type:t,id:n,x:s,y:d,w:i,h}=e;if(!k(n)||!A(s)||!A(d)||!A(i)||!A(h))return null;if(t==="text"&&k(e.content))return{type:"text",id:n,x:s,y:d,w:i,h,content:e.content};if(t==="button"&&k(e.label)&&S(e.actions)){const l=[];for(const c of e.actions){const p=R(c);if(p===null)return null;l.push(p)}return{type:"button",id:n,x:s,y:d,w:i,h,label:e.label,actions:l}}return t==="image"&&k(e.src)&&k(e.alt)?{type:"image",id:n,x:s,y:d,w:i,h,src:e.src,alt:e.alt}:t==="field"&&k(e.variable)?{type:"field",id:n,x:s,y:d,w:i,h,variable:e.variable}:null}function G(e){if(!N(e))return null;const{id:t,kind:n,elements:s,actions:d}=e;if(!k(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!S(s)||!S(d))return null;const i=[];for(const l of s){const c=P(l);if(c===null)return null;i.push(c)}const h=[];for(const l of d){const c=R(l);if(c===null)return null;h.push(c)}return{id:t,kind:n,elements:i,actions:h}}function _(e){if(!N(e))return null;const{id:t,title:n,theme:s,cards:d}=e;if(!k(t)||!k(n)||!N(s))return null;const{background:i,foreground:h,font:l}=s;if(!k(i)||!k(h)||!k(l)||!S(d))return null;const c=[];for(const p of d){const x=G(p);if(x===null)return null;c.push(x)}return{id:t,title:n,theme:{background:i,foreground:h,font:l},cards:c}}const D=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function z(e){return D.test(e)}function $(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function B(e){return e.elements.filter(t=>t.type==="button")}function L(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function j(e){var b;const t=[],n=new Set,s=u=>n.has(u)?!1:(n.add(u),!0);s(e.id)||t.push("duplicate-id");for(const u of e.cards){!s(u.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const o of u.elements)!s(o.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const d=new Set(e.cards.map(u=>u.id));let i=!1;for(const u of e.cards){for(const o of $(u.actions))if(!d.has(o)){i=!0;break}if(i)break;for(const o of B(u)){for(const a of $(o.actions))if(!d.has(a)){i=!0;break}if(i)break}if(i)break}i&&t.push("invalid-goto"),e.cards.filter(u=>u.kind==="end").length!==1&&t.push("end-card-count");for(const u of e.cards){if(u.kind!=="quiz")continue;const o=B(u),a=o.filter(L).length,f=o.filter(g=>!L(g)).length;if(a!==1||f<1){t.push("quiz-answer");break}}let l=!1;for(const u of e.cards){for(const o of u.elements)if(o.x+o.w>800||o.y+o.h>600){l=!0;break}if(l)break}l&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(u=>u.kind!=="end").length<1&&t.push("no-content-cards");let p=!1;if(z(e.id)||(p=!0),!p)for(const u of e.cards){if(!z(u.id)){p=!0;break}for(const o of u.elements)if(!z(o.id)){p=!0;break}if(p)break}p&&t.push("invalid-id");const x=new Map;for(const u of e.cards){const o=[];for(const a of u.actions)a.type==="goto"&&d.has(a.cardId)&&o.push(a.cardId);x.set(u.id,o)}const r=new Map;for(const u of e.cards)r.set(u.id,0);let m=!1;for(const u of e.cards){if(r.get(u.id)!==0||m)continue;const o=[];for(r.set(u.id,1),o.push({id:u.id,nextIdx:0});o.length>0&&!m;){const a=o[o.length-1],f=(b=x.get(a.id))!=null?b:[];if(a.nextIdx<f.length){const g=f[a.nextIdx];a.nextIdx++;const y=r.get(g);y===1?m=!0:y===0&&(r.set(g,1),o.push({id:g,nextIdx:0}))}else r.set(a.id,2),o.pop()}}return m&&t.push("goto-cycle"),t}function W(e){const t=_(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=j(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function V(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function X(e){e.variables={score:0},e.autoNavCount=0}function T(e,t,n,s=U){for(const d of e)switch(d.type){case"goto":{n(d.cardId);return}case"score":{const i=t.variables.score;t.variables.score=(typeof i=="number"?i:0)+d.delta;break}case"set":{t.variables[d.variable]=d.value;break}case"sound":{s(d.sound);break}}}function U(e){}const q='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',v={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},Q=[{color:v.tileA,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:v.tileB,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:v.tileC,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:v.tileD,textColor:v.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],J=900,K=600,Y=`
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
/* The "tap to flip" hint, bottom-LEFT on both sides. Width is capped to the
   left column (ends at x=392) so the bottom-right "Next Card" button (which
   starts at x=408) can never cover it — the Irish-deck overlap where "Next
   Card" sat on top of "Tap the card to flip back" (built-app review round 3,
   P1 #2). Left-aligned, never centred. */
.sy-flash-hint {
  position: absolute;
  left: 48px;
  top: 524px;
  width: 344px;
  text-align: left;
  font-size: var(--text-meta);       /* 20px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.3;
  color: #4a5878;
}
/* "Next Card" shown on the BACK only, bottom-RIGHT, clear of the hint on its
   left (x 408..752) and below the explanation (which ends by y 480). */
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
/* "Play Again" paper tab under the stamp grid. A normal navy button — never
   stamp red (earned-stamp colour only). */
.sy-end-again {
  margin-top: 8px;
}
.sy-end-again-btn {
  width: auto;
  height: auto;
  min-height: 56px;
  padding: 12px 32px;
  border: 2px solid var(--color-ink);
  border-bottom-width: 4px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: 24px;
  font-weight: 700;
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
`;let M=!1;function Z(){if(M)return;const e=document.createElement("style");e.textContent=Y,document.head.appendChild(e),M=!0}let I=null;function ee(){if(I)return I;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),I=e,e}function te(e,t){e.innerHTML=t}function ne(e){return e.cards.filter(t=>t.kind==="quiz").length}function oe(e,t,n,s,d,i){var u,o;const h=typeof n.variables.score=="number"?n.variables.score:0,l=ne(n.stack),c=document.createElement("div");c.className="sy-end-card";const p=e.elements.find(a=>a.type==="text"),x=p&&p.type==="text"?p.content:"Well done!",r=document.createElement("h1");r.className="sy-end-heading",r.textContent=x,c.appendChild(r);const m=document.createElement("p");if(m.className="sy-end-score",m.setAttribute("data-testid","end-score"),m.textContent=`Score ${h} of ${l}`,c.appendChild(m),l>0){const a=document.createElement("div");a.className="sy-end-stamps",a.setAttribute("aria-label",`${h} of ${l} stamp${l!==1?"s":""} earned`);const f=[-8,-5,-10,-6,-9,-4,-7];for(let g=0;g<l;g++){const y=document.createElement("span");if(g<h){y.className="sy-end-slot sy-end-slot-earned",y.textContent="✓";const C=(u=f[g%f.length])!=null?u:-8;y.style.transform=`rotate(${C}deg)`}else y.className="sy-end-slot sy-end-slot-empty";y.setAttribute("aria-hidden","true"),a.appendChild(y)}c.appendChild(a)}i.textContent=`${x}. Score ${h} of ${l}.`;const b=(o=n.stack.cards[0])==null?void 0:o.id;if(b!==void 0){const a=document.createElement("div");a.className="sy-end-again";const f=document.createElement("button");f.className="sy-button sy-end-again-btn",f.setAttribute("data-testid","play-again"),f.textContent="Play Again",f.addEventListener("click",()=>{X(n),s(b,!1)}),a.appendChild(f),c.appendChild(a)}for(const a of e.elements){if(a.type!=="button")continue;const f=document.createElement("div");f.style.marginTop="16px";const g=document.createElement("button");g.className="sy-button",g.style.width="auto",g.style.height="auto",g.textContent=a.label,g.addEventListener("click",()=>{T(a.actions,n,y=>s(y,!1),d)}),f.appendChild(g),c.appendChild(f)}t.appendChild(c)}function ae(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function ie(e,t,n,s,d,i){var o,a,f,g;const h=e.elements.filter(y=>y.type==="text"),l=(a=(o=h[0])==null?void 0:o.content)!=null?a:"",c=(g=(f=h[1])==null?void 0:f.content)!=null?g:"",p=e.elements.filter(y=>y.type==="button"),x=c.trim().length>0,r=document.createElement("div");r.className="sy-flash",x&&(r.setAttribute("role","button"),r.setAttribute("tabindex","0"),r.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(r);let m="front";const b=()=>{if(r.innerHTML="",m==="front"){const y=document.createElement("p");if(y.className="sy-flash-term",y.textContent=l,r.appendChild(y),x){const C=document.createElement("p");C.className="sy-flash-hint",C.textContent="Tap the card to see the answer",r.appendChild(C)}i.textContent=l}else{const y=document.createElement("p");y.className="sy-flash-term-small",y.textContent=l,r.appendChild(y);const C=document.createElement("p");C.className="sy-flash-back",C.textContent=c,r.appendChild(C);const w=document.createElement("p");w.className="sy-flash-hint",w.textContent="Tap the card to flip back",r.appendChild(w),i.textContent=c?`${l}: ${c}`:l}if(m==="back")for(const y of p){const C=document.createElement("div");C.className="sy-flash-next";const w=document.createElement("button");w.className="sy-button",w.textContent=y.label,w.addEventListener("click",ye=>{ye.stopPropagation(),T(y.actions,n,xe=>s(xe,!1),d)}),C.appendChild(w),r.appendChild(C)}},u=()=>{x&&(m=m==="front"?"back":"front",b(),ae()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation="card-enter 240ms ease-out"))};r.addEventListener("click",u),r.addEventListener("keydown",y=>{(y.key==="Enter"||y.key===" "||y.key==="Spacebar")&&(y.preventDefault(),u())}),b()}function re(e,t,n,s,d=ue,i={}){Z();const h=ee();t.innerHTML="";const l=document.createElement("div");l.className="sy-card-stack";for(let o=1;o<=3;o++){const a=document.createElement("div");a.className=`sy-card-edge sy-card-edge-${o}`,l.appendChild(a)}const c=document.createElement("div");c.className="sy-card";const p=document.createElement("div");p.className="sy-ring-holes",p.setAttribute("aria-hidden","true");for(let o=0;o<2;o++){const a=document.createElement("div");a.className="sy-ring-hole",p.appendChild(a)}c.appendChild(p);const x=document.createElement("div");if(x.className="sy-rings",x.setAttribute("aria-hidden","true"),x.innerHTML=`<span class="sy-ring">${q}</span><span class="sy-ring">${q}</span>`,e.kind==="end"){oe(e,c,n,s,d,h),l.appendChild(c),l.appendChild(x),t.appendChild(l);return}if(typeof i.position=="number"&&typeof i.total=="number"&&i.total>0){const o=document.createElement("div");o.className="sy-meta-chrome";const a=document.createElement("p");a.className="sy-meta",a.textContent=`Card ${i.position} of ${i.total}`,o.appendChild(a),c.appendChild(o)}const r=n.variables.score;if(typeof r=="number"){const o=document.createElement("div");o.className="sy-score-chrome",o.setAttribute("aria-label",`Score ${r}`),o.textContent=`Score ${r}`,c.appendChild(o)}if(e.kind==="flash"){const o=e.elements.filter(g=>g.type==="text"),a=e.elements.filter(g=>g.type==="button");if(o.length>=2||a.length>=1){ie(e,c,n,s,d,h),l.appendChild(c),l.appendChild(x),t.appendChild(l);return}}const m=e.kind==="quiz",b=m?e.elements.filter(o=>o.type==="button"&&o.actions.length>0):[];let u=0;for(const o of e.elements){const a=document.createElement("div");switch(a.className="sy-element",se(a,o),o.type){case"text":{const f=document.createElement("p");f.className=m||e.kind==="flash"?"sy-question":"sy-text",f.textContent=o.content,a.appendChild(f);break}case"button":{const f=m&&o.actions.length>0,g=le(o,f,b.length,f?u:0,n,s,d,h);a.appendChild(g),f&&u++;break}case"image":{const f=document.createElement("img");f.setAttribute("src",o.src),f.setAttribute("alt",o.alt),f.className="sy-image",f.style.width="100%",f.style.height="100%",a.appendChild(f);break}case"field":{const f=document.createElement("span");f.className="sy-field";const g=n.variables[o.variable];f.textContent=g!==void 0?String(g):"",a.appendChild(f);break}}c.appendChild(a)}l.appendChild(c),l.appendChild(x),t.appendChild(l)}function se(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function le(e,t,n,s,d,i,h,l){const c=t?Q[s%4]:void 0,p=document.createElement("button");if(c){p.className="sy-tile",p.style.backgroundColor=c.color,p.style.color=c.textColor,e.actions.some(m=>m.type==="score"&&m.delta>0)&&p.setAttribute("data-correct","true");const x=document.createElement("span");x.className="sy-tile-shape",x.style.color=c.textColor,te(x,c.shapePath),p.appendChild(x);const r=document.createElement("span");r.className="sy-tile-label",r.textContent=e.label,p.appendChild(r)}else p.className="sy-button",p.textContent=e.label;return p.addEventListener("click",()=>{ce(p,e,c,d,i,h,l)}),p}function ce(e,t,n,s,d,i,h){const l=t.actions.some(r=>r.type==="score"&&r.delta>0),c=e.closest(".sy-card");c&&c.querySelectorAll(".sy-tile, .sy-button").forEach(r=>{r.disabled=!0});const p=t.actions.find(r=>r.type==="goto"),x=t.actions.filter(r=>r.type!=="goto");if(T(x,s,fe,i),n)if(l)de(e,h),t.actions.some(m=>m.type==="sound")||i("cheer"),setTimeout(()=>{p&&p.type==="goto"&&d(p.cardId,!1)},J);else{if(pe(e),t.actions.some(m=>m.type==="sound")||i("buzz"),c){const m=c.querySelector('.sy-tile[data-correct="true"]');m&&m!==e&&m.classList.add("sy-tile-reveal")}setTimeout(()=>{p&&p.type==="goto"&&d(p.cardId,!1)},K)}else p&&p.type==="goto"&&d(p.cardId,!1)}function de(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function pe(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function ue(e){}function fe(e){}function he(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const d=window.innerWidth,i=window.innerHeight,h=Math.min(d*.9/800,i*.9/600);e.style.transform=`scale(${h})`}n();const s=new ResizeObserver(n);return s.observe(document.body),function(){s.disconnect()}}function O(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,s=n.createOscillator(),d=n.createGain();s.connect(d),d.connect(n.destination);const i=n.currentTime,h=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,i),s.frequency.linearRampToValueAtTime(880,i+h),d.gain.setValueAtTime(0,i),d.gain.linearRampToValueAtTime(.3,i+.05),d.gain.linearRampToValueAtTime(0,i+h)):(s.type="sawtooth",s.frequency.setValueAtTime(150,i),d.gain.setValueAtTime(.3,i),d.gain.linearRampToValueAtTime(0,i+h)),s.start(i),s.stop(i+h),s.onended=()=>{try{n.close()}catch(l){}}}catch(t){}}function E(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const F=240;function H(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function me(e,t,n={}){var x;const s=V(e);n.startCardId!==void 0&&e.cards.some(r=>r.id===n.startCardId)&&(s.currentCardId=n.startCardId);const i=((x=n.scaler)!=null?x:he)(t);t.style.perspective="1200px";const h=n.flip!==!1;let l=null;function c(r,m){const b=e.cards.find(a=>a.id===r);if(!b){E(t);return}s.currentCardId=r;const u=e.cards.findIndex(a=>a.id===r),o=u>=0?{position:u+1,total:e.cards.length}:{};if(re(b,t,s,p,O,o),h&&!H()){const a=t.querySelector(".sy-card");a&&(a.style.transformOrigin="top center",a.style.animation=`card-enter ${F}ms ease-out`)}T(b.actions,s,a=>p(a,!0),O)}function p(r,m){if(m){if(s.autoNavCount++,s.autoNavCount>20){E(t);return}}else s.autoNavCount=0;if(!e.cards.some(u=>u.id===r)){E(t);return}const b=t.querySelector(".sy-card");h&&!m&&!H()&&b?(b.style.transformOrigin="top center",b.style.animation=`card-exit ${F}ms ease-out forwards`,l!==null&&clearTimeout(l),l=setTimeout(()=>{l=null,c(r)},F)):c(r)}return c(s.currentCardId),function(){l!==null&&(clearTimeout(l),l=null),i(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){E(e);return}const s=(t=n.textContent)!=null?t:"",d=JSON.parse(s),i=W(d);if(!i.valid){E(e);return}me(i.stack,e)}catch(n){E(e)}})})();
