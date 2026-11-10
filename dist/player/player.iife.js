(function(){"use strict";function R(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function N(e){return typeof e=="string"}function L(e){return typeof e=="number"}function F(e){return Array.isArray(e)}function K(e){if(!R(e))return null;const t=e.type;return t==="goto"&&N(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&L(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&N(e.variable)&&(N(e.value)||L(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function fe(e){if(!R(e))return null;const{type:t,id:i,x:s,y:r,w:o,h}=e;if(!N(i)||!L(s)||!L(r)||!L(o)||!L(h))return null;if(t==="text"&&N(e.content))return{type:"text",id:i,x:s,y:r,w:o,h,content:e.content};if(t==="button"&&N(e.label)&&F(e.actions)){const d=[];for(const a of e.actions){const y=K(a);if(y===null)return null;d.push(y)}return{type:"button",id:i,x:s,y:r,w:o,h,label:e.label,actions:d}}return t==="image"&&N(e.src)&&N(e.alt)?{type:"image",id:i,x:s,y:r,w:o,h,src:e.src,alt:e.alt}:t==="field"&&N(e.variable)?{type:"field",id:i,x:s,y:r,w:o,h,variable:e.variable}:null}function he(e){if(!R(e))return null;const{id:t,kind:i,elements:s,actions:r}=e;if(!N(t)||i!=="quiz"&&i!=="flash"&&i!=="story"&&i!=="end"||!F(s)||!F(r))return null;const o=[];for(const d of s){const a=fe(d);if(a===null)return null;o.push(a)}const h=[];for(const d of r){const a=K(d);if(a===null)return null;h.push(a)}return{id:t,kind:i,elements:o,actions:h}}function me(e){if(!R(e))return null;const{id:t,title:i,theme:s,cards:r}=e;if(!N(t)||!N(i)||!R(s))return null;const{background:o,foreground:h,font:d}=s;if(!N(o)||!N(h)||!N(d)||!F(r))return null;const a=[];for(const y of r){const c=he(y);if(c===null)return null;a.push(c)}return{id:t,title:i,theme:{background:o,foreground:h,font:d},cards:a}}const ye=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function H(e){return ye.test(e)}function V(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function U(e){return e.elements.filter(t=>t.type==="button")}function Q(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function ge(e){var b;const t=[],i=new Set,s=m=>i.has(m)?!1:(i.add(m),!0);s(e.id)||t.push("duplicate-id");for(const m of e.cards){!s(m.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const p of m.elements)!s(p.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(m=>m.id));let o=!1;for(const m of e.cards){for(const p of V(m.actions))if(!r.has(p)){o=!0;break}if(o)break;for(const p of U(m)){for(const v of V(p.actions))if(!r.has(v)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(m=>m.kind==="end").length!==1&&t.push("end-card-count");for(const m of e.cards){if(m.kind!=="quiz")continue;const p=U(m),v=p.filter(Q).length,A=p.filter(k=>!Q(k)).length;if(v!==1||A<1){t.push("quiz-answer");break}}let d=!1;for(const m of e.cards){for(const p of m.elements)if(p.x+p.w>800||p.y+p.h>600){d=!0;break}if(d)break}d&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(m=>m.kind!=="end").length<1&&t.push("no-content-cards");let y=!1;if(H(e.id)||(y=!0),!y)for(const m of e.cards){if(!H(m.id)){y=!0;break}for(const p of m.elements)if(!H(p.id)){y=!0;break}if(y)break}y&&t.push("invalid-id");const c=new Map;for(const m of e.cards){const p=[];for(const v of m.actions)v.type==="goto"&&r.has(v.cardId)&&p.push(v.cardId);c.set(m.id,p)}const l=new Map;for(const m of e.cards)l.set(m.id,0);let u=!1;for(const m of e.cards){if(l.get(m.id)!==0||u)continue;const p=[];for(l.set(m.id,1),p.push({id:m.id,nextIdx:0});p.length>0&&!u;){const v=p[p.length-1],A=(b=c.get(v.id))!=null?b:[];if(v.nextIdx<A.length){const k=A[v.nextIdx];v.nextIdx++;const S=l.get(k);S===1?u=!0:S===0&&(l.set(k,1),p.push({id:k,nextIdx:0}))}else l.set(v.id,2),p.pop()}}return u&&t.push("goto-cycle"),t}function xe(e){const t=me(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const i=ge(t);return i.length>0?{valid:!1,errors:i}:{valid:!0,stack:t}}function be(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function ve(e){e.variables={score:0},e.autoNavCount=0}function q(e,t,i,s=ke){for(const r of e)switch(r.type){case"goto":{i(r.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{s(r.sound);break}}}function ke(e){}function D(e,t,i,s=.54){const r=i*s;if(t<=0||r<=0)return 1;let o=0;for(const h of e.split(`
`)){const d=h.split(/\s+/).filter(c=>c.length>0);if(d.length===0){o+=1;continue}let a=0,y=1;for(const c of d){const l=c.length*r;if(l>t){a>0&&(y+=1);const b=Math.ceil(l/t)-1;y+=b,a=l-b*t;continue}const u=a===0?l:a+r+l;u>t?(y+=1,a=l):a=u}o+=y}return Math.max(1,o)}function $(e,t){var d,a,y;const i=(d=t.step)!=null?d:2,s=(a=t.lineHeight)!=null?a:c=>Math.round(c*1.3),r=(y=t.charWidth)!=null?y:.54;let o=null;for(let c=t.maxSize;c>=t.minSize;c-=i){const l=D(e,t.w,c,r),u=s(c),b=l*u<=t.h&&(t.maxLines===void 0||l<=t.maxLines);if(o={size:c,lineHeight:u,lines:l,fits:b},b)return o}if(o!==null){const c=t.minSize,l=D(e,t.w,c,r);return{size:c,lineHeight:s(c),lines:l,fits:!1}}const h=t.minSize;return{size:h,lineHeight:s(h),lines:D(e,t.w,h,r),fits:!1}}const B=20;function we(e){return e>=44?64:Math.round(e*1.3)}function Y(e,t,i){return $(e,{w:t,h:i,maxSize:44,minSize:24,lineHeight:we})}const J=30;function Z(e,t,i,s=22){return $(e,{w:t,h:i,maxSize:s,minSize:B,lineHeight:r=>Math.round(r*1.5)})}function Ce(e,t,i){return $(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,i-12),maxSize:32,minSize:B,lineHeight:s=>Math.round(s*1.15),maxLines:3,charWidth:.56})}function O(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}const Ae=e=>e.toLowerCase().replace(/[^a-z ]+/g," ").replace(/\s+/g," ").trim();function Se(e){return/^(well done|well done you finished|well done you have finished|great job|you did it)$/.test(Ae(e))}const Ee="Picture: Stackyard pictogram";function P(e){return e.trim()===Ee}function G(e,t){return t===void 0||O(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function T(e,t,i){t.size!==i&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const ee='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',E={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},Ne=[{color:E.tileA,textColor:E.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:E.tileB,textColor:E.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:E.tileC,textColor:E.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:E.tileD,textColor:E.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],ze=["Triangle","Diamond","Circle","Square"];function Te(e,t){return`${ze[e%4]}: ${t}`}const Ie=900,Le=600,$e=180,te=360,Me=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${E.paper};
  --color-ink:     ${E.ink};
  --color-rule:    ${E.rule};
  --color-stamp:   ${E.stamp};
  --color-tile-a:  ${E.tileA};
  --color-tile-b:  ${E.tileB};
  --color-tile-c:  ${E.tileC};
  --color-tile-d:  ${E.tileD};
  --color-white:   ${E.white};
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Story body: bigger, and vertically centred in its box (TASK-27i). A story
   card is the most impressive thing the generator writes, and at 22 px in a tall
   box it read as a two-line note on a blank page. ---- */
.sy-story {
  font-size: 30px;
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
  height: 100%;
  display: flex;
  align-items: center;
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
  z-index: 2;
}

/* ---- Meta text (Card N of M) ---- */
.sy-meta {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Field span ---- */
.sy-field {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
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
/* The earned ink stamp sits in the GUTTER above the tile, its bottom edge on the
   tile's top edge, over the paper — never over the answer text (design-system
   Rubber stamp feedback; TASK-27a). The old stamp (30 px type, top -34px, ~50 px
   tall, -8deg) reached ~18 px into the tile, and a label that wraps to two or
   three lines starts only ~10 px below the tile's top, so CORRECT struck through
   the first line of every wrapped right answer. This one is ~0.85 scale (24 px
   type, line-height 1 => 36 px tall) and the quiz template leaves a 48 px gutter
   above each row of tiles (src/shared/layout.ts), so it fits with room to spare.
   scripts/check-text-fit.ts clicks right and wrong tiles on a card with four long
   answers and asserts the stamp's rectangle never meets the label text. It is a
   transparent ink stamp (mix-blend-mode: multiply), not a paper sticker, so the
   stamp red sits on the 4.67:1 paper pairing. */
.sy-stamp {
  position: absolute;
  top: -38px;
  left: 64px;
  right: auto;
  bottom: auto;
  transform: rotate(-4deg) scale(1);
  color: var(--color-stamp);
  font-size: 24px;
  line-height: 1;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 3px 9px;
  opacity: 0.92;
  pointer-events: none;
  white-space: nowrap;
  z-index: 20;
}

/* ---- Wrong-answer ✗ stamp ---- */
/* After the shake, a boxed ✗ lands at FULL strength (not a faint mark) in the same
   gutter, same placement as CORRECT, so it reads on the 4.67:1 paper pairing on a
   washed-out projector (design-system). */
.sy-wrong-stamp {
  position: absolute;
  top: -36px;
  left: 64px;
  transform: rotate(-4deg);
  color: var(--color-stamp);
  font-size: 28px;
  line-height: 1;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 2px 10px;
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
.sy-end-body {
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
  font-size: 22px;
  line-height: 1.4;
  max-width: 680px;
  color: var(--color-ink);
}
/* With a longer message the end card tightens so everything still fits 600px. */
.sy-end-has-body { gap: 12px; padding: 36px 60px; }
.sy-end-has-body .sy-end-heading { font-size: 36px; }
.sy-end-has-body .sy-end-score { font-size: 40px; }
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
  0%   { transform: rotate(-4deg) scale(1.4); opacity: 0; }
  60%  { transform: rotate(-4deg) scale(0.92); opacity: 1; }
  80%  { transform: rotate(-4deg) scale(1.04); opacity: 1; }
  100% { transform: rotate(-4deg) scale(1.0);  opacity: 1; }
}

@keyframes tile-shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-6px); }
  40%  { transform: translateX(6px); }
  60%  { transform: translateX(-6px); }
  80%  { transform: translateX(6px); }
  100% { transform: translateX(0); }
}

/* The card turns on its top (ring) edge like a page of a notepad. It stays
   OPAQUE the whole turn — no opacity ramp, which read as a fade — and a shadow
   sweeps under it as it lifts and settles, so it has weight (TASK-28g). */
@keyframes card-exit {
  from { transform: rotateX(0deg);   box-shadow: 0 2px 0 rgba(30,42,71,.10); }
  to   { transform: rotateX(-90deg); box-shadow: 0 16px 20px -6px rgba(30,42,71,.45); }
}

@keyframes card-enter {
  0%   { transform: rotateX(90deg);  box-shadow: 0 16px 20px -6px rgba(30,42,71,.45); }
  70%  { transform: rotateX(-5deg);  box-shadow: 0 8px 12px -6px rgba(30,42,71,.30); }
  100% { transform: rotateX(0deg);   box-shadow: 0 2px 0 rgba(30,42,71,.10); }
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
  /* A CLEAR highlight for the back of a projected room (J2 #13): a thick ink
     frame plus a "Right answer" tab in the gutter above the tile, not a 3 px
     outline nobody can see. Still ink, never stamp red. */
  outline: 6px solid var(--color-ink);
  outline-offset: -2px;
}
.sy-reveal-mark {
  position: absolute;
  top: -32px;
  right: 12px;
  background: var(--color-ink);
  color: var(--color-white);
  font-size: 20px;
  line-height: 1;
  font-family: 'Stackyard Digits', 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 19;
}

/* Reduced-motion: replace animations with instant opacity cross-fade */
@media (prefers-reduced-motion: reduce) {
  .sy-stamp-animate { animation: none; opacity: 0.92; }
  .sy-tile-shake    { animation: none; }
  .sy-card-exit, .sy-card-enter { animation: none; opacity: 1; transition: opacity 100ms; }
}

/* ---- Aria-live region (visually hidden) ---- */
/* TASK-33d: the card itself takes focus on a card change (so a screen reader
   reads "Card N of M" and the question); it is not a control, so no ring. Tab
   moves on to the card's first choice, which has the ink ring. */
.sy-card:focus { outline: none; }
/* TASK-33d4: one-switch scanning — the highlighted choice gets a heavier ink ring. */
.sy-scanning .sy-scan-focus { outline: 5px solid var(--color-ink) !important; outline-offset: 3px !important; }
.sy-scan-bar {
  position: fixed; bottom: 12px; left: 12px; z-index: 60;
  display: flex; gap: 8px; align-items: center;
  font-family: 'Stackyard Digits', 'Stackyard Reading', system-ui, sans-serif; font-size: 18px;
}
.sy-scan-bar button, .sy-scan-bar select {
  font: inherit; color: #FBF8F1; background: #1E2A47; border: 0;
  border-radius: 10px; min-height: 44px; padding: 8px 14px; cursor: pointer;
}
.sy-scan-bar button[aria-pressed="true"] { outline: 3px solid #FBF8F1; outline-offset: -6px; }
.sy-scan-bar button:focus-visible, .sy-scan-bar select:focus-visible { outline: 3px solid #1E2A47; outline-offset: 2px; box-shadow: 0 0 0 2px #FBF8F1; }
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
`;let ne=!1;function Re(){if(ne)return;const e=document.createElement("style");e.textContent=Me,document.head.appendChild(e),ne=!0}let I=null;function ie(){if(I&&I.isConnected)return I;if(I)return document.body.appendChild(I),I;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),I=e,e}function Fe(e,t){e.innerHTML=t}function oe(e){return e.cards.filter(t=>t.kind==="quiz").length}function qe(e,t,i,s,r,o){var v,A,k,S;const h=typeof i.variables.score=="number"?i.variables.score:0,d=oe(i.stack),a=document.createElement("div");a.className="sy-end-card";const y=e.elements.filter(g=>g.type==="text"),c=y[0];let l=c?c.content:"Well done!";d>0&&h===0&&Se(l)&&(l="You finished!");const u=document.createElement("h1");u.className="sy-end-heading",u.textContent=l,a.appendChild(u);const b=(A=(v=y[1])==null?void 0:v.content.trim())!=null?A:"";if(b.length>0){a.classList.add("sy-end-has-body");const g=document.createElement("p");g.className="sy-end-body",g.textContent=b,a.appendChild(g)}if(d>0){const g=document.createElement("p");g.className="sy-end-score",g.setAttribute("data-testid","end-score"),g.textContent=`Score ${h} of ${d}`,a.appendChild(g)}if(d>0){const g=document.createElement("div");g.className="sy-end-stamps",g.setAttribute("role","img"),g.setAttribute("aria-label",`${h} of ${d} stamp${d!==1?"s":""} earned`);const C=[-8,-5,-10,-6,-9,-4,-7];for(let n=0;n<d;n++){const f=document.createElement("span");if(n<h){f.className="sy-end-slot sy-end-slot-earned",f.textContent="✓";const x=(k=C[n%C.length])!=null?k:-8;f.style.transform=`rotate(${x}deg)`}else f.className="sy-end-slot sy-end-slot-empty";f.setAttribute("aria-hidden","true"),g.appendChild(f)}a.appendChild(g)}const m=l.trim().replace(/[.!?…]+$/,"");o.textContent=d>0?`${m}. Score ${h} of ${d}.`:`${m}.`,t.setAttribute("aria-label",d>0?`${m}. Score ${h} of ${d}`:m);const p=(S=i.stack.cards[0])==null?void 0:S.id;if(p!==void 0){const g=document.createElement("div");g.className="sy-end-again";const C=document.createElement("button");C.className="sy-button sy-end-again-btn",C.setAttribute("data-testid","play-again"),C.textContent="Play Again",C.addEventListener("click",()=>{ve(i),s(p,!1)}),g.appendChild(C),a.appendChild(g)}for(const g of e.elements){if(g.type!=="button")continue;const C=document.createElement("div");C.style.marginTop="16px";const n=document.createElement("button");n.className="sy-button",n.style.width="auto",n.style.height="auto",n.textContent=g.label,n.addEventListener("click",()=>{q(g.actions,i,f=>s(f,!1),r)}),C.appendChild(n),a.appendChild(C)}t.appendChild(a)}function Be(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function _e(e,t,i,s,r,o,h){var k,S,g,C;const d=e.elements.filter(n=>n.type==="text").filter(n=>!P(n.content)),a=(S=(k=d[0])==null?void 0:k.content)!=null?S:"",y=(C=(g=d[1])==null?void 0:g.content)!=null?C:"";let c=e.elements.filter(n=>n.type==="button").map(n=>G(n,h));c.length===0&&h!==void 0&&O(e.actions)===null&&(c=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:h}]}]);const l=y.trim().length>0,u=document.createElement("div");u.className="sy-flash",l&&(u.setAttribute("role","button"),u.setAttribute("tabindex","0"),u.setAttribute("aria-expanded","false")),t.appendChild(u);const b=document.createElement("div");b.className="sy-flash-next-host",t.appendChild(b);const m=e.elements.filter(n=>n.type==="image");for(const n of m){const f=document.createElement("div");f.className="sy-element",f.setAttribute("data-element-id",n.id),se(f,n),f.style.pointerEvents="none";const x=document.createElement("img");x.setAttribute("src",n.src),x.setAttribute("alt",n.alt),x.className="sy-image",x.style.width="100%",x.style.height="100%",f.appendChild(x),t.appendChild(f)}let p="front";const v=()=>{if(u.innerHTML="",b.innerHTML="",l&&u.setAttribute("aria-expanded",p==="back"?"true":"false"),u.classList.toggle("sy-flash-back-side",p==="back"),p==="front"){const n=document.createElement("p");if(n.className="sy-flash-term",n.textContent=a,T(n,Y(a,704,200),44),u.appendChild(n),l){const f=document.createElement("p");f.className="sy-flash-hint",f.textContent="Tap the card to see the answer",u.appendChild(f)}o.textContent=a}else{const n=document.createElement("p");n.className="sy-flash-term-small",n.textContent=a,T(n,$(a,{w:704,h:88,maxSize:32,minSize:24,lineHeight:w=>Math.round(w*1.3)}),32),u.appendChild(n);const f=document.createElement("p");f.className="sy-flash-back",f.textContent=y,T(f,$(y,{w:704,h:280,maxSize:26,minSize:B,lineHeight:w=>Math.round(w*1.54)}),26),u.appendChild(f);const x=document.createElement("p");x.className="sy-flash-hint",x.textContent="Tap the card to flip back",u.appendChild(x),o.textContent=y?`${a}: ${y}`:a}if(p==="back"||!l)for(const n of c){const f=document.createElement("div");f.className="sy-flash-next";const x=document.createElement("button");x.className="sy-button",x.textContent=n.label,x.addEventListener("click",w=>{w.stopPropagation(),q(n.actions,i,z=>s(z,!1),r)}),f.appendChild(x),b.appendChild(f)}},A=()=>{l&&(p=p==="front"?"back":"front",v(),Be()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation=`card-enter ${te}ms ease-out`))};u.addEventListener("click",A),u.addEventListener("keydown",n=>{(n.key==="Enter"||n.key===" "||n.key==="Spacebar")&&(n.preventDefault(),A())}),v()}function He(e,t,i,s,r=je,o={}){Re();const h=ie();t.innerHTML="";const d=document.createElement("div");d.className="sy-card-stack";for(let n=1;n<=3;n++){const f=document.createElement("div");f.className=`sy-card-edge sy-card-edge-${n}`,d.appendChild(f)}const a=document.createElement("div");if(a.className="sy-card",a.setAttribute("role","group"),a.setAttribute("tabindex","-1"),e.kind!=="end"){const n=e.elements.find(z=>z.type==="text"&&!P(z.content)),f=n&&n.type==="text"?n.content.trim():"",w=[typeof o.position=="number"&&typeof o.total=="number"&&o.total>0?`Card ${o.position} of ${o.total}`:"",f].filter(z=>z.length>0).join(": ");w.length>0&&a.setAttribute("aria-label",w)}const y=document.createElement("div");y.className="sy-ring-holes",y.setAttribute("aria-hidden","true");for(let n=0;n<2;n++){const f=document.createElement("div");f.className="sy-ring-hole",y.appendChild(f)}a.appendChild(y);const c=document.createElement("div");if(c.className="sy-rings",c.setAttribute("aria-hidden","true"),c.innerHTML=`<span class="sy-ring">${ee}</span><span class="sy-ring">${ee}</span>`,e.kind==="end"){qe(e,a,i,s,r,h),d.appendChild(a),d.appendChild(c),t.appendChild(d);return}const l=document.createElement("h1");if(l.className="sy-sr-only sy-deck-title",l.textContent=i.stack.title,t.appendChild(l),typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const n=document.createElement("div");n.className="sy-meta-chrome";const f=document.createElement("p");f.className="sy-meta",f.textContent=`Card ${o.position} of ${o.total}`,n.appendChild(f),a.appendChild(n)}const u=i.variables.score,b=i.variables._answered,m=oe(i.stack)>0,p=typeof b=="number"&&b>0||typeof u=="number"&&u>0;if(typeof u=="number"&&m&&p){const n=document.createElement("div");n.className="sy-score-chrome",n.textContent=`Score ${u}`,a.appendChild(n)}if(e.kind==="flash"){const n=e.elements.filter(w=>w.type==="text"&&!P(w.content)),f=e.elements.filter(w=>w.type==="button");if(n.length>=2||f.length>=1){_e(e,a,i,s,r,h,o.nextCardId),d.appendChild(a),d.appendChild(c),t.appendChild(d);return}}const v=e.kind==="quiz",A=v?e.elements.filter(n=>n.type==="button"&&n.actions.length>0):[];let k=0;const S=De(e.elements.filter(n=>n.type==="button"&&!(v&&n.actions.length>0)));let g=!1,C=!1;for(const n of e.elements){const f=document.createElement("div");switch(f.className="sy-element",f.setAttribute("data-element-id",n.id),se(f,n),n.type){case"text":{const x=document.createElement("p"),w=(v||e.kind==="flash")&&!g,z=e.kind==="story"&&!C;x.className=w?"sy-question":z?"sy-story":"sy-text",w&&(g=!0),z&&(C=!0),x.textContent=n.content,w?T(x,Y(n.content,n.w,n.h),44):z?T(x,Z(n.content,n.w,n.h,J),J):T(x,Z(n.content,n.w,n.h),22),f.appendChild(x);break}case"button":{const x=v&&n.actions.length>0,w=re(G(n,o.nextCardId),x,A.length,x?k:0,i,s,r,h,x?void 0:S);f.appendChild(w),x&&k++;break}case"image":{const x=document.createElement("img");x.setAttribute("src",n.src),x.setAttribute("alt",n.alt),x.className="sy-image",x.style.width="100%",x.style.height="100%",f.appendChild(x);break}case"field":{const x=document.createElement("span");x.className="sy-field";const w=i.variables[n.variable];x.textContent=w!==void 0?String(w):"",f.appendChild(x);break}}a.appendChild(f)}if(o.nextCardId!==void 0&&O(e.actions)===null&&!e.elements.some(n=>n.type==="button")){const n=document.createElement("div");n.className="sy-element";const f={x:408,y:496,w:344,h:72};n.style.left=`${f.x}px`,n.style.top=`${f.y}px`,n.style.width=`${f.w}px`,n.style.height=`${f.h}px`;const x=G({type:"button",id:"sy-next",...f,label:"Next Card",actions:[]},o.nextCardId);n.appendChild(re(x,!1,0,0,i,s,r,h)),a.appendChild(n)}d.appendChild(a),d.appendChild(c),t.appendChild(d)}function se(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function ae(e){return $(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:B,lineHeight:t=>Math.round(t*1.15),charWidth:.56})}function De(e){if(!(e.length<2))return e.map(ae).reduce((t,i)=>i.size<t.size?i:t)}function re(e,t,i,s,r,o,h,d,a){const y=t?Ne[s%4]:void 0,c=document.createElement("button");if(y){c.className="sy-tile",c.style.backgroundColor=y.color,c.style.color=y.textColor,e.actions.some(b=>b.type==="score"&&b.delta>0)&&c.setAttribute("data-correct","true");const l=document.createElement("span");l.className="sy-tile-shape",l.style.color=y.textColor,Fe(l,y.shapePath),c.appendChild(l);const u=document.createElement("span");u.className="sy-tile-label",u.textContent=e.label,T(u,Ce(e.label,e.w,e.h),32),c.appendChild(u),c.setAttribute("aria-label",Te(s,e.label))}else c.className="sy-button",c.textContent=e.label,T(c,a!=null?a:ae(e),32);return c.addEventListener("click",()=>{Oe(c,e,y,r,o,h,d)}),c}function Oe(e,t,i,s,r,o,h){var u,b,m;const d=t.actions.some(p=>p.type==="score"&&p.delta>0),a=e.closest(".sy-card"),y=t.actions.some(p=>p.type==="goto");a&&(i!==void 0||y)&&a.querySelectorAll(".sy-tile, .sy-button").forEach(p=>{p.disabled=!0});const c=t.actions.find(p=>p.type==="goto"),l=t.actions.filter(p=>p.type!=="goto");if(t.actions.some(p=>p.type==="score")){const p=s.variables._answered;s.variables._answered=(typeof p=="number"?p:0)+1}if(q(l,s,Xe,o),i)if(d)Pe(e,h),t.actions.some(v=>v.type==="sound")||o("cheer"),setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},Ie);else{We(e),t.actions.some(k=>k.type==="sound")||o("buzz");const v=a==null?void 0:a.querySelector('.sy-tile[data-correct="true"]'),A=(m=(b=(u=v==null?void 0:v.querySelector(".sy-tile-label"))==null?void 0:u.textContent)==null?void 0:b.trim())!=null?m:"";if(W(h,A.length>0?`Not quite — the right answer was ${A}.`:"Not quite."),a){const k=a.querySelector('.sy-tile[data-correct="true"]');if(k&&k!==e&&(k.classList.add("sy-tile-reveal"),!k.querySelector(".sy-reveal-mark"))){const S=document.createElement("span");S.className="sy-reveal-mark",S.textContent="✓ Right answer",S.setAttribute("aria-hidden","true"),k.appendChild(S)}}setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},Le)}else c&&c.type==="goto"&&r(c.cardId,!1)}function Pe(e,t){const i=document.createElement("span");i.className="sy-stamp sy-stamp-animate",i.textContent="CORRECT ✓",i.setAttribute("aria-hidden","true"),e.appendChild(i),W(t,"Correct")}function W(e,t){e.textContent="",requestAnimationFrame(()=>{e.textContent=t})}function Ge(){return ie()}function We(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const i=document.createElement("span");i.className="sy-wrong-stamp",i.textContent="✗",i.setAttribute("aria-hidden","true"),e.appendChild(i)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function je(e){}function Xe(e){}function Ke(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function i(){const r=window.innerWidth,o=window.innerHeight,h=Math.min(r*.9/800,o*.9/600);e.style.transform=`scale(${h})`}i();const s=new ResizeObserver(i);return s.observe(document.body),function(){s.disconnect()}}function le(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const i=new t,s=i.createOscillator(),r=i.createGain();s.connect(r),r.connect(i.destination);const o=i.currentTime,h=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,o),s.frequency.linearRampToValueAtTime(880,o+h),r.gain.setValueAtTime(0,o),r.gain.linearRampToValueAtTime(.3,o+.05),r.gain.linearRampToValueAtTime(0,o+h)):(s.type="sawtooth",s.frequency.setValueAtTime(150,o),r.gain.setValueAtTime(.3,o),r.gain.linearRampToValueAtTime(0,o+h)),s.start(o),s.stop(o+h),s.onended=()=>{try{i.close()}catch(d){}}}catch(t){}}function M(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const j="stackyard:scan",ce="stackyard:scan-ms",Ve=1500,Ue=1e3,Qe=4e3;function _(){try{return typeof sessionStorage!="undefined"?sessionStorage:null}catch(e){return null}}function X(){var t,i;const e=Number((i=(t=_())==null?void 0:t.getItem(ce))!=null?i:"");return!Number.isFinite(e)||e<=0?Ve:Math.min(Qe,Math.max(Ue,Math.round(e)))}function Ye(e){return Array.from(e.querySelectorAll(".sy-card .sy-tile, .sy-card .sy-flash[role='button'], .sy-card .sy-button")).filter(t=>!t.disabled)}function de(e){const t=Ye(e);for(const r of Array.from(e.querySelectorAll(".sy-scan-focus")))r.classList.remove("sy-scan-focus");if(t.length===0)return null;const i=t.indexOf(document.activeElement),s=t[(i+1)%t.length];return s.classList.add("sy-scan-focus"),s.focus({preventScroll:!0}),s}function Je(e){return e instanceof HTMLElement?e.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName):!1}function Ze(e,t=document.body){var c;let i=null;const s=document.createElement("div");s.className="sy-scan-bar",s.setAttribute("role","region"),s.setAttribute("aria-label","Switch scanning");const r=document.createElement("button");r.type="button",r.className="sy-scan-toggle",r.textContent="Scan",r.setAttribute("aria-pressed","false"),r.title="Scan: the highlight moves across the choices; press Space or Enter to pick (S key)";const o=document.createElement("select");o.className="sy-scan-speed",o.setAttribute("aria-label","Scan speed");for(const l of[1e3,1500,2e3,3e3,4e3]){const u=document.createElement("option");u.value=String(l),u.textContent=`${l/1e3} s`,o.appendChild(u)}s.appendChild(r),s.appendChild(o),t.appendChild(s);const h=()=>r.getAttribute("aria-pressed")==="true",d=()=>{i!==null&&clearInterval(i),i=h()?setInterval(()=>de(e),X()):null},a=(l,u)=>{r.setAttribute("aria-pressed",l?"true":"false"),document.documentElement.classList.toggle("sy-scanning",l),o.hidden=!l,o.value=String(X());const b=_();try{l?b==null||b.setItem(j,"on"):b==null||b.removeItem(j)}catch(m){}if(!l)for(const m of Array.from(e.querySelectorAll(".sy-scan-focus")))m.classList.remove("sy-scan-focus");d(),l&&de(e),u&&W(Ge(),l?`Scan on. Press Space or Enter to pick. Every ${X()/1e3} seconds the next choice lights up.`:"Scan off.")};r.addEventListener("click",()=>a(!h(),!0)),o.addEventListener("change",()=>{var l;try{(l=_())==null||l.setItem(ce,o.value)}catch(u){}d()});const y=l=>{if(!(l.altKey||l.ctrlKey||l.metaKey)){if((l.key==="s"||l.key==="S")&&!Je(l.target)){l.preventDefault(),a(!h(),!0);return}h()&&(l.key===" "||l.key==="Enter")&&d()}};return document.addEventListener("keydown",y),a(((c=_())==null?void 0:c.getItem(j))==="on",!1),()=>{i!==null&&clearInterval(i),document.removeEventListener("keydown",y),document.documentElement.classList.remove("sy-scanning"),s.remove()}}const pe=$e;function ue(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function et(e,t,i={}){var l;const s=be(e);i.startCardId!==void 0&&e.cards.some(u=>u.id===i.startCardId)&&(s.currentCardId=i.startCardId);const o=((l=i.scaler)!=null?l:Ke)(t);t.style.perspective="1200px";const h=i.flip!==!1;let d=null;function a(u,b,m=!1){var S;const p=e.cards.find(g=>g.id===u);if(!p){M(t);return}s.currentCardId=u;const v=e.cards.findIndex(g=>g.id===u),A=v>=0&&p.kind!=="end"?(S=e.cards[v+1])!=null?S:e.cards.find(g=>g.kind==="end"):void 0,k=v>=0?{position:v+1,total:e.cards.length,...A!==void 0&&A.id!==p.id?{nextCardId:A.id}:{}}:{};if(He(p,t,s,y,le,k),h&&!ue()){const g=t.querySelector(".sy-card");g&&(g.style.transformOrigin="top center",g.style.animation=`card-enter ${te}ms ease-out`)}if(!m){const g=document.activeElement,C=g===null||g===document.body||t.contains(g),n=t.querySelector(".sy-card");C&&n&&n.focus({preventScroll:!0})}q(p.actions,s,g=>y(g,!0),le)}function y(u,b){if(b){if(s.autoNavCount++,s.autoNavCount>20){M(t);return}}else s.autoNavCount=0;if(!e.cards.some(p=>p.id===u)){M(t);return}const m=t.querySelector(".sy-card");h&&!b&&!ue()&&m?(m.style.transformOrigin="top center",m.style.animation=`card-exit ${pe}ms ease-out forwards`,d!==null&&clearTimeout(d),d=setTimeout(()=>{d=null,a(u)},pe)):a(u)}a(s.currentCardId,!1,!0);const c=i.scan===!0?Ze(t):null;return function(){c==null||c(),d!==null&&(clearTimeout(d),d=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const i=document.getElementById("stack-data");if(!i){M(e);return}const s=(t=i.textContent)!=null?t:"",r=JSON.parse(s),o=xe(r);if(!o.valid){M(e);return}et(o.stack,e,{scan:!0})}catch(i){M(e)}})})();
