(function(){"use strict";function I(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function E(e){return typeof e=="string"}function z(e){return typeof e=="number"}function $(e){return Array.isArray(e)}function _(e){if(!I(e))return null;const t=e.type;return t==="goto"&&E(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&z(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&E(e.variable)&&(E(e.value)||z(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function te(e){if(!I(e))return null;const{type:t,id:n,x:a,y:r,w:o,h}=e;if(!E(n)||!z(a)||!z(r)||!z(o)||!z(h))return null;if(t==="text"&&E(e.content))return{type:"text",id:n,x:a,y:r,w:o,h,content:e.content};if(t==="button"&&E(e.label)&&$(e.actions)){const l=[];for(const s of e.actions){const p=_(s);if(p===null)return null;l.push(p)}return{type:"button",id:n,x:a,y:r,w:o,h,label:e.label,actions:l}}return t==="image"&&E(e.src)&&E(e.alt)?{type:"image",id:n,x:a,y:r,w:o,h,src:e.src,alt:e.alt}:t==="field"&&E(e.variable)?{type:"field",id:n,x:a,y:r,w:o,h,variable:e.variable}:null}function ne(e){if(!I(e))return null;const{id:t,kind:n,elements:a,actions:r}=e;if(!E(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!$(a)||!$(r))return null;const o=[];for(const l of a){const s=te(l);if(s===null)return null;o.push(s)}const h=[];for(const l of r){const s=_(l);if(s===null)return null;h.push(s)}return{id:t,kind:n,elements:o,actions:h}}function ie(e){if(!I(e))return null;const{id:t,title:n,theme:a,cards:r}=e;if(!E(t)||!E(n)||!I(a))return null;const{background:o,foreground:h,font:l}=a;if(!E(o)||!E(h)||!E(l)||!$(r))return null;const s=[];for(const p of r){const c=ne(p);if(c===null)return null;s.push(c)}return{id:t,title:n,theme:{background:o,foreground:h,font:l},cards:s}}const oe=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function M(e){return oe.test(e)}function P(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function G(e){return e.elements.filter(t=>t.type==="button")}function D(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function ae(e){var x;const t=[],n=new Set,a=f=>n.has(f)?!1:(n.add(f),!0);a(e.id)||t.push("duplicate-id");for(const f of e.cards){!a(f.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const y of f.elements)!a(y.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(f=>f.id));let o=!1;for(const f of e.cards){for(const y of P(f.actions))if(!r.has(y)){o=!0;break}if(o)break;for(const y of G(f)){for(const m of P(y.actions))if(!r.has(m)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(f=>f.kind==="end").length!==1&&t.push("end-card-count");for(const f of e.cards){if(f.kind!=="quiz")continue;const y=G(f),m=y.filter(D).length,w=y.filter(b=>!D(b)).length;if(m!==1||w<1){t.push("quiz-answer");break}}let l=!1;for(const f of e.cards){for(const y of f.elements)if(y.x+y.w>800||y.y+y.h>600){l=!0;break}if(l)break}l&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(f=>f.kind!=="end").length<1&&t.push("no-content-cards");let p=!1;if(M(e.id)||(p=!0),!p)for(const f of e.cards){if(!M(f.id)){p=!0;break}for(const y of f.elements)if(!M(y.id)){p=!0;break}if(p)break}p&&t.push("invalid-id");const c=new Map;for(const f of e.cards){const y=[];for(const m of f.actions)m.type==="goto"&&r.has(m.cardId)&&y.push(m.cardId);c.set(f.id,y)}const u=new Map;for(const f of e.cards)u.set(f.id,0);let d=!1;for(const f of e.cards){if(u.get(f.id)!==0||d)continue;const y=[];for(u.set(f.id,1),y.push({id:f.id,nextIdx:0});y.length>0&&!d;){const m=y[y.length-1],w=(x=c.get(m.id))!=null?x:[];if(m.nextIdx<w.length){const b=w[m.nextIdx];m.nextIdx++;const A=u.get(b);A===1?d=!0:A===0&&(u.set(b,1),y.push({id:b,nextIdx:0}))}else u.set(m.id,2),y.pop()}}return d&&t.push("goto-cycle"),t}function se(e){const t=ie(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=ae(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function re(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function le(e){e.variables={score:0},e.autoNavCount=0}function L(e,t,n,a=ce){for(const r of e)switch(r.type){case"goto":{n(r.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{a(r.sound);break}}}function ce(e){}function B(e,t,n,a=.54){const r=n*a;if(t<=0||r<=0)return 1;let o=0;for(const h of e.split(`
`)){const l=h.split(/\s+/).filter(c=>c.length>0);if(l.length===0){o+=1;continue}let s=0,p=1;for(const c of l){const u=c.length*r;if(u>t){s>0&&(p+=1);const x=Math.ceil(u/t)-1;p+=x,s=u-x*t;continue}const d=s===0?u:s+r+u;d>t?(p+=1,s=u):s=d}o+=p}return Math.max(1,o)}function N(e,t){var l,s,p;const n=(l=t.step)!=null?l:2,a=(s=t.lineHeight)!=null?s:c=>Math.round(c*1.3),r=(p=t.charWidth)!=null?p:.54;let o=null;for(let c=t.maxSize;c>=t.minSize;c-=n){const u=B(e,t.w,c,r),d=a(c),x=u*d<=t.h&&(t.maxLines===void 0||u<=t.maxLines);if(o={size:c,lineHeight:d,lines:u,fits:x},x)return o}if(o!==null){const c=t.minSize,u=B(e,t.w,c,r);return{size:c,lineHeight:a(c),lines:u,fits:!1}}const h=t.minSize;return{size:h,lineHeight:a(h),lines:B(e,t.w,h,r),fits:!1}}const F=20;function de(e){return e>=44?64:Math.round(e*1.3)}function W(e,t,n){return N(e,{w:t,h:n,maxSize:44,minSize:24,lineHeight:de})}const j=30;function X(e,t,n,a=22){return N(e,{w:t,h:n,maxSize:a,minSize:F,lineHeight:r=>Math.round(r*1.5)})}function pe(e,t,n){return N(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,n-12),maxSize:32,minSize:F,lineHeight:a=>Math.round(a*1.15),maxLines:3,charWidth:.56})}function q(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}function H(e,t){return t===void 0||q(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function S(e,t,n){t.size!==n&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const V='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',C={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},ue=[{color:C.tileA,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:C.tileB,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:C.tileC,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:C.tileD,textColor:C.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],fe=900,he=600,me=180,Q=360,ye=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${C.paper};
  --color-ink:     ${C.ink};
  --color-rule:    ${C.rule};
  --color-stamp:   ${C.stamp};
  --color-tile-a:  ${C.tileA};
  --color-tile-b:  ${C.tileB};
  --color-tile-c:  ${C.tileC};
  --color-tile-d:  ${C.tileD};
  --color-white:   ${C.white};
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

/* ---- Story body: bigger, and vertically centred in its box (TASK-27i). A story
   card is the most impressive thing the generator writes, and at 22 px in a tall
   box it read as a two-line note on a blank page. ---- */
.sy-story {
  font-size: 30px;
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
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
`;let J=!1;function xe(){if(J)return;const e=document.createElement("style");e.textContent=ye,document.head.appendChild(e),J=!0}let O=null;function ge(){if(O)return O;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),O=e,e}function be(e,t){e.innerHTML=t}function U(e){return e.cards.filter(t=>t.kind==="quiz").length}const ve=/\b(well done|great|brilliant|fantastic|amazing|excellent|congrat|superb|top marks|hooray|bravo|wow)\b/i;function we(e,t,n,a,r,o){var f,y;const h=typeof n.variables.score=="number"?n.variables.score:0,l=U(n.stack),s=document.createElement("div");s.className="sy-end-card";const p=e.elements.find(m=>m.type==="text");let c=p&&p.type==="text"?p.content:"Well done!";l>0&&h===0&&ve.test(c)&&(c="You finished!");const u=document.createElement("h1");if(u.className="sy-end-heading",u.textContent=c,s.appendChild(u),l>0){const m=document.createElement("p");m.className="sy-end-score",m.setAttribute("data-testid","end-score"),m.textContent=`Score ${h} of ${l}`,s.appendChild(m)}if(l>0){const m=document.createElement("div");m.className="sy-end-stamps",m.setAttribute("aria-label",`${h} of ${l} stamp${l!==1?"s":""} earned`);const w=[-8,-5,-10,-6,-9,-4,-7];for(let b=0;b<l;b++){const A=document.createElement("span");if(b<h){A.className="sy-end-slot sy-end-slot-earned",A.textContent="✓";const i=(f=w[b%w.length])!=null?f:-8;A.style.transform=`rotate(${i}deg)`}else A.className="sy-end-slot sy-end-slot-empty";A.setAttribute("aria-hidden","true"),m.appendChild(A)}s.appendChild(m)}const d=c.trim().replace(/[.!?…]+$/,"");o.textContent=l>0?`${d}. Score ${h} of ${l}.`:`${d}.`;const x=(y=n.stack.cards[0])==null?void 0:y.id;if(x!==void 0){const m=document.createElement("div");m.className="sy-end-again";const w=document.createElement("button");w.className="sy-button sy-end-again-btn",w.setAttribute("data-testid","play-again"),w.textContent="Play Again",w.addEventListener("click",()=>{le(n),a(x,!1)}),m.appendChild(w),s.appendChild(m)}for(const m of e.elements){if(m.type!=="button")continue;const w=document.createElement("div");w.style.marginTop="16px";const b=document.createElement("button");b.className="sy-button",b.style.width="auto",b.style.height="auto",b.textContent=m.label,b.addEventListener("click",()=>{L(m.actions,n,A=>a(A,!1),r)}),w.appendChild(b),s.appendChild(w)}t.appendChild(s)}function ke(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function Ce(e,t,n,a,r,o,h){var m,w,b,A;const l=e.elements.filter(i=>i.type==="text"),s=(w=(m=l[0])==null?void 0:m.content)!=null?w:"",p=(A=(b=l[1])==null?void 0:b.content)!=null?A:"";let c=e.elements.filter(i=>i.type==="button").map(i=>H(i,h));c.length===0&&h!==void 0&&q(e.actions)===null&&(c=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:h}]}]);const u=p.trim().length>0,d=document.createElement("div");d.className="sy-flash",u&&(d.setAttribute("role","button"),d.setAttribute("tabindex","0"),d.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(d);let x="front";const f=()=>{if(d.innerHTML="",x==="front"){const i=document.createElement("p");if(i.className="sy-flash-term",i.textContent=s,S(i,W(s,704,200),44),d.appendChild(i),u){const g=document.createElement("p");g.className="sy-flash-hint",g.textContent="Tap the card to see the answer",d.appendChild(g)}o.textContent=s}else{const i=document.createElement("p");i.className="sy-flash-term-small",i.textContent=s,S(i,N(s,{w:704,h:88,maxSize:32,minSize:24,lineHeight:k=>Math.round(k*1.3)}),32),d.appendChild(i);const g=document.createElement("p");g.className="sy-flash-back",g.textContent=p,S(g,N(p,{w:704,h:280,maxSize:26,minSize:F,lineHeight:k=>Math.round(k*1.54)}),26),d.appendChild(g);const v=document.createElement("p");v.className="sy-flash-hint",v.textContent="Tap the card to flip back",d.appendChild(v),o.textContent=p?`${s}: ${p}`:s}if(x==="back"||!u)for(const i of c){const g=document.createElement("div");g.className="sy-flash-next";const v=document.createElement("button");v.className="sy-button",v.textContent=i.label,v.addEventListener("click",k=>{k.stopPropagation(),L(i.actions,n,R=>a(R,!1),r)}),g.appendChild(v),d.appendChild(g)}},y=()=>{u&&(x=x==="front"?"back":"front",f(),ke()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation=`card-enter ${Q}ms ease-out`))};d.addEventListener("click",y),d.addEventListener("keydown",i=>{(i.key==="Enter"||i.key===" "||i.key==="Spacebar")&&(i.preventDefault(),y())}),f()}function Ae(e,t,n,a,r=Te,o={}){xe();const h=ge();t.innerHTML="";const l=document.createElement("div");l.className="sy-card-stack";for(let i=1;i<=3;i++){const g=document.createElement("div");g.className=`sy-card-edge sy-card-edge-${i}`,l.appendChild(g)}const s=document.createElement("div");s.className="sy-card";const p=document.createElement("div");p.className="sy-ring-holes",p.setAttribute("aria-hidden","true");for(let i=0;i<2;i++){const g=document.createElement("div");g.className="sy-ring-hole",p.appendChild(g)}s.appendChild(p);const c=document.createElement("div");if(c.className="sy-rings",c.setAttribute("aria-hidden","true"),c.innerHTML=`<span class="sy-ring">${V}</span><span class="sy-ring">${V}</span>`,e.kind==="end"){we(e,s,n,a,r,h),l.appendChild(s),l.appendChild(c),t.appendChild(l);return}if(typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const i=document.createElement("div");i.className="sy-meta-chrome";const g=document.createElement("p");g.className="sy-meta",g.textContent=`Card ${o.position} of ${o.total}`,i.appendChild(g),s.appendChild(i)}const u=n.variables.score,d=n.variables._answered,x=U(n.stack)>0,f=typeof d=="number"&&d>0||typeof u=="number"&&u>0;if(typeof u=="number"&&x&&f){const i=document.createElement("div");i.className="sy-score-chrome",i.setAttribute("aria-label",`Score ${u}`),i.textContent=`Score ${u}`,s.appendChild(i)}if(e.kind==="flash"){const i=e.elements.filter(k=>k.type==="text"),g=e.elements.filter(k=>k.type==="button");if(i.length>=2||g.length>=1){Ce(e,s,n,a,r,h,o.nextCardId),l.appendChild(s),l.appendChild(c),t.appendChild(l);return}}const y=e.kind==="quiz",m=y?e.elements.filter(i=>i.type==="button"&&i.actions.length>0):[];let w=0,b=!1,A=!1;for(const i of e.elements){const g=document.createElement("div");switch(g.className="sy-element",Ee(g,i),i.type){case"text":{const v=document.createElement("p"),k=(y||e.kind==="flash")&&!b,R=e.kind==="story"&&!A;v.className=k?"sy-question":R?"sy-story":"sy-text",k&&(b=!0),R&&(A=!0),v.textContent=i.content,k?S(v,W(i.content,i.w,i.h),44):R?S(v,X(i.content,i.w,i.h,j),j):S(v,X(i.content,i.w,i.h),22),g.appendChild(v);break}case"button":{const v=y&&i.actions.length>0,k=Y(H(i,o.nextCardId),v,m.length,v?w:0,n,a,r,h);g.appendChild(k),v&&w++;break}case"image":{const v=document.createElement("img");v.setAttribute("src",i.src),v.setAttribute("alt",i.alt),v.className="sy-image",v.style.width="100%",v.style.height="100%",g.appendChild(v);break}case"field":{const v=document.createElement("span");v.className="sy-field";const k=n.variables[i.variable];v.textContent=k!==void 0?String(k):"",g.appendChild(v);break}}s.appendChild(g)}if(o.nextCardId!==void 0&&q(e.actions)===null&&!e.elements.some(i=>i.type==="button")){const i=document.createElement("div");i.className="sy-element";const g={x:408,y:496,w:344,h:72};i.style.left=`${g.x}px`,i.style.top=`${g.y}px`,i.style.width=`${g.w}px`,i.style.height=`${g.h}px`;const v=H({type:"button",id:"sy-next",...g,label:"Next Card",actions:[]},o.nextCardId);i.appendChild(Y(v,!1,0,0,n,a,r,h)),s.appendChild(i)}l.appendChild(s),l.appendChild(c),t.appendChild(l)}function Ee(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function Y(e,t,n,a,r,o,h,l){const s=t?ue[a%4]:void 0,p=document.createElement("button");if(s){p.className="sy-tile",p.style.backgroundColor=s.color,p.style.color=s.textColor,e.actions.some(d=>d.type==="score"&&d.delta>0)&&p.setAttribute("data-correct","true");const c=document.createElement("span");c.className="sy-tile-shape",c.style.color=s.textColor,be(c,s.shapePath),p.appendChild(c);const u=document.createElement("span");u.className="sy-tile-label",u.textContent=e.label,S(u,pe(e.label,e.w,e.h),32),p.appendChild(u)}else p.className="sy-button",p.textContent=e.label,S(p,N(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:F,lineHeight:c=>Math.round(c*1.15),charWidth:.56}),32);return p.addEventListener("click",()=>{Se(p,e,s,r,o,h,l)}),p}function Se(e,t,n,a,r,o,h){const l=t.actions.some(d=>d.type==="score"&&d.delta>0),s=e.closest(".sy-card"),p=t.actions.some(d=>d.type==="goto");s&&(n!==void 0||p)&&s.querySelectorAll(".sy-tile, .sy-button").forEach(d=>{d.disabled=!0});const c=t.actions.find(d=>d.type==="goto"),u=t.actions.filter(d=>d.type!=="goto");if(t.actions.some(d=>d.type==="score")){const d=a.variables._answered;a.variables._answered=(typeof d=="number"?d:0)+1}if(L(u,a,Ie,o),n)if(l)ze(e,h),t.actions.some(x=>x.type==="sound")||o("cheer"),setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},fe);else{if(Ne(e),t.actions.some(x=>x.type==="sound")||o("buzz"),s){const x=s.querySelector('.sy-tile[data-correct="true"]');if(x&&x!==e&&(x.classList.add("sy-tile-reveal"),!x.querySelector(".sy-reveal-mark"))){const f=document.createElement("span");f.className="sy-reveal-mark",f.textContent="✓ Right answer",f.setAttribute("aria-hidden","true"),x.appendChild(f)}}setTimeout(()=>{c&&c.type==="goto"&&r(c.cardId,!1)},he)}else c&&c.type==="goto"&&r(c.cardId,!1)}function ze(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function Ne(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function Te(e){}function Ie(e){}function Re(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const r=window.innerWidth,o=window.innerHeight,h=Math.min(r*.9/800,o*.9/600);e.style.transform=`scale(${h})`}n();const a=new ResizeObserver(n);return a.observe(document.body),function(){a.disconnect()}}function K(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,a=n.createOscillator(),r=n.createGain();a.connect(r),r.connect(n.destination);const o=n.currentTime,h=.5;e==="cheer"?(a.type="triangle",a.frequency.setValueAtTime(440,o),a.frequency.linearRampToValueAtTime(880,o+h),r.gain.setValueAtTime(0,o),r.gain.linearRampToValueAtTime(.3,o+.05),r.gain.linearRampToValueAtTime(0,o+h)):(a.type="sawtooth",a.frequency.setValueAtTime(150,o),r.gain.setValueAtTime(.3,o),r.gain.linearRampToValueAtTime(0,o+h)),a.start(o),a.stop(o+h),a.onended=()=>{try{n.close()}catch(l){}}}catch(t){}}function T(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const Z=me;function ee(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function $e(e,t,n={}){var c;const a=re(e);n.startCardId!==void 0&&e.cards.some(u=>u.id===n.startCardId)&&(a.currentCardId=n.startCardId);const o=((c=n.scaler)!=null?c:Re)(t);t.style.perspective="1200px";const h=n.flip!==!1;let l=null;function s(u,d){var w;const x=e.cards.find(b=>b.id===u);if(!x){T(t);return}a.currentCardId=u;const f=e.cards.findIndex(b=>b.id===u),y=f>=0&&x.kind!=="end"?(w=e.cards[f+1])!=null?w:e.cards.find(b=>b.kind==="end"):void 0,m=f>=0?{position:f+1,total:e.cards.length,...y!==void 0&&y.id!==x.id?{nextCardId:y.id}:{}}:{};if(Ae(x,t,a,p,K,m),h&&!ee()){const b=t.querySelector(".sy-card");b&&(b.style.transformOrigin="top center",b.style.animation=`card-enter ${Q}ms ease-out`)}L(x.actions,a,b=>p(b,!0),K)}function p(u,d){if(d){if(a.autoNavCount++,a.autoNavCount>20){T(t);return}}else a.autoNavCount=0;if(!e.cards.some(f=>f.id===u)){T(t);return}const x=t.querySelector(".sy-card");h&&!d&&!ee()&&x?(x.style.transformOrigin="top center",x.style.animation=`card-exit ${Z}ms ease-out forwards`,l!==null&&clearTimeout(l),l=setTimeout(()=>{l=null,s(u)},Z)):s(u)}return s(a.currentCardId),function(){l!==null&&(clearTimeout(l),l=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){T(e);return}const a=(t=n.textContent)!=null?t:"",r=JSON.parse(a),o=se(r);if(!o.valid){T(e);return}$e(o.stack,e)}catch(n){T(e)}})})();
