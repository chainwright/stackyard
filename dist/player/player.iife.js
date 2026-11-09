(function(){"use strict";function R(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function S(e){return typeof e=="string"}function N(e){return typeof e=="number"}function $(e){return Array.isArray(e)}function _(e){if(!R(e))return null;const t=e.type;return t==="goto"&&S(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&N(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&S(e.variable)&&(S(e.value)||N(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function ae(e){if(!R(e))return null;const{type:t,id:i,x:a,y:r,w:o,h:m}=e;if(!S(i)||!N(a)||!N(r)||!N(o)||!N(m))return null;if(t==="text"&&S(e.content))return{type:"text",id:i,x:a,y:r,w:o,h:m,content:e.content};if(t==="button"&&S(e.label)&&$(e.actions)){const p=[];for(const s of e.actions){const y=_(s);if(y===null)return null;p.push(y)}return{type:"button",id:i,x:a,y:r,w:o,h:m,label:e.label,actions:p}}return t==="image"&&S(e.src)&&S(e.alt)?{type:"image",id:i,x:a,y:r,w:o,h:m,src:e.src,alt:e.alt}:t==="field"&&S(e.variable)?{type:"field",id:i,x:a,y:r,w:o,h:m,variable:e.variable}:null}function se(e){if(!R(e))return null;const{id:t,kind:i,elements:a,actions:r}=e;if(!S(t)||i!=="quiz"&&i!=="flash"&&i!=="story"&&i!=="end"||!$(a)||!$(r))return null;const o=[];for(const p of a){const s=ae(p);if(s===null)return null;o.push(s)}const m=[];for(const p of r){const s=_(p);if(s===null)return null;m.push(s)}return{id:t,kind:i,elements:o,actions:m}}function re(e){if(!R(e))return null;const{id:t,title:i,theme:a,cards:r}=e;if(!S(t)||!S(i)||!R(a))return null;const{background:o,foreground:m,font:p}=a;if(!S(o)||!S(m)||!S(p)||!$(r))return null;const s=[];for(const y of r){const l=se(y);if(l===null)return null;s.push(l)}return{id:t,title:i,theme:{background:o,foreground:m,font:p},cards:s}}const le=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function B(e){return le.test(e)}function P(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function G(e){return e.elements.filter(t=>t.type==="button")}function W(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function ce(e){var x;const t=[],i=new Set,a=f=>i.has(f)?!1:(i.add(f),!0);a(e.id)||t.push("duplicate-id");for(const f of e.cards){!a(f.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const g of f.elements)!a(g.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(f=>f.id));let o=!1;for(const f of e.cards){for(const g of P(f.actions))if(!r.has(g)){o=!0;break}if(o)break;for(const g of G(f)){for(const w of P(g.actions))if(!r.has(w)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(f=>f.kind==="end").length!==1&&t.push("end-card-count");for(const f of e.cards){if(f.kind!=="quiz")continue;const g=G(f),w=g.filter(W).length,A=g.filter(v=>!W(v)).length;if(w!==1||A<1){t.push("quiz-answer");break}}let p=!1;for(const f of e.cards){for(const g of f.elements)if(g.x+g.w>800||g.y+g.h>600){p=!0;break}if(p)break}p&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(f=>f.kind!=="end").length<1&&t.push("no-content-cards");let y=!1;if(B(e.id)||(y=!0),!y)for(const f of e.cards){if(!B(f.id)){y=!0;break}for(const g of f.elements)if(!B(g.id)){y=!0;break}if(y)break}y&&t.push("invalid-id");const l=new Map;for(const f of e.cards){const g=[];for(const w of f.actions)w.type==="goto"&&r.has(w.cardId)&&g.push(w.cardId);l.set(f.id,g)}const u=new Map;for(const f of e.cards)u.set(f.id,0);let c=!1;for(const f of e.cards){if(u.get(f.id)!==0||c)continue;const g=[];for(u.set(f.id,1),g.push({id:f.id,nextIdx:0});g.length>0&&!c;){const w=g[g.length-1],A=(x=l.get(w.id))!=null?x:[];if(w.nextIdx<A.length){const v=A[w.nextIdx];w.nextIdx++;const E=u.get(v);E===1?c=!0:E===0&&(u.set(v,1),g.push({id:v,nextIdx:0}))}else u.set(w.id,2),g.pop()}}return c&&t.push("goto-cycle"),t}function de(e){const t=re(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const i=ce(t);return i.length>0?{valid:!1,errors:i}:{valid:!0,stack:t}}function pe(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function ue(e){e.variables={score:0},e.autoNavCount=0}function M(e,t,i,a=fe){for(const r of e)switch(r.type){case"goto":{i(r.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{a(r.sound);break}}}function fe(e){}function q(e,t,i,a=.54){const r=i*a;if(t<=0||r<=0)return 1;let o=0;for(const m of e.split(`
`)){const p=m.split(/\s+/).filter(l=>l.length>0);if(p.length===0){o+=1;continue}let s=0,y=1;for(const l of p){const u=l.length*r;if(u>t){s>0&&(y+=1);const x=Math.ceil(u/t)-1;y+=x,s=u-x*t;continue}const c=s===0?u:s+r+u;c>t?(y+=1,s=u):s=c}o+=y}return Math.max(1,o)}function T(e,t){var p,s,y;const i=(p=t.step)!=null?p:2,a=(s=t.lineHeight)!=null?s:l=>Math.round(l*1.3),r=(y=t.charWidth)!=null?y:.54;let o=null;for(let l=t.maxSize;l>=t.minSize;l-=i){const u=q(e,t.w,l,r),c=a(l),x=u*c<=t.h&&(t.maxLines===void 0||u<=t.maxLines);if(o={size:l,lineHeight:c,lines:u,fits:x},x)return o}if(o!==null){const l=t.minSize,u=q(e,t.w,l,r);return{size:l,lineHeight:a(l),lines:u,fits:!1}}const m=t.minSize;return{size:m,lineHeight:a(m),lines:q(e,t.w,m,r),fits:!1}}const F=20;function he(e){return e>=44?64:Math.round(e*1.3)}function j(e,t,i){return T(e,{w:t,h:i,maxSize:44,minSize:24,lineHeight:he})}const X=30;function V(e,t,i,a=22){return T(e,{w:t,h:i,maxSize:a,minSize:F,lineHeight:r=>Math.round(r*1.5)})}function me(e,t,i){return T(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,i-12),maxSize:32,minSize:F,lineHeight:a=>Math.round(a*1.15),maxLines:3,charWidth:.56})}function H(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}const ye=e=>e.toLowerCase().replace(/[^a-z ]+/g," ").replace(/\s+/g," ").trim();function ge(e){return/^(well done|well done you finished|well done you have finished|great job|you did it)$/.test(ye(e))}const xe="Picture: Stackyard pictogram";function Q(e){return e.trim()===xe}function O(e,t){return t===void 0||H(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function z(e,t,i){t.size!==i&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const J='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',C={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},be=[{color:C.tileA,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:C.tileB,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:C.tileC,textColor:C.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:C.tileD,textColor:C.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],ve=900,we=600,ke=180,U=360,Ce=`
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
`;let K=!1;function Ae(){if(K)return;const e=document.createElement("style");e.textContent=Ce,document.head.appendChild(e),K=!0}let D=null;function Se(){if(D)return D;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),D=e,e}function Ee(e,t){e.innerHTML=t}function Y(e){return e.cards.filter(t=>t.kind==="quiz").length}function ze(e,t,i,a,r,o){var w,A,v,E;const m=typeof i.variables.score=="number"?i.variables.score:0,p=Y(i.stack),s=document.createElement("div");s.className="sy-end-card";const y=e.elements.filter(b=>b.type==="text"),l=y[0];let u=l?l.content:"Well done!";p>0&&m===0&&ge(u)&&(u="You finished!");const c=document.createElement("h1");c.className="sy-end-heading",c.textContent=u,s.appendChild(c);const x=(A=(w=y[1])==null?void 0:w.content.trim())!=null?A:"";if(x.length>0){s.classList.add("sy-end-has-body");const b=document.createElement("p");b.className="sy-end-body",b.textContent=x,s.appendChild(b)}if(p>0){const b=document.createElement("p");b.className="sy-end-score",b.setAttribute("data-testid","end-score"),b.textContent=`Score ${m} of ${p}`,s.appendChild(b)}if(p>0){const b=document.createElement("div");b.className="sy-end-stamps",b.setAttribute("aria-label",`${m} of ${p} stamp${p!==1?"s":""} earned`);const n=[-8,-5,-10,-6,-9,-4,-7];for(let d=0;d<p;d++){const h=document.createElement("span");if(d<m){h.className="sy-end-slot sy-end-slot-earned",h.textContent="✓";const k=(v=n[d%n.length])!=null?v:-8;h.style.transform=`rotate(${k}deg)`}else h.className="sy-end-slot sy-end-slot-empty";h.setAttribute("aria-hidden","true"),b.appendChild(h)}s.appendChild(b)}const f=u.trim().replace(/[.!?…]+$/,"");o.textContent=p>0?`${f}. Score ${m} of ${p}.`:`${f}.`;const g=(E=i.stack.cards[0])==null?void 0:E.id;if(g!==void 0){const b=document.createElement("div");b.className="sy-end-again";const n=document.createElement("button");n.className="sy-button sy-end-again-btn",n.setAttribute("data-testid","play-again"),n.textContent="Play Again",n.addEventListener("click",()=>{ue(i),a(g,!1)}),b.appendChild(n),s.appendChild(b)}for(const b of e.elements){if(b.type!=="button")continue;const n=document.createElement("div");n.style.marginTop="16px";const d=document.createElement("button");d.className="sy-button",d.style.width="auto",d.style.height="auto",d.textContent=b.label,d.addEventListener("click",()=>{M(b.actions,i,h=>a(h,!1),r)}),n.appendChild(d),s.appendChild(n)}t.appendChild(s)}function Ne(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function Te(e,t,i,a,r,o,m){var A,v,E,b;const p=e.elements.filter(n=>n.type==="text").filter(n=>!Q(n.content)),s=(v=(A=p[0])==null?void 0:A.content)!=null?v:"",y=(b=(E=p[1])==null?void 0:E.content)!=null?b:"";let l=e.elements.filter(n=>n.type==="button").map(n=>O(n,m));l.length===0&&m!==void 0&&H(e.actions)===null&&(l=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:m}]}]);const u=y.trim().length>0,c=document.createElement("div");c.className="sy-flash",u&&(c.setAttribute("role","button"),c.setAttribute("tabindex","0"),c.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(c);const x=e.elements.filter(n=>n.type==="image");for(const n of x){const d=document.createElement("div");d.className="sy-element",d.setAttribute("data-element-id",n.id),Z(d,n),d.style.pointerEvents="none";const h=document.createElement("img");h.setAttribute("src",n.src),h.setAttribute("alt",n.alt),h.className="sy-image",h.style.width="100%",h.style.height="100%",d.appendChild(h),t.appendChild(d)}let f="front";const g=()=>{if(c.innerHTML="",f==="front"){const n=document.createElement("p");if(n.className="sy-flash-term",n.textContent=s,z(n,j(s,704,200),44),c.appendChild(n),u){const d=document.createElement("p");d.className="sy-flash-hint",d.textContent="Tap the card to see the answer",c.appendChild(d)}o.textContent=s}else{const n=document.createElement("p");n.className="sy-flash-term-small",n.textContent=s,z(n,T(s,{w:704,h:88,maxSize:32,minSize:24,lineHeight:k=>Math.round(k*1.3)}),32),c.appendChild(n);const d=document.createElement("p");d.className="sy-flash-back",d.textContent=y,z(d,T(y,{w:704,h:280,maxSize:26,minSize:F,lineHeight:k=>Math.round(k*1.54)}),26),c.appendChild(d);const h=document.createElement("p");h.className="sy-flash-hint",h.textContent="Tap the card to flip back",c.appendChild(h),o.textContent=y?`${s}: ${y}`:s}if(f==="back"||!u)for(const n of l){const d=document.createElement("div");d.className="sy-flash-next";const h=document.createElement("button");h.className="sy-button",h.textContent=n.label,h.addEventListener("click",k=>{k.stopPropagation(),M(n.actions,i,L=>a(L,!1),r)}),d.appendChild(h),c.appendChild(d)}},w=()=>{u&&(f=f==="front"?"back":"front",g(),Ne()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation=`card-enter ${U}ms ease-out`))};c.addEventListener("click",w),c.addEventListener("keydown",n=>{(n.key==="Enter"||n.key===" "||n.key==="Spacebar")&&(n.preventDefault(),w())}),g()}function Ie(e,t,i,a,r=Fe,o={}){Ae();const m=Se();t.innerHTML="";const p=document.createElement("div");p.className="sy-card-stack";for(let n=1;n<=3;n++){const d=document.createElement("div");d.className=`sy-card-edge sy-card-edge-${n}`,p.appendChild(d)}const s=document.createElement("div");s.className="sy-card";const y=document.createElement("div");y.className="sy-ring-holes",y.setAttribute("aria-hidden","true");for(let n=0;n<2;n++){const d=document.createElement("div");d.className="sy-ring-hole",y.appendChild(d)}s.appendChild(y);const l=document.createElement("div");if(l.className="sy-rings",l.setAttribute("aria-hidden","true"),l.innerHTML=`<span class="sy-ring">${J}</span><span class="sy-ring">${J}</span>`,e.kind==="end"){ze(e,s,i,a,r,m),p.appendChild(s),p.appendChild(l),t.appendChild(p);return}if(typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const n=document.createElement("div");n.className="sy-meta-chrome";const d=document.createElement("p");d.className="sy-meta",d.textContent=`Card ${o.position} of ${o.total}`,n.appendChild(d),s.appendChild(n)}const u=i.variables.score,c=i.variables._answered,x=Y(i.stack)>0,f=typeof c=="number"&&c>0||typeof u=="number"&&u>0;if(typeof u=="number"&&x&&f){const n=document.createElement("div");n.className="sy-score-chrome",n.setAttribute("aria-label",`Score ${u}`),n.textContent=`Score ${u}`,s.appendChild(n)}if(e.kind==="flash"){const n=e.elements.filter(k=>k.type==="text"&&!Q(k.content)),d=e.elements.filter(k=>k.type==="button");if(n.length>=2||d.length>=1){Te(e,s,i,a,r,m,o.nextCardId),p.appendChild(s),p.appendChild(l),t.appendChild(p);return}}const g=e.kind==="quiz",w=g?e.elements.filter(n=>n.type==="button"&&n.actions.length>0):[];let A=0;const v=Re(e.elements.filter(n=>n.type==="button"&&!(g&&n.actions.length>0)));let E=!1,b=!1;for(const n of e.elements){const d=document.createElement("div");switch(d.className="sy-element",d.setAttribute("data-element-id",n.id),Z(d,n),n.type){case"text":{const h=document.createElement("p"),k=(g||e.kind==="flash")&&!E,L=e.kind==="story"&&!b;h.className=k?"sy-question":L?"sy-story":"sy-text",k&&(E=!0),L&&(b=!0),h.textContent=n.content,k?z(h,j(n.content,n.w,n.h),44):L?z(h,V(n.content,n.w,n.h,X),X):z(h,V(n.content,n.w,n.h),22),d.appendChild(h);break}case"button":{const h=g&&n.actions.length>0,k=te(O(n,o.nextCardId),h,w.length,h?A:0,i,a,r,m,h?void 0:v);d.appendChild(k),h&&A++;break}case"image":{const h=document.createElement("img");h.setAttribute("src",n.src),h.setAttribute("alt",n.alt),h.className="sy-image",h.style.width="100%",h.style.height="100%",d.appendChild(h);break}case"field":{const h=document.createElement("span");h.className="sy-field";const k=i.variables[n.variable];h.textContent=k!==void 0?String(k):"",d.appendChild(h);break}}s.appendChild(d)}if(o.nextCardId!==void 0&&H(e.actions)===null&&!e.elements.some(n=>n.type==="button")){const n=document.createElement("div");n.className="sy-element";const d={x:408,y:496,w:344,h:72};n.style.left=`${d.x}px`,n.style.top=`${d.y}px`,n.style.width=`${d.w}px`,n.style.height=`${d.h}px`;const h=O({type:"button",id:"sy-next",...d,label:"Next Card",actions:[]},o.nextCardId);n.appendChild(te(h,!1,0,0,i,a,r,m)),s.appendChild(n)}p.appendChild(s),p.appendChild(l),t.appendChild(p)}function Z(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function ee(e){return T(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:F,lineHeight:t=>Math.round(t*1.15),charWidth:.56})}function Re(e){if(!(e.length<2))return e.map(ee).reduce((t,i)=>i.size<t.size?i:t)}function te(e,t,i,a,r,o,m,p,s){const y=t?be[a%4]:void 0,l=document.createElement("button");if(y){l.className="sy-tile",l.style.backgroundColor=y.color,l.style.color=y.textColor,e.actions.some(x=>x.type==="score"&&x.delta>0)&&l.setAttribute("data-correct","true");const u=document.createElement("span");u.className="sy-tile-shape",u.style.color=y.textColor,Ee(u,y.shapePath),l.appendChild(u);const c=document.createElement("span");c.className="sy-tile-label",c.textContent=e.label,z(c,me(e.label,e.w,e.h),32),l.appendChild(c)}else l.className="sy-button",l.textContent=e.label,z(l,s!=null?s:ee(e),32);return l.addEventListener("click",()=>{Le(l,e,y,r,o,m,p)}),l}function Le(e,t,i,a,r,o,m){const p=t.actions.some(c=>c.type==="score"&&c.delta>0),s=e.closest(".sy-card"),y=t.actions.some(c=>c.type==="goto");s&&(i!==void 0||y)&&s.querySelectorAll(".sy-tile, .sy-button").forEach(c=>{c.disabled=!0});const l=t.actions.find(c=>c.type==="goto"),u=t.actions.filter(c=>c.type!=="goto");if(t.actions.some(c=>c.type==="score")){const c=a.variables._answered;a.variables._answered=(typeof c=="number"?c:0)+1}if(M(u,a,Be,o),i)if(p)$e(e,m),t.actions.some(x=>x.type==="sound")||o("cheer"),setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},ve);else{if(Me(e),t.actions.some(x=>x.type==="sound")||o("buzz"),s){const x=s.querySelector('.sy-tile[data-correct="true"]');if(x&&x!==e&&(x.classList.add("sy-tile-reveal"),!x.querySelector(".sy-reveal-mark"))){const f=document.createElement("span");f.className="sy-reveal-mark",f.textContent="✓ Right answer",f.setAttribute("aria-hidden","true"),x.appendChild(f)}}setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},we)}else l&&l.type==="goto"&&r(l.cardId,!1)}function $e(e,t){const i=document.createElement("span");i.className="sy-stamp sy-stamp-animate",i.textContent="CORRECT ✓",i.setAttribute("aria-hidden","true"),e.appendChild(i),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function Me(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const i=document.createElement("span");i.className="sy-wrong-stamp",i.textContent="✗",i.setAttribute("aria-hidden","true"),e.appendChild(i)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function Fe(e){}function Be(e){}function qe(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function i(){const r=window.innerWidth,o=window.innerHeight,m=Math.min(r*.9/800,o*.9/600);e.style.transform=`scale(${m})`}i();const a=new ResizeObserver(i);return a.observe(document.body),function(){a.disconnect()}}function ne(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const i=new t,a=i.createOscillator(),r=i.createGain();a.connect(r),r.connect(i.destination);const o=i.currentTime,m=.5;e==="cheer"?(a.type="triangle",a.frequency.setValueAtTime(440,o),a.frequency.linearRampToValueAtTime(880,o+m),r.gain.setValueAtTime(0,o),r.gain.linearRampToValueAtTime(.3,o+.05),r.gain.linearRampToValueAtTime(0,o+m)):(a.type="sawtooth",a.frequency.setValueAtTime(150,o),r.gain.setValueAtTime(.3,o),r.gain.linearRampToValueAtTime(0,o+m)),a.start(o),a.stop(o+m),a.onended=()=>{try{i.close()}catch(p){}}}catch(t){}}function I(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const ie=ke;function oe(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function He(e,t,i={}){var l;const a=pe(e);i.startCardId!==void 0&&e.cards.some(u=>u.id===i.startCardId)&&(a.currentCardId=i.startCardId);const o=((l=i.scaler)!=null?l:qe)(t);t.style.perspective="1200px";const m=i.flip!==!1;let p=null;function s(u,c){var A;const x=e.cards.find(v=>v.id===u);if(!x){I(t);return}a.currentCardId=u;const f=e.cards.findIndex(v=>v.id===u),g=f>=0&&x.kind!=="end"?(A=e.cards[f+1])!=null?A:e.cards.find(v=>v.kind==="end"):void 0,w=f>=0?{position:f+1,total:e.cards.length,...g!==void 0&&g.id!==x.id?{nextCardId:g.id}:{}}:{};if(Ie(x,t,a,y,ne,w),m&&!oe()){const v=t.querySelector(".sy-card");v&&(v.style.transformOrigin="top center",v.style.animation=`card-enter ${U}ms ease-out`)}M(x.actions,a,v=>y(v,!0),ne)}function y(u,c){if(c){if(a.autoNavCount++,a.autoNavCount>20){I(t);return}}else a.autoNavCount=0;if(!e.cards.some(f=>f.id===u)){I(t);return}const x=t.querySelector(".sy-card");m&&!c&&!oe()&&x?(x.style.transformOrigin="top center",x.style.animation=`card-exit ${ie}ms ease-out forwards`,p!==null&&clearTimeout(p),p=setTimeout(()=>{p=null,s(u)},ie)):s(u)}return s(a.currentCardId),function(){p!==null&&(clearTimeout(p),p=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const i=document.getElementById("stack-data");if(!i){I(e);return}const a=(t=i.textContent)!=null?t:"",r=JSON.parse(a),o=de(r);if(!o.valid){I(e);return}He(o.stack,e)}catch(i){I(e)}})})();
