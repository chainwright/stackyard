(function(){"use strict";function N(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function k(e){return typeof e=="string"}function A(e){return typeof e=="number"}function S(e){return Array.isArray(e)}function F(e){if(!N(e))return null;const t=e.type;return t==="goto"&&k(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&A(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&k(e.variable)&&(k(e.value)||A(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function P(e){if(!N(e))return null;const{type:t,id:o,x:s,y:c,w:a,h:m}=e;if(!k(o)||!A(s)||!A(c)||!A(a)||!A(m))return null;if(t==="text"&&k(e.content))return{type:"text",id:o,x:s,y:c,w:a,h:m,content:e.content};if(t==="button"&&k(e.label)&&S(e.actions)){const r=[];for(const l of e.actions){const d=F(l);if(d===null)return null;r.push(d)}return{type:"button",id:o,x:s,y:c,w:a,h:m,label:e.label,actions:r}}return t==="image"&&k(e.src)&&k(e.alt)?{type:"image",id:o,x:s,y:c,w:a,h:m,src:e.src,alt:e.alt}:t==="field"&&k(e.variable)?{type:"field",id:o,x:s,y:c,w:a,h:m,variable:e.variable}:null}function G(e){if(!N(e))return null;const{id:t,kind:o,elements:s,actions:c}=e;if(!k(t)||o!=="quiz"&&o!=="flash"&&o!=="story"&&o!=="end"||!S(s)||!S(c))return null;const a=[];for(const r of s){const l=P(r);if(l===null)return null;a.push(l)}const m=[];for(const r of c){const l=F(r);if(l===null)return null;m.push(l)}return{id:t,kind:o,elements:a,actions:m}}function _(e){if(!N(e))return null;const{id:t,title:o,theme:s,cards:c}=e;if(!k(t)||!k(o)||!N(s))return null;const{background:a,foreground:m,font:r}=s;if(!k(a)||!k(m)||!k(r)||!S(c))return null;const l=[];for(const d of c){const g=G(d);if(g===null)return null;l.push(g)}return{id:t,title:o,theme:{background:a,foreground:m,font:r},cards:l}}const D=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function z(e){return D.test(e)}function $(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function B(e){return e.elements.filter(t=>t.type==="button")}function q(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function W(e){var b;const t=[],o=new Set,s=p=>o.has(p)?!1:(o.add(p),!0);s(e.id)||t.push("duplicate-id");for(const p of e.cards){!s(p.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const y of p.elements)!s(y.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const c=new Set(e.cards.map(p=>p.id));let a=!1;for(const p of e.cards){for(const y of $(p.actions))if(!c.has(y)){a=!0;break}if(a)break;for(const y of B(p)){for(const n of $(y.actions))if(!c.has(n)){a=!0;break}if(a)break}if(a)break}a&&t.push("invalid-goto"),e.cards.filter(p=>p.kind==="end").length!==1&&t.push("end-card-count");for(const p of e.cards){if(p.kind!=="quiz")continue;const y=B(p),n=y.filter(q).length,f=y.filter(h=>!q(h)).length;if(n!==1||f<1){t.push("quiz-answer");break}}let r=!1;for(const p of e.cards){for(const y of p.elements)if(y.x+y.w>800||y.y+y.h>600){r=!0;break}if(r)break}r&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(p=>p.kind!=="end").length<1&&t.push("no-content-cards");let d=!1;if(z(e.id)||(d=!0),!d)for(const p of e.cards){if(!z(p.id)){d=!0;break}for(const y of p.elements)if(!z(y.id)){d=!0;break}if(d)break}d&&t.push("invalid-id");const g=new Map;for(const p of e.cards){const y=[];for(const n of p.actions)n.type==="goto"&&c.has(n.cardId)&&y.push(n.cardId);g.set(p.id,y)}const i=new Map;for(const p of e.cards)i.set(p.id,0);let x=!1;for(const p of e.cards){if(i.get(p.id)!==0||x)continue;const y=[];for(i.set(p.id,1),y.push({id:p.id,nextIdx:0});y.length>0&&!x;){const n=y[y.length-1],f=(b=g.get(n.id))!=null?b:[];if(n.nextIdx<f.length){const h=f[n.nextIdx];n.nextIdx++;const u=i.get(h);u===1?x=!0:u===0&&(i.set(h,1),y.push({id:h,nextIdx:0}))}else i.set(n.id,2),y.pop()}}return x&&t.push("goto-cycle"),t}function j(e){const t=_(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const o=W(t);return o.length>0?{valid:!1,errors:o}:{valid:!0,stack:t}}function V(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function X(e){e.variables={score:0},e.autoNavCount=0}function T(e,t,o,s=J){for(const c of e)switch(c.type){case"goto":{o(c.cardId);return}case"score":{const a=t.variables.score;t.variables.score=(typeof a=="number"?a:0)+c.delta;break}case"set":{t.variables[c.variable]=c.value;break}case"sound":{s(c.sound);break}}}function J(e){}const L='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',v={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},Q=[{color:v.tileA,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:v.tileB,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:v.tileC,textColor:v.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:v.tileD,textColor:v.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],U=900,K=600,Y=`
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
/* line-height is 64px = two 32px rule bands, so the text baseline lands ON a
   ruled line (the copybook look) instead of a rule striking through the glyph
   mid-height at large scales (J3 D3, 1920×1080). */
.sy-question {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 64px;
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
/* Long labels WRAP to two lines rather than being cut off with an ellipsis
   ("Norsemen from…" in the class player — J1/J3, 5 Nov panel). Two lines fit
   the 96px tile; a third would clamp. line-height stays tight so two lines
   clear the tile padding. */
.sy-tile .sy-tile-label {
  flex: 1 1 auto;
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: break-word;
  line-height: 1.15;
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
  top: -34px;
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
`;let M=!1;function Z(){if(M)return;const e=document.createElement("style");e.textContent=Y,document.head.appendChild(e),M=!0}let I=null;function ee(){if(I)return I;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),I=e,e}function te(e,t){e.innerHTML=t}function ne(e){return e.cards.filter(t=>t.kind==="quiz").length}function oe(e,t,o,s,c,a){var p,y;const m=typeof o.variables.score=="number"?o.variables.score:0,r=ne(o.stack),l=document.createElement("div");l.className="sy-end-card";const d=e.elements.find(n=>n.type==="text"),g=d&&d.type==="text"?d.content:"Well done!",i=document.createElement("h1");i.className="sy-end-heading",i.textContent=g,l.appendChild(i);const x=document.createElement("p");if(x.className="sy-end-score",x.setAttribute("data-testid","end-score"),x.textContent=`Score ${m} of ${r}`,l.appendChild(x),r>0){const n=document.createElement("div");n.className="sy-end-stamps",n.setAttribute("aria-label",`${m} of ${r} stamp${r!==1?"s":""} earned`);const f=[-8,-5,-10,-6,-9,-4,-7];for(let h=0;h<r;h++){const u=document.createElement("span");if(h<m){u.className="sy-end-slot sy-end-slot-earned",u.textContent="✓";const C=(p=f[h%f.length])!=null?p:-8;u.style.transform=`rotate(${C}deg)`}else u.className="sy-end-slot sy-end-slot-empty";u.setAttribute("aria-hidden","true"),n.appendChild(u)}l.appendChild(n)}a.textContent=`${g}. Score ${m} of ${r}.`;const b=(y=o.stack.cards[0])==null?void 0:y.id;if(b!==void 0){const n=document.createElement("div");n.className="sy-end-again";const f=document.createElement("button");f.className="sy-button sy-end-again-btn",f.setAttribute("data-testid","play-again"),f.textContent="Play Again",f.addEventListener("click",()=>{X(o),s(b,!1)}),n.appendChild(f),l.appendChild(n)}for(const n of e.elements){if(n.type!=="button")continue;const f=document.createElement("div");f.style.marginTop="16px";const h=document.createElement("button");h.className="sy-button",h.style.width="auto",h.style.height="auto",h.textContent=n.label,h.addEventListener("click",()=>{T(n.actions,o,u=>s(u,!1),c)}),f.appendChild(h),l.appendChild(f)}t.appendChild(l)}function ae(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function ie(e,t,o,s,c,a){var y,n,f,h;const m=e.elements.filter(u=>u.type==="text"),r=(n=(y=m[0])==null?void 0:y.content)!=null?n:"",l=(h=(f=m[1])==null?void 0:f.content)!=null?h:"",d=e.elements.filter(u=>u.type==="button"),g=l.trim().length>0,i=document.createElement("div");i.className="sy-flash",g&&(i.setAttribute("role","button"),i.setAttribute("tabindex","0"),i.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(i);let x="front";const b=()=>{if(i.innerHTML="",x==="front"){const u=document.createElement("p");if(u.className="sy-flash-term",u.textContent=r,i.appendChild(u),g){const C=document.createElement("p");C.className="sy-flash-hint",C.textContent="Tap the card to see the answer",i.appendChild(C)}a.textContent=r}else{const u=document.createElement("p");u.className="sy-flash-term-small",u.textContent=r,i.appendChild(u);const C=document.createElement("p");C.className="sy-flash-back",C.textContent=l,i.appendChild(C);const w=document.createElement("p");w.className="sy-flash-hint",w.textContent="Tap the card to flip back",i.appendChild(w),a.textContent=l?`${r}: ${l}`:r}if(x==="back")for(const u of d){const C=document.createElement("div");C.className="sy-flash-next";const w=document.createElement("button");w.className="sy-button",w.textContent=u.label,w.addEventListener("click",ye=>{ye.stopPropagation(),T(u.actions,o,xe=>s(xe,!1),c)}),C.appendChild(w),i.appendChild(C)}},p=()=>{g&&(x=x==="front"?"back":"front",b(),ae()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation="card-enter 240ms ease-out"))};i.addEventListener("click",p),i.addEventListener("keydown",u=>{(u.key==="Enter"||u.key===" "||u.key==="Spacebar")&&(u.preventDefault(),p())}),b()}function se(e,t,o,s,c=ue,a={}){Z();const m=ee();t.innerHTML="";const r=document.createElement("div");r.className="sy-card-stack";for(let n=1;n<=3;n++){const f=document.createElement("div");f.className=`sy-card-edge sy-card-edge-${n}`,r.appendChild(f)}const l=document.createElement("div");l.className="sy-card";const d=document.createElement("div");d.className="sy-ring-holes",d.setAttribute("aria-hidden","true");for(let n=0;n<2;n++){const f=document.createElement("div");f.className="sy-ring-hole",d.appendChild(f)}l.appendChild(d);const g=document.createElement("div");if(g.className="sy-rings",g.setAttribute("aria-hidden","true"),g.innerHTML=`<span class="sy-ring">${L}</span><span class="sy-ring">${L}</span>`,e.kind==="end"){oe(e,l,o,s,c,m),r.appendChild(l),r.appendChild(g),t.appendChild(r);return}if(typeof a.position=="number"&&typeof a.total=="number"&&a.total>0){const n=document.createElement("div");n.className="sy-meta-chrome";const f=document.createElement("p");f.className="sy-meta",f.textContent=`Card ${a.position} of ${a.total}`,n.appendChild(f),l.appendChild(n)}const i=o.variables.score;if(typeof i=="number"){const n=document.createElement("div");n.className="sy-score-chrome",n.setAttribute("aria-label",`Score ${i}`),n.textContent=`Score ${i}`,l.appendChild(n)}if(e.kind==="flash"){const n=e.elements.filter(u=>u.type==="text"),f=e.elements.filter(u=>u.type==="button");if(n.length>=2||f.length>=1){ie(e,l,o,s,c,m),r.appendChild(l),r.appendChild(g),t.appendChild(r);return}}const x=e.kind==="quiz",b=x?e.elements.filter(n=>n.type==="button"&&n.actions.length>0):[];let p=0,y=!1;for(const n of e.elements){const f=document.createElement("div");switch(f.className="sy-element",re(f,n),n.type){case"text":{const h=document.createElement("p"),u=(x||e.kind==="flash")&&!y;h.className=u?"sy-question":"sy-text",u&&(y=!0),h.textContent=n.content,f.appendChild(h);break}case"button":{const h=x&&n.actions.length>0,u=le(n,h,b.length,h?p:0,o,s,c,m);f.appendChild(u),h&&p++;break}case"image":{const h=document.createElement("img");h.setAttribute("src",n.src),h.setAttribute("alt",n.alt),h.className="sy-image",h.style.width="100%",h.style.height="100%",f.appendChild(h);break}case"field":{const h=document.createElement("span");h.className="sy-field";const u=o.variables[n.variable];h.textContent=u!==void 0?String(u):"",f.appendChild(h);break}}l.appendChild(f)}r.appendChild(l),r.appendChild(g),t.appendChild(r)}function re(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function le(e,t,o,s,c,a,m,r){const l=t?Q[s%4]:void 0,d=document.createElement("button");if(l){d.className="sy-tile",d.style.backgroundColor=l.color,d.style.color=l.textColor,e.actions.some(x=>x.type==="score"&&x.delta>0)&&d.setAttribute("data-correct","true");const g=document.createElement("span");g.className="sy-tile-shape",g.style.color=l.textColor,te(g,l.shapePath),d.appendChild(g);const i=document.createElement("span");i.className="sy-tile-label",i.textContent=e.label,d.appendChild(i)}else d.className="sy-button",d.textContent=e.label;return d.addEventListener("click",()=>{ce(d,e,l,c,a,m,r)}),d}function ce(e,t,o,s,c,a,m){const r=t.actions.some(i=>i.type==="score"&&i.delta>0),l=e.closest(".sy-card");l&&l.querySelectorAll(".sy-tile, .sy-button").forEach(i=>{i.disabled=!0});const d=t.actions.find(i=>i.type==="goto"),g=t.actions.filter(i=>i.type!=="goto");if(T(g,s,fe,a),o)if(r)de(e,m),t.actions.some(x=>x.type==="sound")||a("cheer"),setTimeout(()=>{d&&d.type==="goto"&&c(d.cardId,!1)},U);else{if(pe(e),t.actions.some(x=>x.type==="sound")||a("buzz"),l){const x=l.querySelector('.sy-tile[data-correct="true"]');x&&x!==e&&x.classList.add("sy-tile-reveal")}setTimeout(()=>{d&&d.type==="goto"&&c(d.cardId,!1)},K)}else d&&d.type==="goto"&&c(d.cardId,!1)}function de(e,t){const o=document.createElement("span");o.className="sy-stamp sy-stamp-animate",o.textContent="CORRECT ✓",o.setAttribute("aria-hidden","true"),e.appendChild(o),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function pe(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const o=document.createElement("span");o.className="sy-wrong-stamp",o.textContent="✗",o.setAttribute("aria-hidden","true"),e.appendChild(o)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function ue(e){}function fe(e){}function he(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function o(){const c=window.innerWidth,a=window.innerHeight,m=Math.min(c*.9/800,a*.9/600);e.style.transform=`scale(${m})`}o();const s=new ResizeObserver(o);return s.observe(document.body),function(){s.disconnect()}}function O(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const o=new t,s=o.createOscillator(),c=o.createGain();s.connect(c),c.connect(o.destination);const a=o.currentTime,m=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,a),s.frequency.linearRampToValueAtTime(880,a+m),c.gain.setValueAtTime(0,a),c.gain.linearRampToValueAtTime(.3,a+.05),c.gain.linearRampToValueAtTime(0,a+m)):(s.type="sawtooth",s.frequency.setValueAtTime(150,a),c.gain.setValueAtTime(.3,a),c.gain.linearRampToValueAtTime(0,a+m)),s.start(a),s.stop(a+m),s.onended=()=>{try{o.close()}catch(r){}}}catch(t){}}function E(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const R=240;function H(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function me(e,t,o={}){var g;const s=V(e);o.startCardId!==void 0&&e.cards.some(i=>i.id===o.startCardId)&&(s.currentCardId=o.startCardId);const a=((g=o.scaler)!=null?g:he)(t);t.style.perspective="1200px";const m=o.flip!==!1;let r=null;function l(i,x){const b=e.cards.find(n=>n.id===i);if(!b){E(t);return}s.currentCardId=i;const p=e.cards.findIndex(n=>n.id===i),y=p>=0?{position:p+1,total:e.cards.length}:{};if(se(b,t,s,d,O,y),m&&!H()){const n=t.querySelector(".sy-card");n&&(n.style.transformOrigin="top center",n.style.animation=`card-enter ${R}ms ease-out`)}T(b.actions,s,n=>d(n,!0),O)}function d(i,x){if(x){if(s.autoNavCount++,s.autoNavCount>20){E(t);return}}else s.autoNavCount=0;if(!e.cards.some(p=>p.id===i)){E(t);return}const b=t.querySelector(".sy-card");m&&!x&&!H()&&b?(b.style.transformOrigin="top center",b.style.animation=`card-exit ${R}ms ease-out forwards`,r!==null&&clearTimeout(r),r=setTimeout(()=>{r=null,l(i)},R)):l(i)}return l(s.currentCardId),function(){r!==null&&(clearTimeout(r),r=null),a(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const o=document.getElementById("stack-data");if(!o){E(e);return}const s=(t=o.textContent)!=null?t:"",c=JSON.parse(s),a=j(c);if(!a.valid){E(e);return}me(a.stack,e)}catch(o){E(e)}})})();
