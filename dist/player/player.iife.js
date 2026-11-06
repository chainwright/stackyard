(function(){"use strict";function T(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function k(e){return typeof e=="string"}function z(e){return typeof e=="number"}function $(e){return Array.isArray(e)}function P(e){if(!T(e))return null;const t=e.type;return t==="goto"&&k(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&z(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&k(e.variable)&&(k(e.value)||z(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function U(e){if(!T(e))return null;const{type:t,id:n,x:a,y:r,w:o,h:y}=e;if(!k(n)||!z(a)||!z(r)||!z(o)||!z(y))return null;if(t==="text"&&k(e.content))return{type:"text",id:n,x:a,y:r,w:o,h:y,content:e.content};if(t==="button"&&k(e.label)&&$(e.actions)){const d=[];for(const s of e.actions){const u=P(s);if(u===null)return null;d.push(u)}return{type:"button",id:n,x:a,y:r,w:o,h:y,label:e.label,actions:d}}return t==="image"&&k(e.src)&&k(e.alt)?{type:"image",id:n,x:a,y:r,w:o,h:y,src:e.src,alt:e.alt}:t==="field"&&k(e.variable)?{type:"field",id:n,x:a,y:r,w:o,h:y,variable:e.variable}:null}function K(e){if(!T(e))return null;const{id:t,kind:n,elements:a,actions:r}=e;if(!k(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!$(a)||!$(r))return null;const o=[];for(const d of a){const s=U(d);if(s===null)return null;o.push(s)}const y=[];for(const d of r){const s=P(d);if(s===null)return null;y.push(s)}return{id:t,kind:n,elements:o,actions:y}}function Y(e){if(!T(e))return null;const{id:t,title:n,theme:a,cards:r}=e;if(!k(t)||!k(n)||!T(a))return null;const{background:o,foreground:y,font:d}=a;if(!k(o)||!k(y)||!k(d)||!$(r))return null;const s=[];for(const u of r){const c=K(u);if(c===null)return null;s.push(c)}return{id:t,title:n,theme:{background:o,foreground:y,font:d},cards:s}}const Z=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function M(e){return Z.test(e)}function _(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function G(e){return e.elements.filter(t=>t.type==="button")}function W(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function ee(e){var g;const t=[],n=new Set,a=m=>n.has(m)?!1:(n.add(m),!0);a(e.id)||t.push("duplicate-id");for(const m of e.cards){!a(m.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const x of m.elements)!a(x.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(m=>m.id));let o=!1;for(const m of e.cards){for(const x of _(m.actions))if(!r.has(x)){o=!0;break}if(o)break;for(const x of G(m)){for(const i of _(x.actions))if(!r.has(i)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(m=>m.kind==="end").length!==1&&t.push("end-card-count");for(const m of e.cards){if(m.kind!=="quiz")continue;const x=G(m),i=x.filter(W).length,h=x.filter(l=>!W(l)).length;if(i!==1||h<1){t.push("quiz-answer");break}}let d=!1;for(const m of e.cards){for(const x of m.elements)if(x.x+x.w>800||x.y+x.h>600){d=!0;break}if(d)break}d&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(m=>m.kind!=="end").length<1&&t.push("no-content-cards");let u=!1;if(M(e.id)||(u=!0),!u)for(const m of e.cards){if(!M(m.id)){u=!0;break}for(const x of m.elements)if(!M(x.id)){u=!0;break}if(u)break}u&&t.push("invalid-id");const c=new Map;for(const m of e.cards){const x=[];for(const i of m.actions)i.type==="goto"&&r.has(i.cardId)&&x.push(i.cardId);c.set(m.id,x)}const f=new Map;for(const m of e.cards)f.set(m.id,0);let p=!1;for(const m of e.cards){if(f.get(m.id)!==0||p)continue;const x=[];for(f.set(m.id,1),x.push({id:m.id,nextIdx:0});x.length>0&&!p;){const i=x[x.length-1],h=(g=c.get(i.id))!=null?g:[];if(i.nextIdx<h.length){const l=h[i.nextIdx];i.nextIdx++;const b=f.get(l);b===1?p=!0:b===0&&(f.set(l,1),x.push({id:l,nextIdx:0}))}else f.set(i.id,2),x.pop()}}return p&&t.push("goto-cycle"),t}function te(e){const t=Y(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=ee(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function ne(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function ie(e){e.variables={score:0},e.autoNavCount=0}function L(e,t,n,a=oe){for(const r of e)switch(r.type){case"goto":{n(r.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{a(r.sound);break}}}function oe(e){}function R(e,t,n,a=.54){const r=n*a;if(t<=0||r<=0)return 1;let o=0;for(const y of e.split(`
`)){const d=y.split(/\s+/).filter(c=>c.length>0);if(d.length===0){o+=1;continue}let s=0,u=1;for(const c of d){const f=c.length*r;if(f>t){s>0&&(u+=1);const g=Math.ceil(f/t)-1;u+=g,s=f-g*t;continue}const p=s===0?f:s+r+f;p>t?(u+=1,s=f):s=p}o+=u}return Math.max(1,o)}function N(e,t){var d,s,u;const n=(d=t.step)!=null?d:2,a=(s=t.lineHeight)!=null?s:c=>Math.round(c*1.3),r=(u=t.charWidth)!=null?u:.54;let o=null;for(let c=t.maxSize;c>=t.minSize;c-=n){const f=R(e,t.w,c,r),p=a(c),g=f*p<=t.h&&(t.maxLines===void 0||f<=t.maxLines);if(o={size:c,lineHeight:p,lines:f,fits:g},g)return o}if(o!==null){const c=t.minSize,f=R(e,t.w,c,r);return{size:c,lineHeight:a(c),lines:f,fits:!1}}const y=t.minSize;return{size:y,lineHeight:a(y),lines:R(e,t.w,y,r),fits:!1}}const F=20;function ae(e){return e>=44?64:Math.round(e*1.3)}function D(e,t,n){return N(e,{w:t,h:n,maxSize:44,minSize:24,lineHeight:ae})}function se(e,t,n){return N(e,{w:t,h:n,maxSize:22,minSize:F,lineHeight:a=>Math.round(a*1.5)})}function re(e,t,n){return N(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,n-12),maxSize:32,minSize:F,lineHeight:a=>Math.round(a*1.15),maxLines:3,charWidth:.56})}function B(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}function q(e,t){return t===void 0||B(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function E(e,t,n){t.size!==n&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const j='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',w={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},le=[{color:w.tileA,textColor:w.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:w.tileB,textColor:w.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:w.tileC,textColor:w.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:w.tileD,textColor:w.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],ce=900,de=600,pe=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${w.paper};
  --color-ink:     ${w.ink};
  --color-rule:    ${w.rule};
  --color-stamp:   ${w.stamp};
  --color-tile-a:  ${w.tileA};
  --color-tile-b:  ${w.tileB};
  --color-tile-c:  ${w.tileC};
  --color-tile-d:  ${w.tileD};
  --color-white:   ${w.white};
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
/* Long labels WRAP rather than being cut off with an ellipsis ("Norsemen
   from…" in the class player — J1/J3, 5 Nov panel). The renderer fits the font
   to the tile (src/shared/fitText.ts), so up to three lines sit inside it; the
   clamp is only a last-resort guard. */
.sy-tile .sy-tile-label {
  flex: 1 1 auto;
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
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
`;let V=!1;function ue(){if(V)return;const e=document.createElement("style");e.textContent=pe,document.head.appendChild(e),V=!0}let H=null;function fe(){if(H)return H;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),H=e,e}function he(e,t){e.innerHTML=t}function me(e){return e.cards.filter(t=>t.kind==="quiz").length}function ye(e,t,n,a,r,o){var m,x;const y=typeof n.variables.score=="number"?n.variables.score:0,d=me(n.stack),s=document.createElement("div");s.className="sy-end-card";const u=e.elements.find(i=>i.type==="text"),c=u&&u.type==="text"?u.content:"Well done!",f=document.createElement("h1");f.className="sy-end-heading",f.textContent=c,s.appendChild(f);const p=document.createElement("p");if(p.className="sy-end-score",p.setAttribute("data-testid","end-score"),p.textContent=`Score ${y} of ${d}`,s.appendChild(p),d>0){const i=document.createElement("div");i.className="sy-end-stamps",i.setAttribute("aria-label",`${y} of ${d} stamp${d!==1?"s":""} earned`);const h=[-8,-5,-10,-6,-9,-4,-7];for(let l=0;l<d;l++){const b=document.createElement("span");if(l<y){b.className="sy-end-slot sy-end-slot-earned",b.textContent="✓";const v=(m=h[l%h.length])!=null?m:-8;b.style.transform=`rotate(${v}deg)`}else b.className="sy-end-slot sy-end-slot-empty";b.setAttribute("aria-hidden","true"),i.appendChild(b)}s.appendChild(i)}o.textContent=`${c}. Score ${y} of ${d}.`;const g=(x=n.stack.cards[0])==null?void 0:x.id;if(g!==void 0){const i=document.createElement("div");i.className="sy-end-again";const h=document.createElement("button");h.className="sy-button sy-end-again-btn",h.setAttribute("data-testid","play-again"),h.textContent="Play Again",h.addEventListener("click",()=>{ie(n),a(g,!1)}),i.appendChild(h),s.appendChild(i)}for(const i of e.elements){if(i.type!=="button")continue;const h=document.createElement("div");h.style.marginTop="16px";const l=document.createElement("button");l.className="sy-button",l.style.width="auto",l.style.height="auto",l.textContent=i.label,l.addEventListener("click",()=>{L(i.actions,n,b=>a(b,!1),r)}),h.appendChild(l),s.appendChild(h)}t.appendChild(s)}function xe(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function ge(e,t,n,a,r,o,y){var i,h,l,b;const d=e.elements.filter(v=>v.type==="text"),s=(h=(i=d[0])==null?void 0:i.content)!=null?h:"",u=(b=(l=d[1])==null?void 0:l.content)!=null?b:"";let c=e.elements.filter(v=>v.type==="button").map(v=>q(v,y));c.length===0&&y!==void 0&&B(e.actions)===null&&(c=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:y}]}]);const f=u.trim().length>0,p=document.createElement("div");p.className="sy-flash",f&&(p.setAttribute("role","button"),p.setAttribute("tabindex","0"),p.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(p);let g="front";const m=()=>{if(p.innerHTML="",g==="front"){const v=document.createElement("p");if(v.className="sy-flash-term",v.textContent=s,E(v,D(s,704,200),44),p.appendChild(v),f){const C=document.createElement("p");C.className="sy-flash-hint",C.textContent="Tap the card to see the answer",p.appendChild(C)}o.textContent=s}else{const v=document.createElement("p");v.className="sy-flash-term-small",v.textContent=s,E(v,N(s,{w:704,h:88,maxSize:32,minSize:24,lineHeight:I=>Math.round(I*1.3)}),32),p.appendChild(v);const C=document.createElement("p");C.className="sy-flash-back",C.textContent=u,E(C,N(u,{w:704,h:280,maxSize:26,minSize:F,lineHeight:I=>Math.round(I*1.54)}),26),p.appendChild(C);const A=document.createElement("p");A.className="sy-flash-hint",A.textContent="Tap the card to flip back",p.appendChild(A),o.textContent=u?`${s}: ${u}`:s}if(g==="back"||!f)for(const v of c){const C=document.createElement("div");C.className="sy-flash-next";const A=document.createElement("button");A.className="sy-button",A.textContent=v.label,A.addEventListener("click",I=>{I.stopPropagation(),L(v.actions,n,Se=>a(Se,!1),r)}),C.appendChild(A),p.appendChild(C)}},x=()=>{f&&(g=g==="front"?"back":"front",m(),xe()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation="card-enter 240ms ease-out"))};p.addEventListener("click",x),p.addEventListener("keydown",v=>{(v.key==="Enter"||v.key===" "||v.key==="Spacebar")&&(v.preventDefault(),x())}),m()}function be(e,t,n,a,r=Ae,o={}){ue();const y=fe();t.innerHTML="";const d=document.createElement("div");d.className="sy-card-stack";for(let i=1;i<=3;i++){const h=document.createElement("div");h.className=`sy-card-edge sy-card-edge-${i}`,d.appendChild(h)}const s=document.createElement("div");s.className="sy-card";const u=document.createElement("div");u.className="sy-ring-holes",u.setAttribute("aria-hidden","true");for(let i=0;i<2;i++){const h=document.createElement("div");h.className="sy-ring-hole",u.appendChild(h)}s.appendChild(u);const c=document.createElement("div");if(c.className="sy-rings",c.setAttribute("aria-hidden","true"),c.innerHTML=`<span class="sy-ring">${j}</span><span class="sy-ring">${j}</span>`,e.kind==="end"){ye(e,s,n,a,r,y),d.appendChild(s),d.appendChild(c),t.appendChild(d);return}if(typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const i=document.createElement("div");i.className="sy-meta-chrome";const h=document.createElement("p");h.className="sy-meta",h.textContent=`Card ${o.position} of ${o.total}`,i.appendChild(h),s.appendChild(i)}const f=n.variables.score;if(typeof f=="number"){const i=document.createElement("div");i.className="sy-score-chrome",i.setAttribute("aria-label",`Score ${f}`),i.textContent=`Score ${f}`,s.appendChild(i)}if(e.kind==="flash"){const i=e.elements.filter(b=>b.type==="text"),h=e.elements.filter(b=>b.type==="button");if(i.length>=2||h.length>=1){ge(e,s,n,a,r,y,o.nextCardId),d.appendChild(s),d.appendChild(c),t.appendChild(d);return}}const p=e.kind==="quiz",g=p?e.elements.filter(i=>i.type==="button"&&i.actions.length>0):[];let m=0,x=!1;for(const i of e.elements){const h=document.createElement("div");switch(h.className="sy-element",ve(h,i),i.type){case"text":{const l=document.createElement("p"),b=(p||e.kind==="flash")&&!x;l.className=b?"sy-question":"sy-text",b&&(x=!0),l.textContent=i.content,b?E(l,D(i.content,i.w,i.h),44):E(l,se(i.content,i.w,i.h),22),h.appendChild(l);break}case"button":{const l=p&&i.actions.length>0,b=X(q(i,o.nextCardId),l,g.length,l?m:0,n,a,r,y);h.appendChild(b),l&&m++;break}case"image":{const l=document.createElement("img");l.setAttribute("src",i.src),l.setAttribute("alt",i.alt),l.className="sy-image",l.style.width="100%",l.style.height="100%",h.appendChild(l);break}case"field":{const l=document.createElement("span");l.className="sy-field";const b=n.variables[i.variable];l.textContent=b!==void 0?String(b):"",h.appendChild(l);break}}s.appendChild(h)}if(o.nextCardId!==void 0&&B(e.actions)===null&&!e.elements.some(i=>i.type==="button")){const i=document.createElement("div");i.className="sy-element";const h={x:408,y:496,w:344,h:72};i.style.left=`${h.x}px`,i.style.top=`${h.y}px`,i.style.width=`${h.w}px`,i.style.height=`${h.h}px`;const l=q({type:"button",id:"sy-next",...h,label:"Next Card",actions:[]},o.nextCardId);i.appendChild(X(l,!1,0,0,n,a,r,y)),s.appendChild(i)}d.appendChild(s),d.appendChild(c),t.appendChild(d)}function ve(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function X(e,t,n,a,r,o,y,d){const s=t?le[a%4]:void 0,u=document.createElement("button");if(s){u.className="sy-tile",u.style.backgroundColor=s.color,u.style.color=s.textColor,e.actions.some(p=>p.type==="score"&&p.delta>0)&&u.setAttribute("data-correct","true");const c=document.createElement("span");c.className="sy-tile-shape",c.style.color=s.textColor,he(c,s.shapePath),u.appendChild(c);const f=document.createElement("span");f.className="sy-tile-label",f.textContent=e.label,E(f,re(e.label,e.w,e.h),32),u.appendChild(f)}else u.className="sy-button",u.textContent=e.label,E(u,N(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:F,lineHeight:c=>Math.round(c*1.15),charWidth:.56}),32);return u.addEventListener("click",()=>{we(u,e,s,r,o,y,d)}),u}function we(e,t,n,a,r,o,y){const d=t.actions.some(p=>p.type==="score"&&p.delta>0),s=e.closest(".sy-card"),u=t.actions.some(p=>p.type==="goto");s&&(n!==void 0||u)&&s.querySelectorAll(".sy-tile, .sy-button").forEach(p=>{p.disabled=!0});const c=t.actions.find(p=>p.type==="goto"),f=t.actions.filter(p=>p.type!=="goto");if(L(f,a,Ee,o),n)if(d)ke(e,y),t.actions.some(g=>g.type==="sound")||o("cheer"),setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},ce);else{if(Ce(e),t.actions.some(g=>g.type==="sound")||o("buzz"),s){const g=s.querySelector('.sy-tile[data-correct="true"]');g&&g!==e&&g.classList.add("sy-tile-reveal")}setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},de)}else c&&c.type==="goto"&&r(c.cardId,!1)}function ke(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function Ce(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function Ae(e){}function Ee(e){}function ze(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const r=window.innerWidth,o=window.innerHeight,y=Math.min(r*.9/800,o*.9/600);e.style.transform=`scale(${y})`}n();const a=new ResizeObserver(n);return a.observe(document.body),function(){a.disconnect()}}function J(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,a=n.createOscillator(),r=n.createGain();a.connect(r),r.connect(n.destination);const o=n.currentTime,y=.5;e==="cheer"?(a.type="triangle",a.frequency.setValueAtTime(440,o),a.frequency.linearRampToValueAtTime(880,o+y),r.gain.setValueAtTime(0,o),r.gain.linearRampToValueAtTime(.3,o+.05),r.gain.linearRampToValueAtTime(0,o+y)):(a.type="sawtooth",a.frequency.setValueAtTime(150,o),r.gain.setValueAtTime(.3,o),r.gain.linearRampToValueAtTime(0,o+y)),a.start(o),a.stop(o+y),a.onended=()=>{try{n.close()}catch(d){}}}catch(t){}}function S(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const O=240;function Q(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function Ne(e,t,n={}){var c;const a=ne(e);n.startCardId!==void 0&&e.cards.some(f=>f.id===n.startCardId)&&(a.currentCardId=n.startCardId);const o=((c=n.scaler)!=null?c:ze)(t);t.style.perspective="1200px";const y=n.flip!==!1;let d=null;function s(f,p){var h;const g=e.cards.find(l=>l.id===f);if(!g){S(t);return}a.currentCardId=f;const m=e.cards.findIndex(l=>l.id===f),x=m>=0&&g.kind!=="end"?(h=e.cards[m+1])!=null?h:e.cards.find(l=>l.kind==="end"):void 0,i=m>=0?{position:m+1,total:e.cards.length,...x!==void 0&&x.id!==g.id?{nextCardId:x.id}:{}}:{};if(be(g,t,a,u,J,i),y&&!Q()){const l=t.querySelector(".sy-card");l&&(l.style.transformOrigin="top center",l.style.animation=`card-enter ${O}ms ease-out`)}L(g.actions,a,l=>u(l,!0),J)}function u(f,p){if(p){if(a.autoNavCount++,a.autoNavCount>20){S(t);return}}else a.autoNavCount=0;if(!e.cards.some(m=>m.id===f)){S(t);return}const g=t.querySelector(".sy-card");y&&!p&&!Q()&&g?(g.style.transformOrigin="top center",g.style.animation=`card-exit ${O}ms ease-out forwards`,d!==null&&clearTimeout(d),d=setTimeout(()=>{d=null,s(f)},O)):s(f)}return s(a.currentCardId),function(){d!==null&&(clearTimeout(d),d=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){S(e);return}const a=(t=n.textContent)!=null?t:"",r=JSON.parse(a),o=te(r);if(!o.valid){S(e);return}Ne(o.stack,e)}catch(n){S(e)}})})();
