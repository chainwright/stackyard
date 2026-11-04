(function(){"use strict";function v(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function g(e){return typeof e=="string"}function b(e){return typeof e=="number"}function A(e){return Array.isArray(e)}function T(e){if(!v(e))return null;const t=e.type;return t==="goto"&&g(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&b(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&g(e.variable)&&(g(e.value)||b(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function L(e){if(!v(e))return null;const{type:t,id:n,x:s,y:r,w:i,h:a}=e;if(!g(n)||!b(s)||!b(r)||!b(i)||!b(a))return null;if(t==="text"&&g(e.content))return{type:"text",id:n,x:s,y:r,w:i,h:a,content:e.content};if(t==="button"&&g(e.label)&&A(e.actions)){const f=[];for(const u of e.actions){const c=T(u);if(c===null)return null;f.push(c)}return{type:"button",id:n,x:s,y:r,w:i,h:a,label:e.label,actions:f}}return t==="image"&&g(e.src)&&g(e.alt)?{type:"image",id:n,x:s,y:r,w:i,h:a,src:e.src,alt:e.alt}:t==="field"&&g(e.variable)?{type:"field",id:n,x:s,y:r,w:i,h:a,variable:e.variable}:null}function H(e){if(!v(e))return null;const{id:t,kind:n,elements:s,actions:r}=e;if(!g(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!A(s)||!A(r))return null;const i=[];for(const f of s){const u=L(f);if(u===null)return null;i.push(u)}const a=[];for(const f of r){const u=T(f);if(u===null)return null;a.push(u)}return{id:t,kind:n,elements:i,actions:a}}function O(e){if(!v(e))return null;const{id:t,title:n,theme:s,cards:r}=e;if(!g(t)||!g(n)||!v(s))return null;const{background:i,foreground:a,font:f}=s;if(!g(i)||!g(a)||!g(f)||!A(r))return null;const u=[];for(const c of r){const m=H(c);if(m===null)return null;u.push(m)}return{id:t,title:n,theme:{background:i,foreground:a,font:f},cards:u}}const F=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function E(e){return F.test(e)}function S(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function I(e){return e.elements.filter(t=>t.type==="button")}function $(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function _(e){var h;const t=[],n=new Set,s=o=>n.has(o)?!1:(n.add(o),!0);s(e.id)||t.push("duplicate-id");for(const o of e.cards){!s(o.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const l of o.elements)!s(l.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(o=>o.id));let i=!1;for(const o of e.cards){for(const l of S(o.actions))if(!r.has(l)){i=!0;break}if(i)break;for(const l of I(o)){for(const x of S(l.actions))if(!r.has(x)){i=!0;break}if(i)break}if(i)break}i&&t.push("invalid-goto"),e.cards.filter(o=>o.kind==="end").length!==1&&t.push("end-card-count");for(const o of e.cards){if(o.kind!=="quiz")continue;const l=I(o),x=l.filter($).length,w=l.filter(k=>!$(k)).length;if(x!==1||w<1){t.push("quiz-answer");break}}let f=!1;for(const o of e.cards){for(const l of o.elements)if(l.x+l.w>800||l.y+l.h>600){f=!0;break}if(f)break}f&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(o=>o.kind!=="end").length<1&&t.push("no-content-cards");let c=!1;if(E(e.id)||(c=!0),!c)for(const o of e.cards){if(!E(o.id)){c=!0;break}for(const l of o.elements)if(!E(l.id)){c=!0;break}if(c)break}c&&t.push("invalid-id");const m=new Map;for(const o of e.cards){const l=[];for(const x of o.actions)x.type==="goto"&&r.has(x.cardId)&&l.push(x.cardId);m.set(o.id,l)}const p=new Map;for(const o of e.cards)p.set(o.id,0);let d=!1;for(const o of e.cards){if(p.get(o.id)!==0||d)continue;const l=[];for(p.set(o.id,1),l.push({id:o.id,nextIdx:0});l.length>0&&!d;){const x=l[l.length-1],w=(h=m.get(x.id))!=null?h:[];if(x.nextIdx<w.length){const k=w[x.nextIdx];x.nextIdx++;const B=p.get(k);B===1?d=!0:B===0&&(p.set(k,1),l.push({id:k,nextIdx:0}))}else p.set(x.id,2),l.pop()}}return d&&t.push("goto-cycle"),t}function M(e){const t=O(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=_(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function j(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function z(e,t,n,s=G){for(const r of e)switch(r.type){case"goto":{n(r.cardId);return}case"score":{const i=t.variables.score;t.variables.score=(typeof i=="number"?i:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{s(r.sound);break}}}function G(e){}const y={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},V=[{color:y.tileA,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:y.tileB,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:y.tileC,textColor:y.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:y.tileD,textColor:y.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],X=900,D=600,P=`
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
  --text-meta:     18px;
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

/* ---- Ring holes ---- */
.sy-ring-holes {
  position: absolute;
  top: 0; left: 0;
  width: 800px;
  display: flex;
  justify-content: space-around;
  padding: 0 200px;
  pointer-events: none;
  z-index: 10;
}
.sy-ring-hole {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-white);
  border: 1px solid var(--color-rule);
  margin-top: 6px;
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
`;let R=!1;function W(){if(R)return;const e=document.createElement("style");e.textContent=P,document.head.appendChild(e),R=!0}let N=null;function Q(){if(N)return N;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),N=e,e}function U(e,t){e.innerHTML=t}function J(e){return e.cards.filter(t=>t.kind==="quiz").length}function Y(e,t,n,s,r,i){const a=typeof n.variables.score=="number"?n.variables.score:0,f=J(n.stack),u=document.createElement("div");u.className="sy-end-card";const c=e.elements.find(h=>h.type==="text"),m=c&&c.type==="text"?c.content:"Well done!",p=document.createElement("h1");p.className="sy-end-heading",p.textContent=m,u.appendChild(p);const d=document.createElement("p");if(d.className="sy-end-score",d.setAttribute("data-testid","end-score"),d.textContent=`Score ${a} of ${f}`,u.appendChild(d),a>0){const h=document.createElement("div");h.className="sy-end-stamps",h.setAttribute("aria-label",`${a} correct answer${a!==1?"s":""}`);for(let o=0;o<a;o++){const l=document.createElement("span");l.className="sy-end-stamp-pip",l.textContent="✓",l.setAttribute("aria-hidden","true"),h.appendChild(l)}u.appendChild(h)}i.textContent=`${m}. Score ${a} of ${f}.`;for(const h of e.elements){if(h.type!=="button")continue;const o=document.createElement("div");o.style.marginTop="16px";const l=document.createElement("button");l.className="sy-button",l.style.width="auto",l.style.height="auto",l.textContent=h.label,l.addEventListener("click",()=>{z(h.actions,n,x=>s(x,!1),r)}),o.appendChild(l),u.appendChild(o)}t.appendChild(u)}function K(e,t,n,s,r=ie){W();const i=Q();t.innerHTML="";const a=document.createElement("div");a.className="sy-card-stack";for(let d=1;d<=3;d++){const h=document.createElement("div");h.className=`sy-card-edge sy-card-edge-${d}`,a.appendChild(h)}const f=document.createElement("div");f.className="sy-card";const u=document.createElement("div");u.className="sy-ring-holes",u.setAttribute("aria-hidden","true");for(let d=0;d<2;d++){const h=document.createElement("div");h.className="sy-ring-hole",u.appendChild(h)}if(f.appendChild(u),e.kind==="end"){Y(e,f,n,s,r,i),a.appendChild(f),t.appendChild(a);return}const c=e.elements.filter(d=>d.type==="button"),m=e.kind==="quiz";let p=0;for(const d of e.elements){const h=document.createElement("div");switch(h.className="sy-element",Z(h,d),d.type){case"text":{const o=document.createElement("p");o.className=m||e.kind==="flash"?"sy-question":"sy-text",o.textContent=d.content,h.appendChild(o);break}case"button":{const o=ee(d,m,c.length,p,n,s,r,i);h.appendChild(o),p++;break}case"image":{const o=document.createElement("img");o.setAttribute("src",d.src),o.setAttribute("alt",d.alt),o.className="sy-image",o.style.width="100%",o.style.height="100%",h.appendChild(o);break}case"field":{const o=document.createElement("span");o.className="sy-field";const l=n.variables[d.variable];o.textContent=l!==void 0?String(l):"",h.appendChild(o);break}}f.appendChild(h)}a.appendChild(f),t.appendChild(a)}function Z(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function ee(e,t,n,s,r,i,a,f){const c=t&&n>=2&&n<=4?V[s%4]:void 0,m=document.createElement("button");if(c){m.className="sy-tile",m.style.backgroundColor=c.color,m.style.color=c.textColor;const p=document.createElement("span");p.className="sy-tile-shape",p.style.color=c.textColor,U(p,c.shapePath),m.appendChild(p);const d=document.createElement("span");d.textContent=e.label,m.appendChild(d)}else m.className="sy-button",m.textContent=e.label;return m.addEventListener("click",()=>{te(m,e,c,r,i,a,f)}),m}function te(e,t,n,s,r,i,a){const f=t.actions.some(p=>p.type==="score"&&p.delta>0),u=e.closest(".sy-card");u&&u.querySelectorAll(".sy-tile, .sy-button").forEach(p=>{p.disabled=!0});const c=t.actions.find(p=>p.type==="goto"),m=t.actions.filter(p=>p.type!=="goto");z(m,s,re,i),n?f?(ne(e,a),t.actions.some(d=>d.type==="sound")||i("cheer"),setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},X)):(oe(e),t.actions.some(d=>d.type==="sound")||i("buzz"),setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},D)):c&&c.type==="goto"&&r(c.cardId,!1)}function ne(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function oe(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake"),e.addEventListener("animationend",()=>{const t=document.createElement("span");t.textContent=" ✗",t.style.opacity="0.4",t.style.color=y.stamp,t.style.fontSize="0.8em",t.setAttribute("aria-hidden","true"),e.appendChild(t)},{once:!0})}function ie(e){}function re(e){}function se(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#D4C9B0",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const r=window.innerWidth,i=window.innerHeight,a=Math.min(r*.9/800,i*.9/600);e.style.transform=`scale(${a})`}n();const s=new ResizeObserver(n);return s.observe(document.body),function(){s.disconnect()}}function q(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,s=n.createOscillator(),r=n.createGain();s.connect(r),r.connect(n.destination);const i=n.currentTime,a=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,i),s.frequency.linearRampToValueAtTime(880,i+a),r.gain.setValueAtTime(0,i),r.gain.linearRampToValueAtTime(.3,i+.05),r.gain.linearRampToValueAtTime(0,i+a)):(s.type="sawtooth",s.frequency.setValueAtTime(150,i),r.gain.setValueAtTime(.3,i),r.gain.linearRampToValueAtTime(0,i+a)),s.start(i),s.stop(i+a),s.onended=()=>{try{n.close()}catch(f){}}}catch(t){}}function C(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{let n=function(c,m){if(m){if(u.autoNavCount++,u.autoNavCount>20){C(e);return}}else u.autoNavCount=0;const p=f.cards.find(d=>d.id===c);if(!p){C(e);return}u.currentCardId=c,K(p,e,u,n,q),z(p.actions,u,d=>n(d,!0),q)};const s=document.getElementById("stack-data");if(!s){C(e);return}const r=(t=s.textContent)!=null?t:"",i=JSON.parse(r),a=M(i);if(!a.valid){C(e);return}const f=a.stack,u=j(f);se(e),n(u.currentCardId,!1)}catch(n){C(e)}})})();
