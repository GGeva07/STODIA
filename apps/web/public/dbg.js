(function () {
  const W = window;
  const rgb = s => s.replace(/rgba?\(|\)| /g, '');
  W.sl = ms => new Promise(r => setTimeout(r, ms));
  W.hs = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  W.dump = function (root) {
    const m = root || document.querySelector('main'); const mr = m.getBoundingClientRect(); const cs = getComputedStyle(m);
    const ox = mr.x + parseFloat(cs.paddingLeft), oy = mr.y + parseFloat(cs.paddingTop) - m.scrollTop;
    const out = []; const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let n, acc = null;
    const flush = () => { if (acc) { const c = getComputedStyle(acc.e); out.push([acc.t.slice(0, 40), Math.round(acc.x1 - ox), Math.round(acc.y1 - oy), Math.round(acc.x2 - acc.x1), Math.round(acc.y2 - acc.y1), c.fontSize, c.fontWeight, rgb(c.color)].join('|')); acc = null; } };
    while ((n = w.nextNode())) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
      const e = n.parentElement; const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (b.width === 0) continue;
      if (acc && acc.e === e && Math.abs(b.y - acc.y1) < 4) { acc.t += ' ' + t; acc.x2 = Math.max(acc.x2, b.right); acc.y2 = Math.max(acc.y2, b.bottom); }
      else { flush(); acc = { e, t, x1: b.x, y1: b.y, x2: b.right, y2: b.bottom }; }
    }
    flush(); return out.join('\n');
  };
  W.boxes = function (root) {
    const m = root || document.querySelector('main'); const mr = m.getBoundingClientRect(); const cs = getComputedStyle(m);
    const ox = mr.x + parseFloat(cs.paddingLeft), oy = mr.y + parseFloat(cs.paddingTop) - m.scrollTop; const out = [];
    m.querySelectorAll('*').forEach(e => {
      const c = getComputedStyle(e); const r = e.getBoundingClientRect(); if (r.width === 0) return;
      const bg = c.backgroundColor !== 'rgba(0, 0, 0, 0)'; const bd = c.borderTopWidth !== '0px' && c.borderTopStyle !== 'none';
      if (bg || bd) out.push([e.tagName, Math.round(r.x - ox), Math.round(r.y - oy), Math.round(r.width), Math.round(r.height), bg ? rgb(c.backgroundColor) : '-', bd ? c.borderTopWidth + ' ' + rgb(c.borderTopColor) : '-', c.borderRadius.replace(/9999px/g, '999px')].join('|'));
    });
    return out.join('\n');
  };
  W.tx = () => document.querySelector('main').innerText.replace(/\n+/g, ' ¦ ');
  W.clk = (t, sc) => { const e = [...document.querySelectorAll(sc || 'nav *, aside *')].filter(x => x.children.length < 4 && x.textContent.trim() === t).pop(); if (e) { e.click(); return 'ok'; } return 'none'; };
  W.clkT = (t, sc) => { const e = [...document.querySelectorAll(sc || 'body *')].filter(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === t)).pop(); if (e) { e.click(); return 'ok'; } return 'none'; };
  W.ovl = () => { let best = null, bz = -1; document.querySelectorAll('body *').forEach(e => { const c = getComputedStyle(e); if (c.position === 'fixed') { const r = e.getBoundingClientRect(); if (r.width > 300 && r.height > 300) { const z = parseInt(c.zIndex) || 0; if (z >= bz) { bz = z; best = e; } } } }); return best; };
  W.H = root => { const d = W.dump(root).split('\n'), b = W.boxes(root).split('\n'); return 'T' + d.length + ':' + W.hs(d.join('\n')) + ' B' + b.length + ':' + W.hs(b.join('\n')) + ' | ' + d.map(l => W.hs(l).slice(-2)).join('') + ' | ' + b.map(l => W.hs(l).slice(-2)).join(''); };
  W.L = (root, i, j, k) => { const d = W.dump(root).split('\n'), b = W.boxes(root).split('\n'); return (k === 'b' ? b : d).slice(i, j).join('\n'); };
  W.byText = t => [...document.querySelectorAll('body *')].filter(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === t));
})();
(function () {
  const W = window;
  // Compara con el H() de la demo (pegar su cadena). Devuelve índices de líneas distintas (texto y cajas) con el contenido web.
  W.D = (hstr, root) => {
    const parts = hstr.split(' | '); const dt = parts[1], db = parts[2];
    const d = W.dump(root).split('\n'), b = W.boxes(root).split('\n');
    const my = d.map(l => W.hs(l).slice(-2)), mb = b.map(l => W.hs(l).slice(-2));
    const o = [];
    const dtA = dt.match(/../g) || [], dbA = db.match(/../g) || [];
    for (let i = 0; i < Math.max(my.length, dtA.length); i++) if (my[i] !== dtA[i]) o.push('T' + i + ' ' + (d[i] || '(none)'));
    for (let i = 0; i < Math.max(mb.length, dbA.length); i++) if (mb[i] !== dbA[i]) o.push('B' + i + ' ' + (b[i] || '(none)'));
    return o.length + ' diffs\n' + o.slice(0, 40).join('\n');
  };
})();
(function () {
  const W = window;
  W.addp = async n => { const bb = [...document.querySelectorAll('main button')].filter(x => x.getBoundingClientRect().width > 150 && x.textContent.includes(n))[0]; bb.click(); await W.sl(150); };
  W.setv = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
})();
