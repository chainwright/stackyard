(function(){"use strict";function R(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function S(e){return typeof e=="string"}function N(e){return typeof e=="number"}function L(e){return Array.isArray(e)}function _(e){if(!R(e))return null;const t=e.type;return t==="goto"&&S(e.cardId)?{type:"goto",cardId:e.cardId}:t==="score"&&N(e.delta)?{type:"score",delta:e.delta}:t==="sound"&&(e.sound==="cheer"||e.sound==="buzz")?{type:"sound",sound:e.sound}:t==="set"&&S(e.variable)&&(S(e.value)||N(e.value))?{type:"set",variable:e.variable,value:e.value}:null}function ie(e){if(!R(e))return null;const{type:t,id:n,x:a,y:r,w:o,h}=e;if(!S(n)||!N(a)||!N(r)||!N(o)||!N(h))return null;if(t==="text"&&S(e.content))return{type:"text",id:n,x:a,y:r,w:o,h,content:e.content};if(t==="button"&&S(e.label)&&L(e.actions)){const d=[];for(const s of e.actions){const y=_(s);if(y===null)return null;d.push(y)}return{type:"button",id:n,x:a,y:r,w:o,h,label:e.label,actions:d}}return t==="image"&&S(e.src)&&S(e.alt)?{type:"image",id:n,x:a,y:r,w:o,h,src:e.src,alt:e.alt}:t==="field"&&S(e.variable)?{type:"field",id:n,x:a,y:r,w:o,h,variable:e.variable}:null}function oe(e){if(!R(e))return null;const{id:t,kind:n,elements:a,actions:r}=e;if(!S(t)||n!=="quiz"&&n!=="flash"&&n!=="story"&&n!=="end"||!L(a)||!L(r))return null;const o=[];for(const d of a){const s=ie(d);if(s===null)return null;o.push(s)}const h=[];for(const d of r){const s=_(d);if(s===null)return null;h.push(s)}return{id:t,kind:n,elements:o,actions:h}}function ae(e){if(!R(e))return null;const{id:t,title:n,theme:a,cards:r}=e;if(!S(t)||!S(n)||!R(a))return null;const{background:o,foreground:h,font:d}=a;if(!S(o)||!S(h)||!S(d)||!L(r))return null;const s=[];for(const y of r){const l=oe(y);if(l===null)return null;s.push(l)}return{id:t,title:n,theme:{background:o,foreground:h,font:d},cards:s}}const se=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function F(e){return se.test(e)}function P(e){return e.filter(t=>t.type==="goto").map(t=>t.cardId)}function G(e){return e.elements.filter(t=>t.type==="button")}function W(e){return e.actions.some(t=>t.type==="score"&&t.delta===1)}function re(e){var g;const t=[],n=new Set,a=u=>n.has(u)?!1:(n.add(u),!0);a(e.id)||t.push("duplicate-id");for(const u of e.cards){!a(u.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id");for(const x of u.elements)!a(x.id)&&!t.includes("duplicate-id")&&t.push("duplicate-id")}const r=new Set(e.cards.map(u=>u.id));let o=!1;for(const u of e.cards){for(const x of P(u.actions))if(!r.has(x)){o=!0;break}if(o)break;for(const x of G(u)){for(const w of P(x.actions))if(!r.has(w)){o=!0;break}if(o)break}if(o)break}o&&t.push("invalid-goto"),e.cards.filter(u=>u.kind==="end").length!==1&&t.push("end-card-count");for(const u of e.cards){if(u.kind!=="quiz")continue;const x=G(u),w=x.filter(W).length,C=x.filter(v=>!W(v)).length;if(w!==1||C<1){t.push("quiz-answer");break}}let d=!1;for(const u of e.cards){for(const x of u.elements)if(x.x+x.w>800||x.y+x.h>600){d=!0;break}if(d)break}d&&t.push("canvas-bounds"),e.title.trim()===""&&t.push("blank-title"),e.cards.filter(u=>u.kind!=="end").length<1&&t.push("no-content-cards");let y=!1;if(F(e.id)||(y=!0),!y)for(const u of e.cards){if(!F(u.id)){y=!0;break}for(const x of u.elements)if(!F(x.id)){y=!0;break}if(y)break}y&&t.push("invalid-id");const l=new Map;for(const u of e.cards){const x=[];for(const w of u.actions)w.type==="goto"&&r.has(w.cardId)&&x.push(w.cardId);l.set(u.id,x)}const p=new Map;for(const u of e.cards)p.set(u.id,0);let c=!1;for(const u of e.cards){if(p.get(u.id)!==0||c)continue;const x=[];for(p.set(u.id,1),x.push({id:u.id,nextIdx:0});x.length>0&&!c;){const w=x[x.length-1],C=(g=l.get(w.id))!=null?g:[];if(w.nextIdx<C.length){const v=C[w.nextIdx];w.nextIdx++;const E=p.get(v);E===1?c=!0:E===0&&(p.set(v,1),x.push({id:v,nextIdx:0}))}else p.set(w.id,2),x.pop()}}return c&&t.push("goto-cycle"),t}function le(e){const t=ae(e);if(t===null)return{valid:!1,errors:["invalid-shape"]};const n=re(t);return n.length>0?{valid:!1,errors:n}:{valid:!0,stack:t}}function ce(e){return{stack:e,variables:{score:0},currentCardId:e.cards[0].id,autoNavCount:0}}function de(e){e.variables={score:0},e.autoNavCount=0}function $(e,t,n,a=pe){for(const r of e)switch(r.type){case"goto":{n(r.cardId);return}case"score":{const o=t.variables.score;t.variables.score=(typeof o=="number"?o:0)+r.delta;break}case"set":{t.variables[r.variable]=r.value;break}case"sound":{a(r.sound);break}}}function pe(e){}function B(e,t,n,a=.54){const r=n*a;if(t<=0||r<=0)return 1;let o=0;for(const h of e.split(`
`)){const d=h.split(/\s+/).filter(l=>l.length>0);if(d.length===0){o+=1;continue}let s=0,y=1;for(const l of d){const p=l.length*r;if(p>t){s>0&&(y+=1);const g=Math.ceil(p/t)-1;y+=g,s=p-g*t;continue}const c=s===0?p:s+r+p;c>t?(y+=1,s=p):s=c}o+=y}return Math.max(1,o)}function T(e,t){var d,s,y;const n=(d=t.step)!=null?d:2,a=(s=t.lineHeight)!=null?s:l=>Math.round(l*1.3),r=(y=t.charWidth)!=null?y:.54;let o=null;for(let l=t.maxSize;l>=t.minSize;l-=n){const p=B(e,t.w,l,r),c=a(l),g=p*c<=t.h&&(t.maxLines===void 0||p<=t.maxLines);if(o={size:l,lineHeight:c,lines:p,fits:g},g)return o}if(o!==null){const l=t.minSize,p=B(e,t.w,l,r);return{size:l,lineHeight:a(l),lines:p,fits:!1}}const h=t.minSize;return{size:h,lineHeight:a(h),lines:B(e,t.w,h,r),fits:!1}}const M=20;function ue(e){return e>=44?64:Math.round(e*1.3)}function j(e,t,n){return T(e,{w:t,h:n,maxSize:44,minSize:24,lineHeight:ue})}const X=30;function V(e,t,n,a=22){return T(e,{w:t,h:n,maxSize:a,minSize:M,lineHeight:r=>Math.round(r*1.5)})}function fe(e,t,n){return T(e,{w:Math.max(40,t-40-28-12),h:Math.max(24,n-12),maxSize:32,minSize:M,lineHeight:a=>Math.round(a*1.15),maxLines:3,charWidth:.56})}function q(e){for(const t of e)if(t.type==="goto")return t.cardId;return null}const he=e=>e.toLowerCase().replace(/[^a-z ]+/g," ").replace(/\s+/g," ").trim();function me(e){return/^(well done|well done you finished|well done you have finished|great job|you did it)$/.test(he(e))}function H(e,t){return t===void 0||q(e.actions)!==null?e:{...e,actions:[...e.actions,{type:"goto",cardId:t}]}}function z(e,t,n){t.size!==n&&(e.style.fontSize=`${t.size}px`,e.style.lineHeight=`${t.lineHeight}px`)}const Q='<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true"><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/><ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/><ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/></svg>',k={paper:"#FBF8F1",ink:"#1E2A47",rule:"#C9D3E3",stamp:"#CE3926",tileA:"#F2735F",tileB:"#F6C744",tileC:"#26A69A",tileD:"#1E2A47",white:"#FFFFFF"},ye=[{color:k.tileA,textColor:k.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>'},{color:k.tileB,textColor:k.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>'},{color:k.tileC,textColor:k.ink,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>'},{color:k.tileD,textColor:k.white,shapePath:'<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>'}],ge=900,xe=600,be=180,J=360,ve=`
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${k.paper};
  --color-ink:     ${k.ink};
  --color-rule:    ${k.rule};
  --color-stamp:   ${k.stamp};
  --color-tile-a:  ${k.tileA};
  --color-tile-b:  ${k.tileB};
  --color-tile-c:  ${k.tileC};
  --color-tile-d:  ${k.tileD};
  --color-white:   ${k.white};
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
`;let U=!1;function we(){if(U)return;const e=document.createElement("style");e.textContent=ve,document.head.appendChild(e),U=!0}let O=null;function ke(){if(O)return O;const e=document.createElement("div");return e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sy-sr-only",document.body.appendChild(e),O=e,e}function Ce(e,t){e.innerHTML=t}function K(e){return e.cards.filter(t=>t.kind==="quiz").length}function Ae(e,t,n,a,r,o){var w,C,v,E;const h=typeof n.variables.score=="number"?n.variables.score:0,d=K(n.stack),s=document.createElement("div");s.className="sy-end-card";const y=e.elements.filter(f=>f.type==="text"),l=y[0];let p=l?l.content:"Well done!";d>0&&h===0&&me(p)&&(p="You finished!");const c=document.createElement("h1");c.className="sy-end-heading",c.textContent=p,s.appendChild(c);const g=(C=(w=y[1])==null?void 0:w.content.trim())!=null?C:"";if(g.length>0){s.classList.add("sy-end-has-body");const f=document.createElement("p");f.className="sy-end-body",f.textContent=g,s.appendChild(f)}if(d>0){const f=document.createElement("p");f.className="sy-end-score",f.setAttribute("data-testid","end-score"),f.textContent=`Score ${h} of ${d}`,s.appendChild(f)}if(d>0){const f=document.createElement("div");f.className="sy-end-stamps",f.setAttribute("aria-label",`${h} of ${d} stamp${d!==1?"s":""} earned`);const i=[-8,-5,-10,-6,-9,-4,-7];for(let m=0;m<d;m++){const b=document.createElement("span");if(m<h){b.className="sy-end-slot sy-end-slot-earned",b.textContent="✓";const A=(v=i[m%i.length])!=null?v:-8;b.style.transform=`rotate(${A}deg)`}else b.className="sy-end-slot sy-end-slot-empty";b.setAttribute("aria-hidden","true"),f.appendChild(b)}s.appendChild(f)}const u=p.trim().replace(/[.!?…]+$/,"");o.textContent=d>0?`${u}. Score ${h} of ${d}.`:`${u}.`;const x=(E=n.stack.cards[0])==null?void 0:E.id;if(x!==void 0){const f=document.createElement("div");f.className="sy-end-again";const i=document.createElement("button");i.className="sy-button sy-end-again-btn",i.setAttribute("data-testid","play-again"),i.textContent="Play Again",i.addEventListener("click",()=>{de(n),a(x,!1)}),f.appendChild(i),s.appendChild(f)}for(const f of e.elements){if(f.type!=="button")continue;const i=document.createElement("div");i.style.marginTop="16px";const m=document.createElement("button");m.className="sy-button",m.style.width="auto",m.style.height="auto",m.textContent=f.label,m.addEventListener("click",()=>{$(f.actions,n,b=>a(b,!1),r)}),i.appendChild(m),s.appendChild(i)}t.appendChild(s)}function Se(){try{return!(typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch(e){return!0}}function Ee(e,t,n,a,r,o,h){var w,C,v,E;const d=e.elements.filter(f=>f.type==="text"),s=(C=(w=d[0])==null?void 0:w.content)!=null?C:"",y=(E=(v=d[1])==null?void 0:v.content)!=null?E:"";let l=e.elements.filter(f=>f.type==="button").map(f=>H(f,h));l.length===0&&h!==void 0&&q(e.actions)===null&&(l=[{type:"button",id:"sy-next",x:408,y:496,w:344,h:72,label:"Next Card",actions:[{type:"goto",cardId:h}]}]);const p=y.trim().length>0,c=document.createElement("div");c.className="sy-flash",p&&(c.setAttribute("role","button"),c.setAttribute("tabindex","0"),c.setAttribute("aria-label","Flash card. Tap to flip between the word and its explanation.")),t.appendChild(c);let g="front";const u=()=>{if(c.innerHTML="",g==="front"){const f=document.createElement("p");if(f.className="sy-flash-term",f.textContent=s,z(f,j(s,704,200),44),c.appendChild(f),p){const i=document.createElement("p");i.className="sy-flash-hint",i.textContent="Tap the card to see the answer",c.appendChild(i)}o.textContent=s}else{const f=document.createElement("p");f.className="sy-flash-term-small",f.textContent=s,z(f,T(s,{w:704,h:88,maxSize:32,minSize:24,lineHeight:b=>Math.round(b*1.3)}),32),c.appendChild(f);const i=document.createElement("p");i.className="sy-flash-back",i.textContent=y,z(i,T(y,{w:704,h:280,maxSize:26,minSize:M,lineHeight:b=>Math.round(b*1.54)}),26),c.appendChild(i);const m=document.createElement("p");m.className="sy-flash-hint",m.textContent="Tap the card to flip back",c.appendChild(m),o.textContent=y?`${s}: ${y}`:s}if(g==="back"||!p)for(const f of l){const i=document.createElement("div");i.className="sy-flash-next";const m=document.createElement("button");m.className="sy-button",m.textContent=f.label,m.addEventListener("click",b=>{b.stopPropagation(),$(f.actions,n,A=>a(A,!1),r)}),i.appendChild(m),c.appendChild(i)}},x=()=>{p&&(g=g==="front"?"back":"front",u(),Se()&&(t.style.transformOrigin="top center",t.style.animation="none",t.offsetWidth,t.style.animation=`card-enter ${J}ms ease-out`))};c.addEventListener("click",x),c.addEventListener("keydown",f=>{(f.key==="Enter"||f.key===" "||f.key==="Spacebar")&&(f.preventDefault(),x())}),u()}function ze(e,t,n,a,r=$e,o={}){we();const h=ke();t.innerHTML="";const d=document.createElement("div");d.className="sy-card-stack";for(let i=1;i<=3;i++){const m=document.createElement("div");m.className=`sy-card-edge sy-card-edge-${i}`,d.appendChild(m)}const s=document.createElement("div");s.className="sy-card";const y=document.createElement("div");y.className="sy-ring-holes",y.setAttribute("aria-hidden","true");for(let i=0;i<2;i++){const m=document.createElement("div");m.className="sy-ring-hole",y.appendChild(m)}s.appendChild(y);const l=document.createElement("div");if(l.className="sy-rings",l.setAttribute("aria-hidden","true"),l.innerHTML=`<span class="sy-ring">${Q}</span><span class="sy-ring">${Q}</span>`,e.kind==="end"){Ae(e,s,n,a,r,h),d.appendChild(s),d.appendChild(l),t.appendChild(d);return}if(typeof o.position=="number"&&typeof o.total=="number"&&o.total>0){const i=document.createElement("div");i.className="sy-meta-chrome";const m=document.createElement("p");m.className="sy-meta",m.textContent=`Card ${o.position} of ${o.total}`,i.appendChild(m),s.appendChild(i)}const p=n.variables.score,c=n.variables._answered,g=K(n.stack)>0,u=typeof c=="number"&&c>0||typeof p=="number"&&p>0;if(typeof p=="number"&&g&&u){const i=document.createElement("div");i.className="sy-score-chrome",i.setAttribute("aria-label",`Score ${p}`),i.textContent=`Score ${p}`,s.appendChild(i)}if(e.kind==="flash"){const i=e.elements.filter(A=>A.type==="text"),m=e.elements.filter(A=>A.type==="button");if(i.length>=2||m.length>=1){Ee(e,s,n,a,r,h,o.nextCardId),d.appendChild(s),d.appendChild(l),t.appendChild(d);return}}const x=e.kind==="quiz",w=x?e.elements.filter(i=>i.type==="button"&&i.actions.length>0):[];let C=0;const v=Te(e.elements.filter(i=>i.type==="button"&&!(x&&i.actions.length>0)));let E=!1,f=!1;for(const i of e.elements){const m=document.createElement("div");switch(m.className="sy-element",Ne(m,i),i.type){case"text":{const b=document.createElement("p"),A=(x||e.kind==="flash")&&!E,D=e.kind==="story"&&!f;b.className=A?"sy-question":D?"sy-story":"sy-text",A&&(E=!0),D&&(f=!0),b.textContent=i.content,A?z(b,j(i.content,i.w,i.h),44):D?z(b,V(i.content,i.w,i.h,X),X):z(b,V(i.content,i.w,i.h),22),m.appendChild(b);break}case"button":{const b=x&&i.actions.length>0,A=Z(H(i,o.nextCardId),b,w.length,b?C:0,n,a,r,h,b?void 0:v);m.appendChild(A),b&&C++;break}case"image":{const b=document.createElement("img");b.setAttribute("src",i.src),b.setAttribute("alt",i.alt),b.className="sy-image",b.style.width="100%",b.style.height="100%",m.appendChild(b);break}case"field":{const b=document.createElement("span");b.className="sy-field";const A=n.variables[i.variable];b.textContent=A!==void 0?String(A):"",m.appendChild(b);break}}s.appendChild(m)}if(o.nextCardId!==void 0&&q(e.actions)===null&&!e.elements.some(i=>i.type==="button")){const i=document.createElement("div");i.className="sy-element";const m={x:408,y:496,w:344,h:72};i.style.left=`${m.x}px`,i.style.top=`${m.y}px`,i.style.width=`${m.w}px`,i.style.height=`${m.h}px`;const b=H({type:"button",id:"sy-next",...m,label:"Next Card",actions:[]},o.nextCardId);i.appendChild(Z(b,!1,0,0,n,a,r,h)),s.appendChild(i)}d.appendChild(s),d.appendChild(l),t.appendChild(d)}function Ne(e,t){e.style.left=`${t.x}px`,e.style.top=`${t.y}px`,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`}function Y(e){return T(e.label,{w:Math.max(40,e.w-36),h:Math.max(24,e.h-20),maxSize:32,minSize:M,lineHeight:t=>Math.round(t*1.15),charWidth:.56})}function Te(e){if(!(e.length<2))return e.map(Y).reduce((t,n)=>n.size<t.size?n:t)}function Z(e,t,n,a,r,o,h,d,s){const y=t?ye[a%4]:void 0,l=document.createElement("button");if(y){l.className="sy-tile",l.style.backgroundColor=y.color,l.style.color=y.textColor,e.actions.some(g=>g.type==="score"&&g.delta>0)&&l.setAttribute("data-correct","true");const p=document.createElement("span");p.className="sy-tile-shape",p.style.color=y.textColor,Ce(p,y.shapePath),l.appendChild(p);const c=document.createElement("span");c.className="sy-tile-label",c.textContent=e.label,z(c,fe(e.label,e.w,e.h),32),l.appendChild(c)}else l.className="sy-button",l.textContent=e.label,z(l,s!=null?s:Y(e),32);return l.addEventListener("click",()=>{Ie(l,e,y,r,o,h,d)}),l}function Ie(e,t,n,a,r,o,h){const d=t.actions.some(c=>c.type==="score"&&c.delta>0),s=e.closest(".sy-card"),y=t.actions.some(c=>c.type==="goto");s&&(n!==void 0||y)&&s.querySelectorAll(".sy-tile, .sy-button").forEach(c=>{c.disabled=!0});const l=t.actions.find(c=>c.type==="goto"),p=t.actions.filter(c=>c.type!=="goto");if(t.actions.some(c=>c.type==="score")){const c=a.variables._answered;a.variables._answered=(typeof c=="number"?c:0)+1}if($(p,a,Me,o),n)if(d)Re(e,h),t.actions.some(g=>g.type==="sound")||o("cheer"),setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},ge);else{if(Le(e),t.actions.some(g=>g.type==="sound")||o("buzz"),s){const g=s.querySelector('.sy-tile[data-correct="true"]');if(g&&g!==e&&(g.classList.add("sy-tile-reveal"),!g.querySelector(".sy-reveal-mark"))){const u=document.createElement("span");u.className="sy-reveal-mark",u.textContent="✓ Right answer",u.setAttribute("aria-hidden","true"),g.appendChild(u)}}setTimeout(()=>{l&&l.type==="goto"&&r(l.cardId,!1)},xe)}else l&&l.type==="goto"&&r(l.cardId,!1)}function Re(e,t){const n=document.createElement("span");n.className="sy-stamp sy-stamp-animate",n.textContent="CORRECT ✓",n.setAttribute("aria-hidden","true"),e.appendChild(n),t.textContent="",requestAnimationFrame(()=>{t.textContent="Correct"})}function Le(e){e.classList.remove("sy-tile-shake"),e.offsetWidth,e.classList.add("sy-tile-shake");const t=()=>{if(e.querySelector(".sy-wrong-stamp"))return;const n=document.createElement("span");n.className="sy-wrong-stamp",n.textContent="✗",n.setAttribute("aria-hidden","true"),e.appendChild(n)};e.addEventListener("animationend",t,{once:!0}),setTimeout(t,200)}function $e(e){}function Me(e){}function Fe(e){const t=document.body;t.style.margin="0",t.style.padding="0",t.style.width="100vw",t.style.height="100vh",t.style.display="flex",t.style.alignItems="center",t.style.justifyContent="center",t.style.overflow="hidden",t.style.background="#C9A47C",t.style.backgroundImage="repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)",e.style.width="800px",e.style.height="600px",e.style.position="relative",e.style.flexShrink="0",e.style.transformOrigin="center center";function n(){const r=window.innerWidth,o=window.innerHeight,h=Math.min(r*.9/800,o*.9/600);e.style.transform=`scale(${h})`}n();const a=new ResizeObserver(n);return a.observe(document.body),function(){a.disconnect()}}function ee(e){try{const t=typeof AudioContext!="undefined"?AudioContext:window.webkitAudioContext;if(!t)return;const n=new t,a=n.createOscillator(),r=n.createGain();a.connect(r),r.connect(n.destination);const o=n.currentTime,h=.5;e==="cheer"?(a.type="triangle",a.frequency.setValueAtTime(440,o),a.frequency.linearRampToValueAtTime(880,o+h),r.gain.setValueAtTime(0,o),r.gain.linearRampToValueAtTime(.3,o+.05),r.gain.linearRampToValueAtTime(0,o+h)):(a.type="sawtooth",a.frequency.setValueAtTime(150,o),r.gain.setValueAtTime(.3,o),r.gain.linearRampToValueAtTime(0,o+h)),a.start(o),a.stop(o+h),a.onended=()=>{try{n.close()}catch(d){}}}catch(t){}}function I(e){e.innerHTML="";const t=document.createElement("p");t.textContent="Something went wrong. Please ask your teacher to check the file.",e.appendChild(t)}const te=be;function ne(){try{return typeof window!="undefined"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return!1}}function Be(e,t,n={}){var l;const a=ce(e);n.startCardId!==void 0&&e.cards.some(p=>p.id===n.startCardId)&&(a.currentCardId=n.startCardId);const o=((l=n.scaler)!=null?l:Fe)(t);t.style.perspective="1200px";const h=n.flip!==!1;let d=null;function s(p,c){var C;const g=e.cards.find(v=>v.id===p);if(!g){I(t);return}a.currentCardId=p;const u=e.cards.findIndex(v=>v.id===p),x=u>=0&&g.kind!=="end"?(C=e.cards[u+1])!=null?C:e.cards.find(v=>v.kind==="end"):void 0,w=u>=0?{position:u+1,total:e.cards.length,...x!==void 0&&x.id!==g.id?{nextCardId:x.id}:{}}:{};if(ze(g,t,a,y,ee,w),h&&!ne()){const v=t.querySelector(".sy-card");v&&(v.style.transformOrigin="top center",v.style.animation=`card-enter ${J}ms ease-out`)}$(g.actions,a,v=>y(v,!0),ee)}function y(p,c){if(c){if(a.autoNavCount++,a.autoNavCount>20){I(t);return}}else a.autoNavCount=0;if(!e.cards.some(u=>u.id===p)){I(t);return}const g=t.querySelector(".sy-card");h&&!c&&!ne()&&g?(g.style.transformOrigin="top center",g.style.animation=`card-exit ${te}ms ease-out forwards`,d!==null&&clearTimeout(d),d=setTimeout(()=>{d=null,s(p)},te)):s(p)}return s(a.currentCardId),function(){d!==null&&(clearTimeout(d),d=null),o(),t.style.perspective="",t.innerHTML=""}}document.addEventListener("DOMContentLoaded",()=>{var t;const e=document.getElementById("player-root");if(e)try{const n=document.getElementById("stack-data");if(!n){I(e);return}const a=(t=n.textContent)!=null?t:"",r=JSON.parse(a),o=le(r);if(!o.valid){I(e);return}Be(o.stack,e)}catch(n){I(e)}})})();
