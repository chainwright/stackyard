(function(){"use strict";function k(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function b(e){return typeof e=="string"}function C(e){return typeof e=="number"}function w(e){return Array.isArray(e)}function S(e){if(!k(e))return null;const t=e.type;return t==="goto"&&b(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&C(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&b(e.variable)&&(b(e.value)||C(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function L(e){if(!k(e))return null;const{type:t,id:n,x:s,y:r,w:i,h:d}=e;if(!b(n)||!C(s)||!C(r)||!C(i)||!C(d))return null;if(t==="text"&&b(e.content))return{type:"text",id:n,x:s,y:r,w:i,h:d,content:e.content};if(t==="button"&&b(e.label)&&w(e.actions)){const p=[];for(const u of e.actions){const l=S(u);if(l===null)return null;p.push(l)}return{type:"button",id:n,x:s,y:r,w:i,h:d,label:e.label,actions:p}}return t==="image"&&b(e.src)&&b(e.alt)?{type:"image",id:n,x:s,y:r,w:i,h:d,src:e.src,alt:e.alt}:t==="field"&&b(e.variable)?{type:"field",id:n,x:s,y:r,w:i,h:d,variable:e.variable}:null}function H(e){if(!k(e))return null;const{id:t,kind:n,elements:s,actions:r}=e;if(!b(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!w(s)||!w(r))return null;const i=[];for(const p of s){const u=L(p);if(u===null)return null;i.push(u)}const d=[];for(const p of r){const u=S(p);if(u===null)return null;d.push(u)}return{id:t,kind:n,elements:i,actions:d}}function M(e){if(!k(e))return null;const{id:t,title:n,theme:s,cards:r}=e;if(!b(t)||!b(n)||!k(s))return null;const{background:i,foreground:d,font:p}=s;if(!b(i)||!b(d)||!b(p)||!w(r))return null;const u=[];for(const l of r){const h=H(l);if(h===null)return null;u.push(h)}return{id:t,title:n,theme:{background:i,foreground:d,font:p},cards:u}}const O=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function E(e){return O.test(e)}function T(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function I(e){return e.elements.filter(t=>t.type==="button")}function $(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function _(e){var x;const t=[],n=new Set,s=a=>n.has(a)?!1:(n.add(a),!0);s(e.id)||t.push("duplicate-id");for(const a of e.cards){!s(a.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const o of a.elements)!s(o.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(a=>a.id));let i=!1;for(const a of e.cards){for(const o of T(a.actions))if(!r.has(o)){i=!0;break}if(i)break;for(const o of I(a)){for(const f of T(o.actions))if(!r.has(f)){i=!0;break}if(i)break}if(i)break}i&&t.push("invalid-goto"),e.cards.filter(a=>a.kind==="end").length!==1&&t.push("end-card-count");for(const a of e.cards){if(a.kind!=="quiz")continue;const o=I(a),f=o.filter($).length,m=o.filter(v=>!$(v)).length;if(f!==1||m<1){t.push("quiz-answer");break}}let p=!1;for(const a of e.cards){for(const o of a.elements)if(o.x+o.w>800||o.y+o.h>600){p=!0;break}if(p)break}p&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(a=>a.kind!=="end").length<1&&t.push("no-content-cards");let l=!1;if(E(e.id)||(l=!0),!l)for(const a of e.cards){if(!E(a.id)){l=!0;break}for(const o of a.elements)if(!E(o.id)){l=!0;break}if(l)break}l&&t.push("invalid-id");const h=new Map;for(const a of e.cards){const o=[];for(const f of a.actions)f.type==="goto"&&r.has(f.cardId)&&o.push(f.cardId);h.set(a.id,o)}const c=new Map;for(const a of e.cards)c.set(a.id,0);let g=!1;for(const a of e.cards){if(c.get(a.id)!==0||g)continue;const o=[];for(c.set(a.id,1),o.push({id:a.id,nextIdx:0});o.length>0&&!g;){const f=o[o.length-1],m=(x=h.get(f.id))!=null?x:[];if(f.nextIdx<m.length){const v=m[f.nextIdx];f.nextIdx++;const q=c.get(v);q===1?g=!0:q===0&&(c.set(v,1),o.push({id:v,nextIdx:0}))}else c.set(f.id,2),o.pop()}}return g&&t.push("goto-cycle"),t}function D(e){const t=M(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=_(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function G(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function z(e,t,n,s=j){for(const r of e)switch(r.type){case"goto":{n(r.cardId);return}case"score":{const i=t.variables.score;t.variables.score=(typeof i=="number"?i:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{s(r.sound);break}}}function j(e){}const F='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',y={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},V=[{color:y.tileA,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:y.tileB,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:y.tileC,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:y.tileD,textColor:y.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],P=900,X=600,W=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${y.paper};
  --color-ink:     ${y.ink};
  --color-rule:    ${y.rule};
  --color-stamp:   ${y.stamp};
  --color-tile-a:  ${y.tileA};
  --color-tile-b:  ${y.tileB};
  --color-tile-c:  ${y.tileC};
  --color-tile-d:  ${y.tileD};
  --color-white:   ${y.white};
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
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
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
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
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
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Field span ---- */
.sy-field {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
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
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
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

/* ---- Generic button ---- */
.sy-button {
  border: 2px solid var(--color-ink);
  border-radius: 10px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: var(--text-body);       /* 22px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
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
/* Anchored so its BOTTOM edge sits at tile-top + 14px
   (bottom: calc(100% - 14px)), right-aligned 16px from the tile's right edge.
   Reduced to ~0.75 of original size (26px font, 6px 12px padding) so at most
   the top 25% of the tile label is obscured.
   Real-browser overlap is verified by screenshot (docs/design/review/). */
.sy-stamp {
  position: absolute;
  bottom: calc(100% - 14px);
  right: 16px;
  left: auto;
  transform: rotate(-8deg) scale(1);
  color: var(--color-stamp);
  font-size: 26px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  background: var(--color-paper);
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 6px 12px;
  opacity: 0.92;
  pointer-events: none;
  white-space: nowrap;
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
.sy-end-stamps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.sy-end-stamp-pip {
  display: inline-block;
  font-size: 14px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--color-stamp);
  border: 2px solid var(--color-stamp);
  border-radius: 4px;
  padding: 2px 5px;
  opacity: 0.88;
  line-height: 1.2;
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
`;let B=!1;function Q(){if(B)return;const e=document.createElement("style");e.textContent=W,document.head.appendChild(e),B=!0}let N=null;function U(){if(N)return N;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),N=e,e}function J(e,t){e.innerHTML=t}function Y(e){return e.cards.filter(t=>t.kind==="quiz").length}function K(e,t,n,s,r,i){const d=typeof n.variables.score=="number"?n.variables.score:0,p=Y(n.stack),u=document.createElement("div");u.className="sy-end-card";const l=e.elements.find(x=>x.type==="text"),h=l&&l.type==="text"?l.content:"Well done!",c=document.createElement("h1");c.className="sy-end-heading",c.textContent=h,u.appendChild(c);const g=document.createElement("p");if(g.className="sy-end-score",g.setAttribute("data-testid","end-score"),g.textContent=`Score ${d} of ${p}`,u.appendChild(g),d>0){const x=document.createElement("div");x.className="sy-end-stamps",x.setAttribute("aria-label",`${d} correct answer${d!==1?"s":""}`);for(let a=0;a<d;a++){const o=document.createElement("span");o.className="sy-end-stamp-pip",o.textContent="✓",o.setAttribute("aria-hidden","true"),x.appendChild(o)}u.appendChild(x)}i.textContent=`${h}. Score ${d} of ${p}.`;for(const x of e.elements){if(x.type!=="button")continue;const a=document.createElement("div");a.style.marginTop="16px";const o=document.createElement("button");o.className="sy-button",o.style.width="auto",o.style.height="auto",o.textContent=x.label,o.addEventListener("click",()=>{z(x.actions,n,f=>s(f,!1),r)}),a.appendChild(o),u.appendChild(a)}t.appendChild(u)}function Z(e,t,n,s,r=re,i={}){Q();const d=U();t.innerHTML="";const p=document.createElement("div");p.className="sy-card-stack";for(let o=1;o<=3;o++){const f=document.createElement("div");f.className=`sy-card-edge sy-card-edge-${o}`,p.appendChild(f)}const u=document.createElement("div");u.className="sy-card";const l=document.createElement("div");l.className="sy-ring-holes",l.setAttribute("aria-hidden","true");for(let o=0;o<2;o++){const f=document.createElement("div");f.className="sy-ring-hole",l.appendChild(f)}u.appendChild(l);const h=document.createElement("div");if(h.className="sy-rings",h.setAttribute("aria-hidden","true"),h.innerHTML=`<span class="sy-ring">${F}</span><span class="sy-ring">${F}</span>`,e.kind==="end"){K(e,u,n,s,r,d),p.appendChild(u),p.appendChild(h),t.appendChild(p);return}if(typeof i.position=="number"&&typeof i.total=="number"&&i.total>0){const o=document.createElement("div");o.className="sy-meta-chrome";const f=document.createElement("p");f.className="sy-meta",f.textContent=`Card ${i.position} of ${i.total}`,o.appendChild(f),u.appendChild(o)}const c=n.variables.score;if(typeof c=="number"){const o=document.createElement("div");o.className="sy-score-chrome",o.setAttribute("aria-label",`Score ${c}`),o.textContent=`Score ${c}`,u.appendChild(o)}const g=e.elements.filter(o=>o.type==="button"),x=e.kind==="quiz";let a=0;for(const o of e.elements){const f=document.createElement("div");switch(f.className="sy-element",ee(f,o),o.type){case"text":{const m=document.createElement("p");m.className=x||e.kind==="flash"?"sy-question":"sy-text",m.textContent=o.content,f.appendChild(m);break}case"button":{const m=te(o,x,g.length,a,n,s,r,d);f.appendChild(m),a++;break}case"image":{const m=document.createElement("img");m.setAttribute("src",o.src),m.setAttribute("alt",o.alt),m.className="sy-image",m.style.width="100%",m.style.height="100%",f.appendChild(m);break}case"field":{const m=document.createElement("span");m.className="sy-field";const v=n.variables[o.variable];m.textContent=v!==void 0?String(v):"",f.appendChild(m);break}}u.appendChild(f)}p.appendChild(u),p.appendChild(h),t.appendChild(p)}function ee(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function te(e,t,n,s,r,i,d,p){const l=t&&n>=2&&n<=4?V[s%4]:void 0,h=document.createElement("button");if(l){h.className="sy-tile",h.style.backgroundColor=l.color,h.style.color=l.textColor;const c=document.createElement("span");c.className="sy-tile-shape",c.style.color=l.textColor,J(c,l.shapePath),h.appendChild(c);const g=document.createElement("span");g.textContent=e.label,h.appendChild(g)}else h.className="sy-button",h.textContent=e.label;return h.addEventListener("click",()=>{ne(h,e,l,r,i,d,p)}),h}function ne(e,t,n,s,r,i,d){const p=t.actions.some(c=>c.type==="score"&&c.delta>0),u=e.closest(".sy-card");u&&u.querySelectorAll(".sy-tile, .sy-button").forEach(c=>{c.disabled=!0});const l=t.actions.find(c=>c.type==="goto"),h=t.actions.filter(c=>c.type!=="goto");z(h,s,se,i),n?p?(oe(e,d),t.actions.some(g=>g.type==="sound")||i("cheer"),setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},P)):(ie(e),t.actions.some(g=>g.type==="sound")||i("buzz"),setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},X)):l&&l.type==="goto"&&r(l.cardId,!1)}function oe(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function ie(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake"),e.addEventListener("animationend",()=>{const t=document.createElement("span");t.textContent=" ✗",t.style.opacity="0.4",t.style.color=y.stamp,t.style.fontSize="0.8em",t.setAttribute("aria-hidden","true"),e.appendChild(t)},{once:!0})}function re(e){}function se(e){}function ae(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#D4C9B0",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const r=window.innerWidth,i=window.innerHeight,d=Math.min(r*.9/800,i*.9/600);e.style.transform=`scale(${d})`}n();const s=new ResizeObserver(n);return s.observe(document.body),function(){s.disconnect()}}function R(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,s=n.createOscillator(),r=n.createGain();s.connect(r),r.connect(n.destination);const i=n.currentTime,d=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,i),s.frequency.linearRampToValueAtTime(880,i+d),r.gain.setValueAtTime(0,i),r.gain.linearRampToValueAtTime(.3,i+.05),r.gain.linearRampToValueAtTime(0,i+d)):(s.type="sawtooth",s.frequency.setValueAtTime(150,i),r.gain.setValueAtTime(.3,i),r.gain.linearRampToValueAtTime(0,i+d)),s.start(i),s.stop(i+d),s.onended=()=>{try{n.close()}catch(p){}}}catch(t){}}function A(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}function le(e,t){const n=G(e),s=ae(t);function r(i,d){if(d){if(n.autoNavCount++,n.autoNavCount>20){A(t);return}}else n.autoNavCount=0;const p=e.cards.find(c=>c.id===i);if(!p){A(t);return}n.currentCardId=i;const u=e.cards.filter(c=>c.kind!=="end"),l=u.findIndex(c=>c.id===i),h=l>=0?{position:l+1,total:u.length}:{};Z(p,t,n,r,R,h),z(p.actions,n,c=>r(c,!0),R)}return r(n.currentCardId,!1),function(){s(),t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){A(e);return}const s=(t=n.textContent)!=null?t:"",r=JSON.parse(s),i=D(r);if(!i.valid){A(e);return}le(i.stack,e)}catch(n){A(e)}})})();
