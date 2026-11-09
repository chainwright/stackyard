(function(){"use strict";function L(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function S(e){return typeof e=="string"}function T(e){return typeof e=="number"}function M(e){return Array.isArray(e)}function j(e){if(!L(e))return null;const t=e.type;return t==="goto"&&S(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&T(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&S(e.variable)&&(S(e.value)||T(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function se(e){if(!L(e))return null;const{type:t,id:n,x:s,y:l,w:o,h:m}=e;if(!S(n)||!T(s)||!T(l)||!T(o)||!T(m))return null;if(t==="text"&&S(e.content))return{type:"text",id:n,x:s,y:l,w:o,h:m,content:e.content};if(t==="button"&&S(e.label)&&M(e.actions)){const d=[];for(const c of e.actions){const y=j(c);if(y===null)return null;d.push(y)}return{type:"button",id:n,x:s,y:l,w:o,h:m,label:e.label,actions:d}}return t==="image"&&S(e.src)&&S(e.alt)?{type:"image",id:n,x:s,y:l,w:o,h:m,src:e.src,alt:e.alt}:t==="field"&&S(e.variable)?{type:"field",id:n,x:s,y:l,w:o,h:m,variable:e.variable}:null}function re(e){if(!L(e))return null;const{id:t,kind:n,elements:s,actions:l}=e;if(!S(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!M(s)||!M(l))return null;const o=[];for(const d of s){const c=se(d);if(c===null)return null;o.push(c)}const m=[];for(const d of l){const c=j(d);if(c===null)return null;m.push(c)}return{id:t,kind:n,elements:o,actions:m}}function le(e){if(!L(e))return null;const{id:t,title:n,theme:s,cards:l}=e;if(!S(t)||!S(n)||!L(s))return null;const{background:o,foreground:m,font:d}=s;if(!S(o)||!S(m)||!S(d)||!M(l))return null;const c=[];for(const y of l){const r=re(y);if(r===null)return null;c.push(r)}return{id:t,title:n,theme:{background:o,foreground:m,font:d},cards:c}}const ce=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function q(e){return ce.test(e)}function X(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function V(e){return e.elements.filter(t=>t.type==="button")}function Q(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function de(e){var u;const t=[],n=new Set,s=h=>n.has(h)?!1:(n.add(h),!0);s(e.id)||t.push("duplicate-id");for(const h of e.cards){!s(h.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const g of h.elements)!s(g.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const l=new Set(e.cards.map(h=>h.id));let o=!1;for(const h of e.cards){for(const g of X(h.actions))if(!l.has(g)){o=!0;break}if(o)break;for(const g of V(h)){for(const w of X(g.actions))if(!l.has(w)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(h=>h.kind==="end").length!==1&&t.push("end-card-count");for(const h of e.cards){if(h.kind!=="quiz")continue;const g=V(h),w=g.filter(Q).length,E=g.filter(k=>!Q(k)).length;if(w!==1||E<1){t.push("quiz-answer");break}}let d=!1;for(const h of e.cards){for(const g of h.elements)if(g.x+g.w>800||g.y+g.h>600){d=!0;break}if(d)break}d&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(h=>h.kind!=="end").length<1&&t.push("no-content-cards");let y=!1;if(q(e.id)||(y=!0),!y)for(const h of e.cards){if(!q(h.id)){y=!0;break}for(const g of h.elements)if(!q(g.id)){y=!0;break}if(y)break}y&&t.push("invalid-id");const r=new Map;for(const h of e.cards){const g=[];for(const w of h.actions)w.type==="goto"&&l.has(w.cardId)&&g.push(w.cardId);r.set(h.id,g)}const p=new Map;for(const h of e.cards)p.set(h.id,0);let f=!1;for(const h of e.cards){if(p.get(h.id)!==0||f)continue;const g=[];for(p.set(h.id,1),g.push({id:h.id,nextIdx:0});g.length>0&&!f;){const w=g[g.length-1],E=(u=r.get(w.id))!=null?u:[];if(w.nextIdx<E.length){const k=E[w.nextIdx];w.nextIdx++;const z=p.get(k);z===1?f=!0:z===0&&(p.set(k,1),g.push({id:k,nextIdx:0}))}else p.set(w.id,2),g.pop()}}return f&&t.push("goto-cycle"),t}function pe(e){const t=le(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=de(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function ue(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function he(e){e.variables={score:0},e.autoNavCount=0}function F(e,t,n,s=fe){for(const l of e)switch(l.type){case"goto":{n(l.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+l.delta;break}case"set":{t.variables[l.variable]=l.value;break}case"sound":{s(l.sound);break}}}function fe(e){}function H(e,t,n,s=.54){const l=n*s;if(t<=0||l<=0)return 1;let o=0;for(const m of e.split(`
`)){const d=m.split(/\s+/).filter(r=>r.length>0);if(d.length===0){o+=1;continue}let c=0,y=1;for(const r of d){const p=r.length*l;if(p>t){c>0&&(y+=1);const u=Math.ceil(p/t)-1;y+=u,c=p-u*t;continue}const f=c===0?p:c+l+p;f>t?(y+=1,c=p):c=f}o+=y}return Math.max(1,o)}function I(e,t){var d,c,y;const n=(d=t.step)!=null?d:2,s=(c=t.lineHeight)!=null?c:r=>Math.round(r*1.3),l=(y=t.charWidth)!=null?y:.54;let o=null;for(let r=t.maxSize;r>=t.minSize;r-=n){const p=H(e,t.w,r,l),f=s(r),u=p*f<=t.h&&(t.maxLines===void 0||p<=t.maxLines);if(o={size:r,lineHeight:f,lines:p,fits:u},u)return o}if(o!==null){const r=t.minSize,p=H(e,t.w,r,l);return{size:r,lineHeight:s(r),lines:p,fits:!1}}const m=t.minSize;return{size:m,lineHeight:s(m),lines:H(e,t.w,m,l),fits:!1}}const B=20;function me(e){return e>=44?64:Math.round(e*1.3)}function J(e,t,n){return I(e,{w:t,h:n,maxSize:44,minSize:24,lineHeight:me})}const U=30;function O(e,t,n,s=22){return I(e,{w:t,h:n,maxSize:s,minSize:B,lineHeight:l=>Math.round(l*1.5)})}function ye(e,t,n){return I(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,n-12),maxSize:32,minSize:B,lineHeight:s=>Math.round(s*1.15),maxLines:3,charWidth:.56})}function D(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}const ge=e=>e.toLowerCase().replace(/[^a-z ]+/g," ").replace(/\s+/g," ").trim();function xe(e){return/^(well done|well done you finished|well done you have finished|great job|you did it)$/.test(ge(e))}const be="Picture: Stackyard pictogram";function _(e){return e.trim()===be}function P(e,t){return t===void 0||D(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function N(e,t,n){t.size!==n&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const K='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',A={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},ve=[{color:A.tileA,textColor:A.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:A.tileB,textColor:A.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:A.tileC,textColor:A.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:A.tileD,textColor:A.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],we=900,ke=600,Ce=180,Y=360,Ae=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${A.paper};
  --color-ink:     ${A.ink};
  --color-rule:    ${A.rule};
  --color-stamp:   ${A.stamp};
  --color-tile-a:  ${A.tileA};
  --color-tile-b:  ${A.tileB};
  --color-tile-c:  ${A.tileC};
  --color-tile-d:  ${A.tileD};
  --color-white:   ${A.white};
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
`;let Z=!1;function Ee(){if(Z)return;const e=document.createElement("style");e.textContent=Ae,document.head.appendChild(e),Z=!0}let G=null;function Se(){if(G)return G;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),G=e,e}function ze(e,t){e.innerHTML=t}function ee(e){return e.cards.filter(t=>t.kind==="quiz").length}function Ne(e,t,n,s,l,o){var w,E,k,z;const m=typeof n.variables.score=="number"?n.variables.score:0,d=ee(n.stack),c=document.createElement("div");c.className="sy-end-card";const y=e.elements.filter(v=>v.type==="text"),r=y[0];let p=r?r.content:"Well done!";d>0&&m===0&&xe(p)&&(p="You finished!");const f=document.createElement("h1");f.className="sy-end-heading",f.textContent=p,c.appendChild(f);const u=(E=(w=y[1])==null?void 0:w.content.trim())!=null?E:"";if(u.length>0){c.classList.add("sy-end-has-body");const v=document.createElement("p");v.className="sy-end-body",v.textContent=u,c.appendChild(v)}if(d>0){const v=document.createElement("p");v.className="sy-end-score",v.setAttribute("data-testid","end-score"),v.textContent=`Score ${m} of ${d}`,c.appendChild(v)}if(d>0){const v=document.createElement("div");v.className="sy-end-stamps",v.setAttribute("aria-label",`${m} of ${d} stamp${d!==1?"s":""} earned`);const a=[-8,-5,-10,-6,-9,-4,-7];for(let x=0;x<d;x++){const i=document.createElement("span");if(x<m){i.className="sy-end-slot sy-end-slot-earned",i.textContent="✓";const b=(k=a[x%a.length])!=null?k:-8;i.style.transform=`rotate(${b}deg)`}else i.className="sy-end-slot sy-end-slot-empty";i.setAttribute("aria-hidden","true"),v.appendChild(i)}c.appendChild(v)}const h=p.trim().replace(/[.!?…]+$/,"");o.textContent=d>0?`${h}. Score ${m} of ${d}.`:`${h}.`;const g=(z=n.stack.cards[0])==null?void 0:z.id;if(g!==void 0){const v=document.createElement("div");v.className="sy-end-again";const a=document.createElement("button");a.className="sy-button sy-end-again-btn",a.setAttribute("data-testid","play-again"),a.textContent="Play Again",a.addEventListener("click",()=>{he(n),s(g,!1)}),v.appendChild(a),c.appendChild(v)}for(const v of e.elements){if(v.type!=="button")continue;const a=document.createElement("div");a.style.marginTop="16px";const x=document.createElement("button");x.className="sy-button",x.style.width="auto",x.style.height="auto",x.textContent=v.label,x.addEventListener("click",()=>{F(v.actions,n,i=>s(i,!1),l)}),a.appendChild(x),c.appendChild(a)}t.appendChild(c)}function Te(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function Ie(e,t,n,s,l,o,m){var z,v,a,x;const d=e.elements.filter(i=>i.type==="text"),c=d.filter(i=>!_(i.content)),y=(v=(z=c[0])==null?void 0:z.content)!=null?v:"",r=(x=(a=c[1])==null?void 0:a.content)!=null?x:"";let p=e.elements.filter(i=>i.type==="button").map(i=>P(i,m));p.length===0&&m!==void 0&&D(e.actions)===null&&(p=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:m}]}]);const f=r.trim().length>0,u=document.createElement("div");u.className="sy-flash",f&&(u.setAttribute("role","button"),u.setAttribute("tabindex","0"),u.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(u);const h=e.elements.filter(i=>i.type==="image");for(const i of h){const b=document.createElement("div");b.className="sy-element",b.setAttribute("data-element-id",i.id),W(b,i),b.style.pointerEvents="none";const C=document.createElement("img");C.setAttribute("src",i.src),C.setAttribute("alt",i.alt),C.className="sy-image",C.style.width="100%",C.style.height="100%",b.appendChild(C),t.appendChild(b)}const g=h.length>0?d.find(i=>_(i.content)):void 0;if(g!==void 0){const i=document.createElement("div");i.className="sy-element",i.setAttribute("data-element-id",g.id),W(i,g),i.style.pointerEvents="none";const b=document.createElement("p");b.className="sy-text",b.textContent=g.content,N(b,O(g.content,g.w,g.h),22),i.appendChild(b),t.appendChild(i)}let w="front";const E=()=>{if(u.innerHTML="",w==="front"){const i=document.createElement("p");if(i.className="sy-flash-term",i.textContent=y,N(i,J(y,704,200),44),u.appendChild(i),f){const b=document.createElement("p");b.className="sy-flash-hint",b.textContent="Tap the card to see the answer",u.appendChild(b)}o.textContent=y}else{const i=document.createElement("p");i.className="sy-flash-term-small",i.textContent=y,N(i,I(y,{w:704,h:88,maxSize:32,minSize:24,lineHeight:$=>Math.round($*1.3)}),32),u.appendChild(i);const b=document.createElement("p");b.className="sy-flash-back",b.textContent=r,N(b,I(r,{w:704,h:280,maxSize:26,minSize:B,lineHeight:$=>Math.round($*1.54)}),26),u.appendChild(b);const C=document.createElement("p");C.className="sy-flash-hint",C.textContent="Tap the card to flip back",u.appendChild(C),o.textContent=r?`${y}: ${r}`:y}if(w==="back"||!f)for(const i of p){const b=document.createElement("div");b.className="sy-flash-next";const C=document.createElement("button");C.className="sy-button",C.textContent=i.label,C.addEventListener("click",$=>{$.stopPropagation(),F(i.actions,n,De=>s(De,!1),l)}),b.appendChild(C),u.appendChild(b)}},k=()=>{f&&(w=w==="front"?"back":"front",E(),Te()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation=`card-enter ${Y}ms ease-out`))};u.addEventListener("click",k),u.addEventListener("keydown",i=>{(i.key==="Enter"||i.key===" "||i.key==="Spacebar")&&(i.preventDefault(),k())}),E()}function Re(e,t,n,s,l=Be,o={}){Ee();const m=Se();t.innerHTML="";const d=document.createElement("div");d.className="sy-card-stack";for(let a=1;a<=3;a++){const x=document.createElement("div");x.className=`sy-card-edge sy-card-edge-${a}`,d.appendChild(x)}const c=document.createElement("div");c.className="sy-card";const y=document.createElement("div");y.className="sy-ring-holes",y.setAttribute("aria-hidden","true");for(let a=0;a<2;a++){const x=document.createElement("div");x.className="sy-ring-hole",y.appendChild(x)}c.appendChild(y);const r=document.createElement("div");if(r.className="sy-rings",r.setAttribute("aria-hidden","true"),r.innerHTML=`<span class="sy-ring">${K}</span><span class="sy-ring">${K}</span>`,e.kind==="end"){Ne(e,c,n,s,l,m),d.appendChild(c),d.appendChild(r),t.appendChild(d);return}if(typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const a=document.createElement("div");a.className="sy-meta-chrome";const x=document.createElement("p");x.className="sy-meta",x.textContent=`Card ${o.position} of ${o.total}`,a.appendChild(x),c.appendChild(a)}const p=n.variables.score,f=n.variables._answered,u=ee(n.stack)>0,h=typeof f=="number"&&f>0||typeof p=="number"&&p>0;if(typeof p=="number"&&u&&h){const a=document.createElement("div");a.className="sy-score-chrome",a.setAttribute("aria-label",`Score ${p}`),a.textContent=`Score ${p}`,c.appendChild(a)}if(e.kind==="flash"){const a=e.elements.filter(b=>b.type==="text"&&!_(b.content)),x=e.elements.filter(b=>b.type==="button");if(a.length>=2||x.length>=1){Ie(e,c,n,s,l,m,o.nextCardId),d.appendChild(c),d.appendChild(r),t.appendChild(d);return}}const g=e.kind==="quiz",w=g?e.elements.filter(a=>a.type==="button"&&a.actions.length>0):[];let E=0;const k=Le(e.elements.filter(a=>a.type==="button"&&!(g&&a.actions.length>0)));let z=!1,v=!1;for(const a of e.elements){const x=document.createElement("div");switch(x.className="sy-element",x.setAttribute("data-element-id",a.id),W(x,a),a.type){case"text":{const i=document.createElement("p"),b=(g||e.kind==="flash")&&!z,C=e.kind==="story"&&!v;i.className=b?"sy-question":C?"sy-story":"sy-text",b&&(z=!0),C&&(v=!0),i.textContent=a.content,b?N(i,J(a.content,a.w,a.h),44):C?N(i,O(a.content,a.w,a.h,U),U):N(i,O(a.content,a.w,a.h),22),x.appendChild(i);break}case"button":{const i=g&&a.actions.length>0,b=ne(P(a,o.nextCardId),i,w.length,i?E:0,n,s,l,m,i?void 0:k);x.appendChild(b),i&&E++;break}case"image":{const i=document.createElement("img");i.setAttribute("src",a.src),i.setAttribute("alt",a.alt),i.className="sy-image",i.style.width="100%",i.style.height="100%",x.appendChild(i);break}case"field":{const i=document.createElement("span");i.className="sy-field";const b=n.variables[a.variable];i.textContent=b!==void 0?String(b):"",x.appendChild(i);break}}c.appendChild(x)}if(o.nextCardId!==void 0&&D(e.actions)===null&&!e.elements.some(a=>a.type==="button")){const a=document.createElement("div");a.className="sy-element";const x={x:408,y:496,w:344,h:72};a.style.left=`${x.x}px`,a.style.top=`${x.y}px`,a.style.width=`${x.w}px`,a.style.height=`${x.h}px`;const i=P({type:"button",id:"sy-next",...x,label:"Next Card",actions:[]},o.nextCardId);a.appendChild(ne(i,!1,0,0,n,s,l,m)),c.appendChild(a)}d.appendChild(c),d.appendChild(r),t.appendChild(d)}function W(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function te(e){return I(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:B,lineHeight:t=>Math.round(t*1.15),charWidth:.56})}function Le(e){if(!(e.length<2))return e.map(te).reduce((t,n)=>n.size<t.size?n:t)}function ne(e,t,n,s,l,o,m,d,c){const y=t?ve[s%4]:void 0,r=document.createElement("button");if(y){r.className="sy-tile",r.style.backgroundColor=y.color,r.style.color=y.textColor,e.actions.some(u=>u.type==="score"&&u.delta>0)&&r.setAttribute("data-correct","true");const p=document.createElement("span");p.className="sy-tile-shape",p.style.color=y.textColor,ze(p,y.shapePath),r.appendChild(p);const f=document.createElement("span");f.className="sy-tile-label",f.textContent=e.label,N(f,ye(e.label,e.w,e.h),32),r.appendChild(f)}else r.className="sy-button",r.textContent=e.label,N(r,c!=null?c:te(e),32);return r.addEventListener("click",()=>{$e(r,e,y,l,o,m,d)}),r}function $e(e,t,n,s,l,o,m){const d=t.actions.some(f=>f.type==="score"&&f.delta>0),c=e.closest(".sy-card"),y=t.actions.some(f=>f.type==="goto");c&&(n!==void 0||y)&&c.querySelectorAll(".sy-tile, .sy-button").forEach(f=>{f.disabled=!0});const r=t.actions.find(f=>f.type==="goto"),p=t.actions.filter(f=>f.type!=="goto");if(t.actions.some(f=>f.type==="score")){const f=s.variables._answered;s.variables._answered=(typeof f=="number"?f:0)+1}if(F(p,s,qe,o),n)if(d)Me(e,m),t.actions.some(u=>u.type==="sound")||o("cheer"),setTimeout(()=>{r&&r.type==="goto"&&l(r.cardId,!1)},we);else{if(Fe(e),t.actions.some(u=>u.type==="sound")||o("buzz"),c){const u=c.querySelector('.sy-tile[data-correct="true"]');if(u&&u!==e&&(u.classList.add("sy-tile-reveal"),!u.querySelector(".sy-reveal-mark"))){const h=document.createElement("span");h.className="sy-reveal-mark",h.textContent="✓ Right answer",h.setAttribute("aria-hidden","true"),u.appendChild(h)}}setTimeout(()=>{r&&r.type==="goto"&&l(r.cardId,!1)},ke)}else r&&r.type==="goto"&&l(r.cardId,!1)}function Me(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function Fe(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function Be(e){}function qe(e){}function He(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const l=window.innerWidth,o=window.innerHeight,m=Math.min(l*.9/800,o*.9/600);e.style.transform=`scale(${m})`}n();const s=new ResizeObserver(n);return s.observe(document.body),function(){s.disconnect()}}function ie(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,s=n.createOscillator(),l=n.createGain();s.connect(l),l.connect(n.destination);const o=n.currentTime,m=.5;e==="cheer"?(s.type="triangle",s.frequency.setValueAtTime(440,o),s.frequency.linearRampToValueAtTime(880,o+m),l.gain.setValueAtTime(0,o),l.gain.linearRampToValueAtTime(.3,o+.05),l.gain.linearRampToValueAtTime(0,o+m)):(s.type="sawtooth",s.frequency.setValueAtTime(150,o),l.gain.setValueAtTime(.3,o),l.gain.linearRampToValueAtTime(0,o+m)),s.start(o),s.stop(o+m),s.onended=()=>{try{n.close()}catch(d){}}}catch(t){}}function R(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const oe=Ce;function ae(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function Oe(e,t,n={}){var r;const s=ue(e);n.startCardId!==void 0&&e.cards.some(p=>p.id===n.startCardId)&&(s.currentCardId=n.startCardId);const o=((r=n.scaler)!=null?r:He)(t);t.style.perspective="1200px";const m=n.flip!==!1;let d=null;function c(p,f){var E;const u=e.cards.find(k=>k.id===p);if(!u){R(t);return}s.currentCardId=p;const h=e.cards.findIndex(k=>k.id===p),g=h>=0&&u.kind!=="end"?(E=e.cards[h+1])!=null?E:e.cards.find(k=>k.kind==="end"):void 0,w=h>=0?{position:h+1,total:e.cards.length,...g!==void 0&&g.id!==u.id?{nextCardId:g.id}:{}}:{};if(Re(u,t,s,y,ie,w),m&&!ae()){const k=t.querySelector(".sy-card");k&&(k.style.transformOrigin="top center",k.style.animation=`card-enter ${Y}ms ease-out`)}F(u.actions,s,k=>y(k,!0),ie)}function y(p,f){if(f){if(s.autoNavCount++,s.autoNavCount>20){R(t);return}}else s.autoNavCount=0;if(!e.cards.some(h=>h.id===p)){R(t);return}const u=t.querySelector(".sy-card");m&&!f&&!ae()&&u?(u.style.transformOrigin="top center",u.style.animation=`card-exit ${oe}ms ease-out forwards`,d!==null&&clearTimeout(d),d=setTimeout(()=>{d=null,c(p)},oe)):c(p)}return c(s.currentCardId),function(){d!==null&&(clearTimeout(d),d=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){R(e);return}const s=(t=n.textContent)!=null?t:"",l=JSON.parse(s),o=pe(l);if(!o.valid){R(e);return}Oe(o.stack,e)}catch(n){R(e)}})})();
