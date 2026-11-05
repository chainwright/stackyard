(function(){"use strict";function w(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function x(e){return typeof e=="string"}function C(e){return typeof e=="number"}function A(e){return Array.isArray(e)}function T(e){if(!w(e))return null;const t=e.type;return t==="goto"&&x(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&C(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&x(e.variable)&&(x(e.value)||C(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function O(e){if(!w(e))return null;const{type:t,id:n,x:a,y:l,w:r,h:f}=e;if(!x(n)||!C(a)||!C(l)||!C(r)||!C(f))return null;if(t==="text"&&x(e.content))return{type:"text",id:n,x:a,y:l,w:r,h:f,content:e.content};if(t==="button"&&x(e.label)&&A(e.actions)){const d=[];for(const p of e.actions){const c=T(p);if(c===null)return null;d.push(c)}return{type:"button",id:n,x:a,y:l,w:r,h:f,label:e.label,actions:d}}return t==="image"&&x(e.src)&&x(e.alt)?{type:"image",id:n,x:a,y:l,w:r,h:f,src:e.src,alt:e.alt}:t==="field"&&x(e.variable)?{type:"field",id:n,x:a,y:l,w:r,h:f,variable:e.variable}:null}function _(e){if(!w(e))return null;const{id:t,kind:n,elements:a,actions:l}=e;if(!x(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!A(a)||!A(l))return null;const r=[];for(const d of a){const p=O(d);if(p===null)return null;r.push(p)}const f=[];for(const d of l){const p=T(d);if(p===null)return null;f.push(p)}return{id:t,kind:n,elements:r,actions:f}}function H(e){if(!w(e))return null;const{id:t,title:n,theme:a,cards:l}=e;if(!x(t)||!x(n)||!w(a))return null;const{background:r,foreground:f,font:d}=a;if(!x(r)||!x(f)||!x(d)||!A(l))return null;const p=[];for(const c of l){const m=_(c);if(m===null)return null;p.push(m)}return{id:t,title:n,theme:{background:r,foreground:f,font:d},cards:p}}const G=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function E(e){return G.test(e)}function I(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function $(e){return e.elements.filter(t=>t.type==="button")}function R(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function j(e){var b;const t=[],n=new Set,a=s=>n.has(s)?!1:(n.add(s),!0);a(e.id)||t.push("duplicate-id");for(const s of e.cards){!a(s.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const o of s.elements)!a(o.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const l=new Set(e.cards.map(s=>s.id));let r=!1;for(const s of e.cards){for(const o of I(s.actions))if(!l.has(o)){r=!0;break}if(r)break;for(const o of $(s)){for(const i of I(o.actions))if(!l.has(i)){r=!0;break}if(r)break}if(r)break}r&&t.push("invalid-goto"),e.cards.filter(s=>s.kind==="end").length!==1&&t.push("end-card-count");for(const s of e.cards){if(s.kind!=="quiz")continue;const o=$(s),i=o.filter(R).length,h=o.filter(v=>!R(v)).length;if(i!==1||h<1){t.push("quiz-answer");break}}let d=!1;for(const s of e.cards){for(const o of s.elements)if(o.x+o.w>800||o.y+o.h>600){d=!0;break}if(d)break}d&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(s=>s.kind!=="end").length<1&&t.push("no-content-cards");let c=!1;if(E(e.id)||(c=!0),!c)for(const s of e.cards){if(!E(s.id)){c=!0;break}for(const o of s.elements)if(!E(o.id)){c=!0;break}if(c)break}c&&t.push("invalid-id");const m=new Map;for(const s of e.cards){const o=[];for(const i of s.actions)i.type==="goto"&&l.has(i.cardId)&&o.push(i.cardId);m.set(s.id,o)}const u=new Map;for(const s of e.cards)u.set(s.id,0);let y=!1;for(const s of e.cards){if(u.get(s.id)!==0||y)continue;const o=[];for(u.set(s.id,1),o.push({id:s.id,nextIdx:0});o.length>0&&!y;){const i=o[o.length-1],h=(b=m.get(i.id))!=null?b:[];if(i.nextIdx<h.length){const v=h[i.nextIdx];i.nextIdx++;const M=u.get(v);M===1?y=!0:M===0&&(u.set(v,1),o.push({id:v,nextIdx:0}))}else u.set(i.id,2),o.pop()}}return y&&t.push("goto-cycle"),t}function D(e){const t=H(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=j(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function P(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function S(e,t,n,a=V){for(const l of e)switch(l.type){case"goto":{n(l.cardId);return}case"score":{const r=t.variables.score;t.variables.score=(typeof r=="number"?r:0)+l.delta;break}case"set":{t.variables[l.variable]=l.value;break}case"sound":{a(l.sound);break}}}function V(e){}const F='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',g={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},W=[{color:g.tileA,textColor:g.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:g.tileB,textColor:g.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:g.tileC,textColor:g.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:g.tileD,textColor:g.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],X=900,U=600,Q=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${g.paper};
  --color-ink:     ${g.ink};
  --color-rule:    ${g.rule};
  --color-stamp:   ${g.stamp};
  --color-tile-a:  ${g.tileA};
  --color-tile-b:  ${g.tileB};
  --color-tile-c:  ${g.tileC};
  --color-tile-d:  ${g.tileD};
  --color-white:   ${g.white};
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
`;let q=!1;function J(){if(q)return;const e=document.createElement("style");e.textContent=Q,document.head.appendChild(e),q=!0}let N=null;function Y(){if(N)return N;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),N=e,e}function K(e,t){e.innerHTML=t}function Z(e){return e.cards.filter(t=>t.kind==="quiz").length}function ee(e,t,n,a,l,r){var b;const f=typeof n.variables.score=="number"?n.variables.score:0,d=Z(n.stack),p=document.createElement("div");p.className="sy-end-card";const c=e.elements.find(s=>s.type==="text"),m=c&&c.type==="text"?c.content:"Well done!",u=document.createElement("h1");u.className="sy-end-heading",u.textContent=m,p.appendChild(u);const y=document.createElement("p");if(y.className="sy-end-score",y.setAttribute("data-testid","end-score"),y.textContent=`Score ${f} of ${d}`,p.appendChild(y),d>0){const s=document.createElement("div");s.className="sy-end-stamps",s.setAttribute("aria-label",`${f} of ${d} stamp${d!==1?"s":""} earned`);const o=[-8,-5,-10,-6,-9,-4,-7];for(let i=0;i<d;i++){const h=document.createElement("span");if(i<f){h.className="sy-end-slot sy-end-slot-earned",h.textContent="✓";const v=(b=o[i%o.length])!=null?b:-8;h.style.transform=`rotate(${v}deg)`}else h.className="sy-end-slot sy-end-slot-empty";h.setAttribute("aria-hidden","true"),s.appendChild(h)}p.appendChild(s)}r.textContent=`${m}. Score ${f} of ${d}.`;for(const s of e.elements){if(s.type!=="button")continue;const o=document.createElement("div");o.style.marginTop="16px";const i=document.createElement("button");i.className="sy-button",i.style.width="auto",i.style.height="auto",i.textContent=s.label,i.addEventListener("click",()=>{S(s.actions,n,h=>a(h,!1),l)}),o.appendChild(i),p.appendChild(o)}t.appendChild(p)}function te(e,t,n,a,l=se,r={}){J();const f=Y();t.innerHTML="";const d=document.createElement("div");d.className="sy-card-stack";for(let o=1;o<=3;o++){const i=document.createElement("div");i.className=`sy-card-edge sy-card-edge-${o}`,d.appendChild(i)}const p=document.createElement("div");p.className="sy-card";const c=document.createElement("div");c.className="sy-ring-holes",c.setAttribute("aria-hidden","true");for(let o=0;o<2;o++){const i=document.createElement("div");i.className="sy-ring-hole",c.appendChild(i)}p.appendChild(c);const m=document.createElement("div");if(m.className="sy-rings",m.setAttribute("aria-hidden","true"),m.innerHTML=`<span class="sy-ring">${F}</span><span class="sy-ring">${F}</span>`,e.kind==="end"){ee(e,p,n,a,l,f),d.appendChild(p),d.appendChild(m),t.appendChild(d);return}if(typeof r.position=="number"&&typeof r.total=="number"&&r.total>0){const o=document.createElement("div");o.className="sy-meta-chrome";const i=document.createElement("p");i.className="sy-meta",i.textContent=`Card ${r.position} of ${r.total}`,o.appendChild(i),p.appendChild(o)}const u=n.variables.score;if(typeof u=="number"){const o=document.createElement("div");o.className="sy-score-chrome",o.setAttribute("aria-label",`Score ${u}`),o.textContent=`Score ${u}`,p.appendChild(o)}const y=e.kind==="quiz",b=y?e.elements.filter(o=>o.type==="button"&&o.actions.length>0):[];let s=0;for(const o of e.elements){const i=document.createElement("div");switch(i.className="sy-element",ne(i,o),o.type){case"text":{const h=document.createElement("p");h.className=y||e.kind==="flash"?"sy-question":"sy-text",h.textContent=o.content,i.appendChild(h);break}case"button":{const h=y&&o.actions.length>0,v=oe(o,h,b.length,h?s:0,n,a,l,f);i.appendChild(v),h&&s++;break}case"image":{const h=document.createElement("img");h.setAttribute("src",o.src),h.setAttribute("alt",o.alt),h.className="sy-image",h.style.width="100%",h.style.height="100%",i.appendChild(h);break}case"field":{const h=document.createElement("span");h.className="sy-field";const v=n.variables[o.variable];h.textContent=v!==void 0?String(v):"",i.appendChild(h);break}}p.appendChild(i)}d.appendChild(p),d.appendChild(m),t.appendChild(d)}function ne(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function oe(e,t,n,a,l,r,f,d){const p=t?W[a%4]:void 0,c=document.createElement("button");if(p){c.className="sy-tile",c.style.backgroundColor=p.color,c.style.color=p.textColor;const m=document.createElement("span");m.className="sy-tile-shape",m.style.color=p.textColor,K(m,p.shapePath),c.appendChild(m);const u=document.createElement("span");u.className="sy-tile-label",u.textContent=e.label,c.appendChild(u)}else c.className="sy-button",c.textContent=e.label;return c.addEventListener("click",()=>{re(c,e,p,l,r,f,d)}),c}function re(e,t,n,a,l,r,f){const d=t.actions.some(u=>u.type==="score"&&u.delta>0),p=e.closest(".sy-card");p&&p.querySelectorAll(".sy-tile, .sy-button").forEach(u=>{u.disabled=!0});const c=t.actions.find(u=>u.type==="goto"),m=t.actions.filter(u=>u.type!=="goto");S(m,a,le,r),n?d?(ie(e,f),t.actions.some(y=>y.type==="sound")||r("cheer"),setTimeout(()=>{c&&c.type==="goto"&&l(c.cardId,!1)},X)):(ae(e),t.actions.some(y=>y.type==="sound")||r("buzz"),setTimeout(()=>{c&&c.type==="goto"&&l(c.cardId,!1)},U)):c&&c.type==="goto"&&l(c.cardId,!1)}function ie(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function ae(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function se(e){}function le(e){}function ce(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const l=window.innerWidth,r=window.innerHeight,f=Math.min(l*.9/800,r*.9/600);e.style.transform=`scale(${f})`}n();const a=new ResizeObserver(n);return a.observe(document.body),function(){a.disconnect()}}function L(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,a=n.createOscillator(),l=n.createGain();a.connect(l),l.connect(n.destination);const r=n.currentTime,f=.5;e==="cheer"?(a.type="triangle",a.frequency.setValueAtTime(440,r),a.frequency.linearRampToValueAtTime(880,r+f),l.gain.setValueAtTime(0,r),l.gain.linearRampToValueAtTime(.3,r+.05),l.gain.linearRampToValueAtTime(0,r+f)):(a.type="sawtooth",a.frequency.setValueAtTime(150,r),l.gain.setValueAtTime(.3,r),l.gain.linearRampToValueAtTime(0,r+f)),a.start(r),a.stop(r+f),a.onended=()=>{try{n.close()}catch(d){}}}catch(t){}}function k(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const z=240;function B(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function de(e,t,n={}){var m;const a=P(e);n.startCardId!==void 0&&e.cards.some(u=>u.id===n.startCardId)&&(a.currentCardId=n.startCardId);const r=((m=n.scaler)!=null?m:ce)(t);t.style.perspective="1200px";const f=n.flip!==!1;let d=null;function p(u,y){const b=e.cards.find(i=>i.id===u);if(!b){k(t);return}a.currentCardId=u;const s=e.cards.findIndex(i=>i.id===u),o=s>=0?{position:s+1,total:e.cards.length}:{};if(te(b,t,a,c,L,o),f&&!B()){const i=t.querySelector(".sy-card");i&&(i.style.transformOrigin="top center",i.style.animation=`card-enter ${z}ms ease-out`)}S(b.actions,a,i=>c(i,!0),L)}function c(u,y){if(y){if(a.autoNavCount++,a.autoNavCount>20){k(t);return}}else a.autoNavCount=0;if(!e.cards.some(s=>s.id===u)){k(t);return}const b=t.querySelector(".sy-card");f&&!y&&!B()&&b?(b.style.transformOrigin="top center",b.style.animation=`card-exit ${z}ms ease-out forwards`,d!==null&&clearTimeout(d),d=setTimeout(()=>{d=null,p(u)},z)):p(u)}return p(a.currentCardId),function(){d!==null&&(clearTimeout(d),d=null),r(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){k(e);return}const a=(t=n.textContent)!=null?t:"",l=JSON.parse(a),r=D(l);if(!r.valid){k(e);return}de(r.stack,e)}catch(n){k(e)}})})();
