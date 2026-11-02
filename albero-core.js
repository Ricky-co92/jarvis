// albero-core.js — Albero genealogico: modello dati, albero SVG, controlli, export GEDCOM.
// Condiviso da app.js (area privata) e da albero-pubblico.html. Nessuna dipendenza da Supabase.
const GEN = (() => {
  const L = { W: 200, H: 72, GX: 20, RIGA: 120 };
  const MESI_IT = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
  const MESI_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const TIPI = { nascita: "Nascita", morte: "Morte", matrimonio: "Matrimonio", separazione: "Separazione", divorzio: "Divorzio", residenza: "Residenza", ordinazione: "Ordinazione", altro: "Altro" };
  const COL = {
    M: { s: "#2ab8d9", f: "rgba(42,184,217,.12)" },
    F: { s: "#d96ab0", f: "rgba(217,106,176,.12)" },
    U: { s: "#7a8f99", f: "rgba(122,143,153,.12)" }
  };

  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // d = { persone, famiglie, figli, eventi, luoghi }
  function indice(d) {
    const ix = { d, p: new Map(), fam: new Map(), famConiuge: new Map(), famFiglio: new Map(), figliDi: new Map(), ev: new Map(), evFam: new Map(), luogo: new Map() };
    d.persone.forEach(p => ix.p.set(p.id, p));
    d.famiglie.forEach(f => {
      ix.fam.set(f.id, f);
      [f.coniuge1_id, f.coniuge2_id].forEach(c => { if (c) push(ix.famConiuge, c, f.id); });
    });
    [...d.figli].sort((a, b) => (a.ordine || 0) - (b.ordine || 0)).forEach(r => {
      push(ix.figliDi, r.famiglia_id, r.persona_id);
      push(ix.famFiglio, r.persona_id, r.famiglia_id);
    });
    d.eventi.forEach(e => { if (e.persona_id) push(ix.ev, e.persona_id, e); if (e.famiglia_id) push(ix.evFam, e.famiglia_id, e); });
    d.luoghi.forEach(l => ix.luogo.set(l.id, l));
    return ix;
  }

  function nome(p) {
    if (!p) return "";
    if (p.nome === "?") return "? (sconosciuto)";
    return [p.nome, p.cognome].filter(Boolean).join(" ") || "(senza nome)";
  }

  function parseData(t) {
    t = (t || "").trim();
    if (!t) return { data_iso: null, precisione: "testo" };
    let m = t.match(/^(\d{1,2})[\s\/.-]+(\w+|\d{1,2})[\s\/.-]+(\d{4})$/);
    if (m) {
      const mese = /^\d+$/.test(m[2]) ? +m[2] : MESI_IT[m[2].slice(0, 3).toLowerCase()];
      if (mese >= 1 && mese <= 12) return { data_iso: `${m[3]}-${String(mese).padStart(2, "0")}-${m[1].padStart(2, "0")}`, precisione: "giorno" };
    }
    m = t.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
    if (m && MESI_IT[m[1].slice(0, 3).toLowerCase()]) return { data_iso: `${m[2]}-${String(MESI_IT[m[1].slice(0, 3).toLowerCase()]).padStart(2, "0")}-01`, precisione: "mese" };
    m = t.match(/^(\d{4})$/);
    if (m) return { data_iso: `${m[1]}-01-01`, precisione: "anno" };
    return { data_iso: null, precisione: "testo" };
  }

  const evento = (ix, pid, tipo) => (ix.ev.get(pid) || []).find(e => e.tipo === tipo) || null;
  const anno = e => {
    if (!e) return null;
    if (e.data_iso) return +String(e.data_iso).slice(0, 4);
    const m = (e.data_testo || "").match(/\d{4}/);
    return m ? +m[0] : null;
  };
  const luogoNome = (ix, e) => e ? ((e.luogo_id && ix.luogo.get(e.luogo_id) && ix.luogo.get(e.luogo_id).nome) || e.luogo_testo || "") : "";

  function vita(ix, pid) {
    const n = anno(evento(ix, pid, "nascita")), m = anno(evento(ix, pid, "morte"));
    if (n && m) return `${n} – ${m}`;
    if (n) return `${n}`;
    if (m) return `† ${m}`;
    return "";
  }

  // [padre, madre] ordinati per sesso (non per ruolo HUSB/WIFE, spesso invertito nei dati importati)
  function ordina(a, b) {
    if (a && b) return (a.sesso === "F" || b.sesso === "M") && !(a.sesso === "M" || b.sesso === "F") ? [b, a] : [a, b];
    if (a && a.sesso === "F") return [null, a];
    if (b && b.sesso === "M") return [b, null];
    return [a, b];
  }
  const coppia = (ix, famId) => { const f = ix.fam.get(famId); return f ? ordina(ix.p.get(f.coniuge1_id) || null, ix.p.get(f.coniuge2_id) || null) : [null, null]; };

  function genitori(ix, pid) {
    const fid = (ix.famFiglio.get(pid) || [])[0];
    if (!fid) return { fam: null, padre: null, madre: null };
    const [padre, madre] = coppia(ix, fid);
    return { fam: fid, padre, madre };
  }
  function coniugi(ix, pid) {
    return (ix.famConiuge.get(pid) || []).map(fid => {
      const f = ix.fam.get(fid);
      const altro = ix.p.get(f.coniuge1_id === pid ? f.coniuge2_id : f.coniuge1_id) || null;
      return { fam: fid, altro };
    });
  }
  function figli(ix, pid) {
    const visti = new Set(), out = [];
    (ix.famConiuge.get(pid) || []).forEach(fid => (ix.figliDi.get(fid) || []).forEach(c => {
      if (!visti.has(c) && ix.p.get(c)) { visti.add(c); out.push(ix.p.get(c)); }
    }));
    return out;
  }

  // ---------- ALBERO SVG: antenati sopra, discendenti sotto la persona scelta ----------
  // opz: gAvi, gDisc, fratelli (true = mostra fratelli/sorelle), foto (Map id -> url)
  function albero(ix, rootId, opz) {
    opz = Object.assign({ gAvi: 4, gDisc: 3, fratelli: false, foto: null }, opz || {});
    const { W, H, GX, RIGA } = L;
    const root = ix.p.get(rootId);
    if (!root) return { svg: "", w: 0, h: 0 };
    const fotoDi = id => opz.foto && (opz.foto.get ? opz.foto.get(id) : opz.foto[id]);
    const fratelliDi = (id, max) => {
      const gn = genitori(ix, id);
      if (!gn.fam) return [];
      return (ix.figliDi.get(gn.fam) || []).filter(c => c !== id).map(c => ix.p.get(c)).filter(Boolean).slice(0, max);
    };

    // antenati: livelli[g] = 2^g slot (padre a sinistra, madre a destra)
    const livelli = [[root]];
    let profA = 0;
    for (let g = 1; g <= opz.gAvi; g++) {
      const prec = livelli[g - 1], cur = new Array(prec.length * 2).fill(null);
      let any = false;
      prec.forEach((s, i) => {
        if (!s) return;
        const gn = genitori(ix, s.id);
        if (gn.padre) { cur[2 * i] = gn.padre; any = true; }
        if (gn.madre) { cur[2 * i + 1] = gn.madre; any = true; }
      });
      if (!any) break;
      livelli.push(cur); profA = g;
    }
    // larghezza dello slot: piu' larga se ci sono fratelli degli antenati da affiancare
    let kMax = 0;
    if (opz.fratelli) livelli.slice(1).forEach(l => l.forEach(p => { if (p) kMax = Math.max(kMax, fratelliDi(p.id, 2).length); }));
    const SW = (W + GX) * (1 + kMax);

    // discendenti: ogni nodo = persona + coniugi affiancati, figli sotto
    function nodoDisc(p, g, visti) {
      const sp = coniugi(ix, p.id).map(c => c.altro).filter(Boolean);
      const unitW = (1 + sp.length) * W + sp.length * GX;
      const nodo = { p, sp, unitW, figli: [], w: unitW, g };
      if (g < opz.gDisc && !visti.has(p.id)) {
        visti.add(p.id);
        nodo.figli = figli(ix, p.id).map(c => nodoDisc(c, g + 1, visti));
        const cw = nodo.figli.reduce((a, n) => a + n.w, 0) + Math.max(0, nodo.figli.length - 1) * GX;
        nodo.cw = cw; nodo.w = Math.max(unitW, cw);
      }
      return nodo;
    }
    const nd = nodoDisc(root, 0, new Set());

    const els = [], lin = [], defs = [];
    let lo = Infinity, hi = -Infinity, nFoto = 0;
    const box = (p, x, y, ev) => {
      const c = COL[p.sesso] || COL.U, sel = ev === "root", url = fotoDi(p.id);
      lo = Math.min(lo, x); hi = Math.max(hi, x + W);
      const tx = url ? 64 : 16, disp = W - tx - 8, maxc = Math.floor(disp / 7.6);
      const fz = (t, base) => Math.max(14, Math.min(base, Math.floor(disp / (Math.max(t.length, 1) * 0.58))));
      const cut = (t, m) => t.length > m ? t.slice(0, m - 1) + "…" : t;
      const nm = p.nome && p.nome !== "?" ? p.nome : "", cg = p.cognome || "";
      const riga1 = cut(nm || cg || "?", maxc), riga2 = nm && cg ? cut(cg.toUpperCase(), maxc) : "";
      const v = p.vivente ? "" : vita(ix, p.id);
      let img = "";
      if (url) {
        const cid = "fc" + (nFoto++);
        defs.push(`<clipPath id="${cid}"><circle cx="36" cy="${H / 2}" r="23"/></clipPath>`);
        img = `<circle cx="36" cy="${H / 2}" r="25" fill="#07161d" stroke="${c.s}" stroke-width="1.5"/><image href="${esc(url)}" x="13" y="${H / 2 - 23}" width="46" height="46" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
      }
      const F = 'font-family="Rajdhani,Segoe UI,sans-serif"';
      // tre righe che riempiono il riquadro (o due se manca il cognome)
      const y1 = riga2 ? 24 : 31, y2 = 45, y3 = riga2 ? 64 : 58;
      els.push(`<g class="gn" data-id="${p.id}" transform="translate(${x},${y})" style="cursor:pointer">` +
        (sel ? `<rect x="-4" y="-4" width="${W + 8}" height="${H + 8}" rx="9" fill="none" stroke="${c.s}" stroke-opacity=".5" stroke-width="2.5"/>` : "") +
        `<rect width="${W}" height="${H}" rx="6" fill="#0a1f29" stroke="${c.s}" stroke-width="${sel ? 2.8 : 1.6}"/>` +
        `<rect width="${W}" height="${H}" rx="6" fill="${c.f}"/><rect width="7" height="${H}" rx="3" fill="${c.s}"/>${img}` +
        `<text x="${tx}" y="${y1}" ${F} font-size="${fz(riga1, 21)}" font-weight="700" fill="#ffffff">${esc(riga1)}</text>` +
        (riga2 ? `<text x="${tx}" y="${y2}" ${F} font-size="${fz(riga2, 19)}" font-weight="700" fill="${c.s}">${esc(riga2)}</text>` : "") +
        `<text x="${tx}" y="${y3}" ${F} font-size="16" font-weight="600" fill="#cfe9f3">${esc(v)}</text></g>`);
    };
    const gomito = (x1, y1, x2, y2) => { const m = (y1 + y2) / 2; lin.push(`<path d="M${x1},${y1} V${m} H${x2} V${y2}" fill="none" stroke="#3a9cba" stroke-width="1.8"/>`); };

    const rigaRoot = profA * RIGA;
    // posizioni discendenti (frame virtuale: sinistra del nodo radice = 0)
    let xr = 0, uxRoot = 0;
    (function pos(n, left, y, isRoot) {
      const ux = left + (n.w - n.unitW) / 2;
      box(n.p, ux, y, isRoot ? "root" : "");
      if (isRoot) { xr = ux + W / 2; uxRoot = ux; }
      n.sp.forEach((s, k) => {
        const sx = ux + (k + 1) * (W + GX);
        lin.push(`<line x1="${ux + k * (W + GX) + W}" y1="${y + H / 2}" x2="${sx}" y2="${y + H / 2}" stroke="#3a9cba" stroke-width="1.8"/>`);
        box(s, sx, y, "");
      });
      if (n.figli.length) {
        const mid = ux + n.unitW / 2, yFiglio = y + RIGA;
        let cx = left + (n.w - n.cw) / 2;
        n.figli.forEach(f => {
          const fux = cx + (f.w - f.unitW) / 2;
          gomito(mid, y + H, fux + W / 2, yFiglio);
          pos(f, cx, yFiglio, false);
          cx += f.w + GX;
        });
      }
    })(nd, 0, rigaRoot, true);

    // posizioni antenati, centrati sul box della persona scelta
    const Wa = Math.pow(2, profA) * SW;
    const centro = (g, i) => xr + ((i + 0.5) / Math.pow(2, g) - 0.5) * Wa;
    for (let g = 1; g <= profA; g++) {
      livelli[g].forEach((p, i) => {
        if (!p) return;
        const y = (profA - g) * RIGA, cx = centro(g, i);
        box(p, cx - W / 2, y, "");
        const fx = g === 1 ? xr : centro(g - 1, i >> 1);
        gomito(fx, (profA - g + 1) * RIGA, cx, y + H);
        // fratelli dell'antenato, a destra del suo box, agganciati ai suoi stessi genitori
        if (opz.fratelli && kMax) fratelliDi(p.id, kMax).forEach((f, j) => {
          const fx2 = cx + W / 2 + GX + j * (W + GX);
          box(f, fx2, y, "");
          if (g < profA) [2 * i, 2 * i + 1].forEach(k => { if (livelli[g + 1][k]) gomito(fx2 + W / 2, y, centro(g + 1, k), (profA - g - 1) * RIGA + H); });
        });
      });
    }
    // fratelli della persona scelta: a sinistra del suo riquadro
    if (opz.fratelli) fratelliDi(rootId, 6).forEach((f, j) => {
      const fx2 = uxRoot - (j + 1) * (W + GX);
      box(f, fx2, rigaRoot, "");
      if (profA >= 1) [0, 1].forEach(k => { if (livelli[1][k]) gomito(fx2 + W / 2, rigaRoot, centro(1, k), (profA - 1) * RIGA + H); });
    });

    // dimensioni totali con margine (dagli estremi reali dei riquadri)
    const maxDisc = (function prof(n) { return n.figli.length ? 1 + Math.max(...n.figli.map(prof)) : 0; })(nd);
    const pad = 24, w = hi - lo + pad * 2, h = (profA + maxDisc) * RIGA + H + pad * 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
      `<g transform="translate(${pad - lo},${pad})">${lin.join("")}${els.join("")}</g></svg>`;
    return { svg, w, h, cx: xr + pad - lo, cy: rigaRoot + pad + H / 2 };
  }

  // ---------- VISTA INTERATTIVA (trascina, zoom con rotella/pulsanti, clic = seleziona) ----------
  function vista(cont, ix, opz) {
    opz = opz || {};
    const st = { x: 0, y: 0, s: 1, w: 0, h: 0, cx: 0, cy: 0, root: null, gAvi: opz.gAvi || 4, gDisc: opz.gDisc || 3, fratelli: !!opz.fratelli, foto: opz.foto || null };
    cont.classList.add("gen-vista");
    cont.style.touchAction = "none";
    cont.innerHTML = '<div class="gen-tela" style="transform-origin:0 0;position:absolute;left:0;top:0"></div>';
    const tela = cont.firstChild;
    const applica = () => { tela.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; };
    function adatta() {
      const cw = cont.clientWidth || 800, ch = cont.clientHeight || 500;
      st.s = Math.max(0.8, Math.min(1, cw / st.w));
      st.x = cw / 2 - st.cx * st.s;
      st.y = ch / 2 - st.cy * st.s;
      applica();
    }
    function adattaTutto() {
      const cw = cont.clientWidth || 800, ch = cont.clientHeight || 500;
      st.s = Math.max(0.03, Math.min(1, cw / st.w, ch / st.h));
      st.x = (cw - st.w * st.s) / 2; st.y = (ch - st.h * st.s) / 2;
      applica();
    }
    function imposta(rootId, nuovoIx) {
      if (nuovoIx) ix = nuovoIx;
      st.root = rootId;
      const r = albero(ix, rootId, { gAvi: st.gAvi, gDisc: st.gDisc, fratelli: st.fratelli, foto: st.foto });
      st.w = r.w; st.h = r.h; st.cx = r.cx; st.cy = r.cy;
      tela.innerHTML = r.svg;
      adatta();
    }
    function zoom(f, px, py) {
      px = px == null ? cont.clientWidth / 2 : px; py = py == null ? cont.clientHeight / 2 : py;
      const ns = Math.min(2.5, Math.max(0.03, st.s * f)), k = ns / st.s;
      st.x = px - (px - st.x) * k; st.y = py - (py - st.y) * k; st.s = ns; applica();
    }
    let drag = null;
    cont.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, ox: st.x, oy: st.y, mosso: false, el: e.target.closest && e.target.closest(".gn") };
    });
    cont.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.mosso && Math.hypot(dx, dy) < 5) return;
      if (!drag.mosso) { drag.mosso = true; try { cont.setPointerCapture(e.pointerId); } catch (_) {} }
      st.x = drag.ox + dx; st.y = drag.oy + dy; applica();
    });
    const fine = () => {
      if (drag && !drag.mosso && drag.el && opz.onSeleziona) opz.onSeleziona(drag.el.dataset.id);
      drag = null;
    };
    cont.addEventListener("pointerup", fine);
    cont.addEventListener("pointercancel", () => { drag = null; });
    cont.addEventListener("wheel", e => {
      e.preventDefault();
      const r = cont.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    return { imposta, zoom, adatta, adattaTutto, st, svg: () => tela.querySelector("svg") };
  }

  // ---------- STATO IN VITA (stessa regola del link pubblico) ----------
  function vivente(ix, p) {
    if (p.stato_vita === "vivente") return true;
    if (p.stato_vita === "deceduto") return false;
    if (evento(ix, p.id, "morte")) return false;
    const oggi = new Date().getFullYear();
    if (figli(ix, p.id).some(c => { const a = anno(evento(ix, c.id, "nascita")); return a && a <= oggi - 90; })) return false;
    const n = anno(evento(ix, p.id, "nascita"));
    return n == null ? true : n > oggi - 100;
  }

  // ---------- PARENTELA ----------
  function mappaAntenati(ix, id) {
    const m = new Map([[id, { d: 0, via: null }]]), coda = [id];
    while (coda.length) {
      const c = coda.shift(), d = m.get(c).d;
      (ix.famFiglio.get(c) || []).forEach(fid => {
        const f = ix.fam.get(fid);
        [f.coniuge1_id, f.coniuge2_id].forEach(g => { if (g && !m.has(g)) { m.set(g, { d: d + 1, via: c }); coda.push(g); } });
      });
    }
    return m;
  }
  function sangue(ix, a, b) {
    const ma = mappaAntenati(ix, a), mb = mappaAntenati(ix, b);
    let best = null;
    ma.forEach((va, id) => {
      const vb = mb.get(id); if (!vb) return;
      const tot = va.d + vb.d;
      if (!best || tot < best.tot || (tot === best.tot && Math.max(va.d, vb.d) < Math.max(best.da, best.db))) best = { tot, da: va.d, db: vb.d, lca: id };
    });
    if (!best) return null;
    const catena = m => { const o = []; let c = best.lca; while (c) { o.push(c); c = m.get(c).via; } return o; };
    best.sa = catena(ma); best.sb = catena(mb);
    return best;
  }
  const ORD = ["", "primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo"];
  function termine(da, db, sx, pieno) {
    const g = (m, f) => sx === "M" ? m : sx === "F" ? f : m + "/" + f;
    if (da === 0 && db === 0) return "la stessa persona";
    if (da === 0) return db === 1 ? g("figlio", "figlia") : db === 2 ? "nipote (figlio/a di un figlio/a)" : db === 3 ? "pronipote" : `discendente di ${db}ª generazione`;
    if (db === 0) return da === 1 ? g("padre", "madre") : da === 2 ? g("nonno", "nonna") : da === 3 ? g("bisnonno", "bisnonna") : da === 4 ? g("trisavolo", "trisavola") : `antenato di ${da}ª generazione`;
    if (da === 1 && db === 1) return pieno ? g("fratello", "sorella") : g("fratellastro", "sorellastra");
    if (db === 1) return da === 2 ? g("zio", "zia") : da === 3 ? g("prozio", "prozia") : `${g("zio", "zia")} di ${da}° grado`;
    if (da === 1) return db === 2 ? "nipote (figlio/a di fratello/sorella)" : db === 3 ? "pronipote (nipote di fratello/sorella)" : `discendente collaterale di ${db}ª generazione`;
    const gr = Math.min(da, db) - 1, diff = Math.abs(da - db);
    return `${g("cugino", "cugina")} di ${ORD[gr] || gr + "°"} grado` + (diff ? `, ${diff} ${diff === 1 ? "generazione" : "generazioni"} di differenza` : "");
  }
  // Come B e' imparentato con A. Ritorna { tipo: sangue|acquisita|nessuna, termine, frase, avo, percorso:[id] }
  function parentela(ix, aId, bId) {
    const A = ix.p.get(aId), B = ix.p.get(bId);
    if (!A || !B) return null;
    if (aId === bId) return { tipo: "sangue", termine: "la stessa persona", frase: "Hai scelto la stessa persona.", avo: null, percorso: [aId] };
    const r = sangue(ix, aId, bId);
    if (r) {
      const pieno = !(r.da === 1 && r.db === 1) || (ix.famFiglio.get(aId) || []).some(f => (ix.famFiglio.get(bId) || []).includes(f));
      const t = termine(r.da, r.db, B.sesso, pieno);
      return { tipo: "sangue", termine: t, frase: `${nome(B)} è ${t} di ${nome(A)}`, da: r.da, db: r.db,
        avo: r.lca !== aId && r.lca !== bId ? ix.p.get(r.lca) : null, percorso: [...r.sa.slice().reverse(), ...r.sb.slice(1)] };
    }
    const cA = coniugi(ix, aId).map(c => c.altro).filter(Boolean), cB = coniugi(ix, bId).map(c => c.altro).filter(Boolean);
    const sess = (m, f, u) => B.sesso === "M" ? m : B.sesso === "F" ? f : u;
    if (cA.some(c => c.id === bId)) {
      const t = sess("marito", "moglie", "coniuge");
      return { tipo: "acquisita", termine: t, frase: `${nome(B)} è ${t} di ${nome(A)}`, avo: null, percorso: [aId, bId] };
    }
    for (const S of cA) {
      const q = sangue(ix, S.id, bId); if (!q) continue;
      let t;
      if (q.da === 1 && q.db === 0) t = sess("suocero", "suocera", "suocero/a");
      else if (q.da === 1 && q.db === 1) t = sess("cognato", "cognata", "cognato/a");
      else return { tipo: "acquisita", termine: "parente acquisito", frase: `${nome(B)} è ${termine(q.da, q.db, B.sesso, true)} di ${nome(S)}, ${S.sesso === "F" ? "moglie" : S.sesso === "M" ? "marito" : "coniuge"} di ${nome(A)}`, avo: null, percorso: [aId, S.id, bId] };
      return { tipo: "acquisita", termine: t, frase: `${nome(B)} è ${t} di ${nome(A)}`, avo: null, percorso: [aId, S.id, bId] };
    }
    for (const T of cB) {
      const q = sangue(ix, aId, T.id); if (!q) continue;
      let t;
      if (q.da === 0 && q.db === 1) t = sess("genero", "nuora", "genero/nuora");
      else if (q.da === 1 && q.db === 1) t = sess("cognato", "cognata", "cognato/a");
      else return { tipo: "acquisita", termine: "parente acquisito", frase: `${nome(B)} è ${sess("marito", "moglie", "coniuge")} di ${nome(T)}, ${termine(q.da, q.db, T.sesso, true)} di ${nome(A)}`, avo: null, percorso: [aId, T.id, bId] };
      return { tipo: "acquisita", termine: t, frase: `${nome(B)} è ${t} di ${nome(A)}`, avo: null, percorso: [aId, T.id, bId] };
    }
    return { tipo: "nessuna", termine: "", frase: `Nessun legame trovato nei dati tra ${nome(A)} e ${nome(B)}.`, avo: null, percorso: [] };
  }

  // ---------- CRONOLOGIA ----------
  const chiaveData = (e, a) => e.data_iso ? String(e.data_iso).slice(0, 10) : (a != null ? `${a}-07-01` : "9999");
  const titoloEv = e => e.tipo === "altro" && e.titolo ? e.titolo : (TIPI[e.tipo] || e.tipo);
  function cronologia(ix, pid) {
    const nasc = anno(evento(ix, pid, "nascita")), out = [];
    const agg = (a, key, testo, proprio, tipo) => out.push({ anno: a, key, testo, eta: a != null && nasc != null ? a - nasc : null, proprio, tipo });
    (ix.ev.get(pid) || []).forEach(e => {
      const a = anno(e), l = luogoNome(ix, e);
      agg(a, chiaveData(e, a), titoloEv(e) + (l ? " — " + l : "") + (e.tipo !== "altro" && e.titolo ? " (" + e.titolo + ")" : ""), true, e.tipo);
    });
    (ix.famConiuge.get(pid) || []).forEach(fid => {
      const f = ix.fam.get(fid), altro = ix.p.get(f.coniuge1_id === pid ? f.coniuge2_id : f.coniuge1_id);
      (ix.evFam.get(fid) || []).forEach(e => {
        const a = anno(e), l = luogoNome(ix, e);
        agg(a, chiaveData(e, a), `${titoloEv(e)}${altro ? " con " + nome(altro) : ""}${l ? " — " + l : ""}`, true, e.tipo);
      });
      const mc = altro && evento(ix, altro.id, "morte");
      if (mc) agg(anno(mc), chiaveData(mc, anno(mc)), `Muore ${altro.sesso === "F" ? "la moglie" : altro.sesso === "M" ? "il marito" : "il coniuge"} ${nome(altro)}`, false, "coniuge");
      (ix.figliDi.get(fid) || []).forEach(cid => {
        const c = ix.p.get(cid); if (!c) return;
        const rel = c.sesso === "F" ? "la figlia" : c.sesso === "M" ? "il figlio" : "il figlio/a";
        const nn = evento(ix, cid, "nascita"), mm = evento(ix, cid, "morte");
        if (nn) agg(anno(nn), chiaveData(nn, anno(nn)), `Nasce ${rel} ${nome(c)}`, false, "figlio");
        if (mm) agg(anno(mm), chiaveData(mm, anno(mm)), `Muore ${rel} ${nome(c)}`, false, "figlio");
      });
    });
    const g = genitori(ix, pid);
    [g.padre, g.madre].filter(Boolean).forEach(q => {
      const m = evento(ix, q.id, "morte");
      if (m) agg(anno(m), chiaveData(m, anno(m)), `Muore ${q.sesso === "F" ? "la madre" : "il padre"} ${nome(q)}`, false, "genitore");
    });
    return out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }
  function cronologiaGlobale(ix) {
    const out = [];
    ix.d.eventi.forEach(e => {
      const a = anno(e), l = luogoNome(ix, e);
      let chi, pid = e.persona_id;
      if (e.persona_id) chi = nome(ix.p.get(e.persona_id));
      else { const f = ix.fam.get(e.famiglia_id); if (!f) return; chi = [ix.p.get(f.coniuge1_id), ix.p.get(f.coniuge2_id)].filter(Boolean).map(nome).join(" e "); pid = f.coniuge1_id || f.coniuge2_id; }
      out.push({ key: chiaveData(e, a), anno: a, data: e.data_testo || "", chi, pid, tipo: e.tipo, testo: titoloEv(e), luogo: l });
    });
    return out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }

  // ---------- STATISTICHE ----------
  function statistiche(ix, fonti) {
    const ps = ix.d.persone, oggi = new Date().getFullYear();
    const conta = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const luogoCitta = (p, tipo) => { const l = luogoNome(ix, evento(ix, p.id, tipo)); return l ? l.split(",")[0].trim() : null; };
    const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const eta = [];
    ps.forEach(p => { const n = anno(evento(ix, p.id, "nascita")), m = anno(evento(ix, p.id, "morte")); if (n != null && m != null && m >= n) eta.push({ p, eta: m - n }); });
    eta.sort((a, b) => b.eta - a.eta);
    const dec = new Map();
    ps.forEach(p => { const n = anno(evento(ix, p.id, "nascita")); if (n != null) { const d = Math.floor(n / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); } });
    // profondita' (generazioni) con memoria e protezione dai cicli
    const memo = new Map();
    const prof = (id, vis) => {
      if (memo.has(id)) return memo.get(id);
      if (vis.has(id)) return 0;
      vis.add(id);
      const g = genitori(ix, id), d = [g.padre, g.madre].filter(Boolean).map(x => 1 + prof(x.id, vis));
      const r = d.length ? Math.max(...d) : 0; memo.set(id, r); return r;
    };
    const generazioni = ps.length ? Math.max(...ps.map(p => prof(p.id, new Set()))) + 1 : 0;
    const etaPrimoFiglio = { M: [], F: [] };
    ps.forEach(p => {
      const n = anno(evento(ix, p.id, "nascita")); if (n == null || !(p.sesso === "M" || p.sesso === "F")) return;
      const nf = figli(ix, p.id).map(c => anno(evento(ix, c.id, "nascita"))).filter(a => a != null).sort((a, b) => a - b);
      if (nf.length && nf[0] - n >= 12 && nf[0] - n <= 60) etaPrimoFiglio[p.sesso].push(nf[0] - n);
    });
    const famConFigli = ix.d.famiglie.filter(f => (ix.figliDi.get(f.id) || []).length);
    const conFonti = new Set((fonti || []).map(f => f.persona_id));
    const pct = f => ps.length ? Math.round(100 * ps.filter(f).length / ps.length) : 0;
    const anni = ps.map(p => anno(evento(ix, p.id, "nascita"))).filter(a => a != null);
    return {
      persone: ps.length, famiglie: ix.d.famiglie.length, generazioni,
      sesso: { M: ps.filter(p => p.sesso === "M").length, F: ps.filter(p => p.sesso === "F").length, U: ps.filter(p => p.sesso === "U").length },
      viventi: ps.filter(p => vivente(ix, p)).length,
      cognomi: conta(ps, p => p.cognome).slice(0, 12),
      luoghiNascita: conta(ps, p => luogoCitta(p, "nascita")).slice(0, 10),
      luoghiMorte: conta(ps, p => luogoCitta(p, "morte")).slice(0, 8),
      decenni: [...dec.entries()].sort((a, b) => a[0] - b[0]),
      etaMedia: media(eta.map(x => x.eta)), etaMax: eta[0] || null, etaMin: eta.length ? eta[eta.length - 1] : null, nEta: eta.length,
      figliPerCoppia: media(famConFigli.map(f => (ix.figliDi.get(f.id) || []).length)),
      etaPrimoFiglioM: media(etaPrimoFiglio.M), etaPrimoFiglioF: media(etaPrimoFiglio.F),
      annoPiuAntico: anni.length ? Math.min(...anni) : null, annoPiuRecente: anni.length ? Math.max(...anni) : null, oggi,
      pctNascita: pct(p => anno(evento(ix, p.id, "nascita")) != null),
      pctLuogo: pct(p => !!luogoNome(ix, evento(ix, p.id, "nascita"))),
      pctGenitori: pct(p => { const g = genitori(ix, p.id); return !!(g.padre && g.madre); }),
      pctFonti: pct(p => conFonti.has(p.id))
    };
  }

  // ---------- RICORRENZE (compleanni, anniversari di morte e di matrimonio) ----------
  function ricorrenzeBase(ix) {
    const out = [];
    const md = e => { if (!e || e.precisione !== "giorno" || !e.data_iso) return null; const [y, m, d] = String(e.data_iso).slice(0, 10).split("-").map(Number); return { y, m, d }; };
    ix.d.persone.forEach(p => {
      const n = md(evento(ix, p.id, "nascita")), m = md(evento(ix, p.id, "morte"));
      if (n && vivente(ix, p)) out.push({ tipo: "compleanno", ...n, pid: p.id, icona: "🎂", titolo: `Compleanno di ${nome(p)}`, testo: a => `${nome(p)} compie ${a} anni` });
      if (m) out.push({ tipo: "morte", ...m, pid: p.id, icona: "🕯️", titolo: `Anniversario della scomparsa di ${nome(p)}`, testo: a => `Anniversario della scomparsa di ${nome(p)} (${a} anni)` });
    });
    ix.d.famiglie.forEach(f => {
      const evs = ix.evFam.get(f.id) || [], x = md(evs.find(e => e.tipo === "matrimonio"));
      if (!x || evs.some(e => e.tipo === "separazione" || e.tipo === "divorzio")) return;
      const a = ix.p.get(f.coniuge1_id), b = ix.p.get(f.coniuge2_id);
      if (!a || !b || !vivente(ix, a) || !vivente(ix, b)) return;
      out.push({ tipo: "matrimonio", ...x, pid: a.id, icona: "💍", titolo: `Anniversario di matrimonio di ${nome(a)} e ${nome(b)}`, testo: n => `${nome(a)} e ${nome(b)}: ${n} anni di matrimonio` });
    });
    return out;
  }
  function prossima(r, oggi) {
    const mezz = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
    let d = new Date(mezz.getFullYear(), r.m - 1, r.d);
    if (d < mezz) d = new Date(mezz.getFullYear() + 1, r.m - 1, r.d);
    return { data: d, giorniA: Math.round((d - mezz) / 86400000), anni: d.getFullYear() - r.y };
  }
  function ricorrenze(ix, giorni, oggi) {
    oggi = oggi || new Date();
    return ricorrenzeBase(ix).map(r => ({ ...r, ...prossima(r, oggi) }))
      .filter(r => r.giorniA <= giorni && r.anni > 0)
      .map(r => ({ tipo: r.tipo, icona: r.icona, pid: r.pid, data: r.data, giorniA: r.giorniA, anni: r.anni, testo: r.testo(r.anni) }))
      .sort((a, b) => a.giorniA - b.giorniA);
  }
  function ics(ix) {
    const z = n => String(n).padStart(2, "0"), d8 = d => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const tx = t => String(t).replace(/[\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
    const o = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JARVIS//Albero genealogico//IT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Ricorrenze di famiglia"];
    ricorrenzeBase(ix).forEach((r, i) => {
      const n = prossima(r, new Date()), fine = new Date(n.data.getFullYear(), n.data.getMonth(), n.data.getDate() + 1);
      o.push("BEGIN:VEVENT", `UID:${r.tipo}-${r.pid}-${i}@jarvis`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d8(n.data)}`, `DTEND;VALUE=DATE:${d8(fine)}`, "RRULE:FREQ=YEARLY",
        `SUMMARY:${tx(r.icona + " " + r.titolo)}`, `DESCRIPTION:${tx("Evento originale: " + r.d + "/" + r.m + "/" + r.y)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    });
    o.push("END:VCALENDAR");
    return o.join("\r\n") + "\r\n";
  }

  // ---------- DA COMPLETARE (priorita' di ricerca) ----------
  function distanze(ix, rootId) {
    const dist = new Map([[rootId, 0]]), coda = [rootId];
    while (coda.length) {
      const c = coda.shift(), d = dist.get(c), vic = [];
      const g = genitori(ix, c); [g.padre, g.madre].forEach(x => x && vic.push(x.id));
      figli(ix, c).forEach(x => vic.push(x.id));
      coniugi(ix, c).forEach(x => x.altro && vic.push(x.altro.id));
      vic.forEach(v => { if (!dist.has(v)) { dist.set(v, d + 1); coda.push(v); } });
    }
    return dist;
  }
  const PESO_MAX = 17;
  function incompleti(ix, rootId, fonti) {
    const dist = distanze(ix, rootId), conFonti = new Set((fonti || []).map(f => f.persona_id)), out = [];
    let totale = 0;
    ix.d.persone.forEach(p => {
      const m = [], n = evento(ix, p.id, "nascita");
      if (!p.nome || p.nome === "?") m.push(["nome sconosciuto", 4]);
      if (!n || anno(n) == null) m.push(["data di nascita", 3]); else if (!luogoNome(ix, n)) m.push(["luogo di nascita", 2]);
      if (!vivente(ix, p) && !evento(ix, p.id, "morte")) m.push(["data di morte", 3]);
      const g = genitori(ix, p.id);
      if (!g.padre && !g.madre) m.push(["genitori", 3]); else if (!g.padre) m.push(["padre", 2]); else if (!g.madre) m.push(["madre", 2]);
      if (p.sesso === "U") m.push(["sesso", 1]);
      if (!conFonti.has(p.id)) m.push(["fonte", 1]);
      const peso = m.reduce((a, x) => a + x[1], 0); totale += peso;
      if (!m.length) return;
      const d = dist.has(p.id) ? dist.get(p.id) : 20;
      out.push({ p, mancanze: m.map(x => x[0]), peso, distanza: d, priorita: peso / (1 + d * 0.35) });
    });
    out.sort((a, b) => b.priorita - a.priorita);
    const completezza = ix.d.persone.length ? Math.round(100 * (1 - totale / (ix.d.persone.length * PESO_MAX))) : 100;
    return { lista: out, completezza };
  }

  // ---------- RICERCA AVANZATA ----------
  function cerca(ix, f, fonti) {
    const conFonti = new Set((fonti || []).map(x => x.persona_id));
    const q = (f.q || "").toLowerCase().trim(), luogo = (f.luogo || "").toLowerCase().trim(), cog = (f.cognome || "").toLowerCase();
    return ix.d.persone.filter(p => {
      if (q && !nome(p).toLowerCase().includes(q)) return false;
      if (cog && (p.cognome || "").toLowerCase() !== cog) return false;
      if (f.sesso && p.sesso !== f.sesso) return false;
      const a = anno(evento(ix, p.id, "nascita"));
      if (f.da && !(a != null && a >= +f.da)) return false;
      if (f.a && !(a != null && a <= +f.a)) return false;
      if (luogo && !(ix.ev.get(p.id) || []).map(e => luogoNome(ix, e).toLowerCase()).join("|").includes(luogo)) return false;
      if (f.stato === "vivi" && !vivente(ix, p)) return false;
      if (f.stato === "morti" && vivente(ix, p)) return false;
      if (f.senzaFonti && conFonti.has(p.id)) return false;
      if (f.senzaNascita && a != null) return false;
      if (f.senzaGenitori && genitori(ix, p.id).fam) return false;
      if (f.conBiografia && !p.biografia) return false;
      return true;
    });
  }

  // ---------- BLOCCHI HTML CONDIVISI TRA APP PRIVATA E PAGINA PUBBLICA ----------
  // Usano le classi alb-riga / alb-link / alb-sez e data-az="scheda" (clic = apri la scheda di quella persona).
  const lk = (ix, q) => `<span class="alb-link" data-az="scheda" data-id="${q.id}">${esc(nome(q))}</span> <small>${esc(q.vivente ? "" : vita(ix, q.id))}</small>`;
  const uniq = arr => { const v = new Set(); return arr.filter(x => x && !v.has(x.id) && v.add(x.id)); };
  function schedaVitaHtml(ix, id) {
    const ord = ["nascita", "matrimonio", "separazione", "divorzio", "residenza", "ordinazione", "altro", "morte"];
    return [...(ix.ev.get(id) || [])].sort((a, b) => ord.indexOf(a.tipo) - ord.indexOf(b.tipo)).map(e =>
      `<div class="alb-riga"><b style="min-width:92px">${esc(titoloEv(e))}</b><span>${esc([e.data_testo, luogoNome(ix, e)].filter(Boolean).join(" · ") || "—")}${e.tipo !== "altro" && e.titolo ? " <small>" + esc(e.titolo) + "</small>" : ""}${e.note ? ` <small>(${esc(e.note)})</small>` : ""}</span></div>`).join("");
  }
  function schedaFamigliaHtml(ix, id) {
    const riga = (t, arr) => arr.length ? `<div class="alb-riga" style="align-items:flex-start"><small style="min-width:92px">${t}:</small><span>${arr.map(q => lk(ix, q)).join(" · ")}</span></div>` : "";
    const g = genitori(ix, id), gen = [g.padre, g.madre].filter(Boolean);
    const fratelli = uniq((ix.famFiglio.get(id) || []).flatMap(fid => (ix.figliDi.get(fid) || []).map(c => ix.p.get(c))).filter(x => x && x.id !== id));
    const nonni = uniq(gen.flatMap(q => { const gg = genitori(ix, q.id); return [gg.padre, gg.madre]; }));
    const zii = uniq(gen.flatMap(q => (ix.famFiglio.get(q.id) || []).flatMap(fid => (ix.figliDi.get(fid) || []).map(c => ix.p.get(c))).filter(x => x && x.id !== q.id)));
    const fg = figli(ix, id), nipoti = uniq(fg.flatMap(c => figli(ix, c.id)));
    const unioni = coniugi(ix, id).map(c => {
      const f = ix.fam.get(c.fam), evs = ix.evFam.get(c.fam) || [];
      const etichetta = f.tipo_unione === "convivenza" ? "Convivente" : f.tipo_unione === "altro" ? "Partner" : (c.altro && c.altro.sesso === "M" ? "Marito" : c.altro && c.altro.sesso === "F" ? "Moglie" : "Coniuge");
      const det = evs.filter(e => e.data_testo || luogoNome(ix, e)).map(e => `${esc(titoloEv(e).toLowerCase())}${e.data_testo ? " " + esc(e.data_testo) : ""}${luogoNome(ix, e) ? " a " + esc(luogoNome(ix, e)) : ""}`).join("; ");
      const kids = (ix.figliDi.get(c.fam) || []).map(x => ix.p.get(x)).filter(Boolean);
      return `<div class="alb-riga" style="align-items:flex-start"><small style="min-width:92px">${etichetta}:</small><span>${c.altro ? lk(ix, c.altro) : "<small>(non indicato)</small>"}${det ? ` <small>— ${det}</small>` : ""}${kids.length ? ` <small>— figli insieme:</small> ${kids.map(q => lk(ix, q)).join(" · ")}` : ""}</span></div>`;
    }).join("");
    const html = riga("Genitori", gen) + riga("Fratelli/sorelle", fratelli) + unioni + riga("Figli", fg) + riga("Nonni", nonni) + riga("Zii", zii) + riga("Nipoti", nipoti);
    return html || `<div style="color:#8fb8cc">Nessun legame registrato.</div>`;
  }
  function timelineHtml(ix, id) {
    const c = cronologia(ix, id);
    return c.map(x => `<div class="alb-riga"><b style="min-width:52px">${x.anno != null ? x.anno : "—"}</b><span style="${x.proprio ? "" : "color:#8fb8cc"}">${esc(x.testo)}${x.eta != null && x.eta > 0 ? ` <small>(${x.eta} anni)</small>` : ""}</span></div>`).join("");
  }

  // ---------- CONTROLLI DI COERENZA ----------
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  function controlli(ix) {
    const out = [], annoOggi = new Date().getFullYear();
    const add = (gravita, testo, pid) => out.push({ gravita, testo, pid });
    ix.d.persone.forEach(p => {
      const n = anno(evento(ix, p.id, "nascita")), m = anno(evento(ix, p.id, "morte"));
      if (n && (n < 1700 || n > annoOggi)) add("errore", `${nome(p)}: anno di nascita improbabile (${n})`, p.id);
      if (n && m && m < n) add("errore", `${nome(p)}: morte (${m}) prima della nascita (${n})`, p.id);
      if (p.sesso === "U") add("avviso", `${nome(p)}: sesso non indicato`, p.id);
      if (!p.nome || p.nome === "?") add("avviso", `Persona senza nome (genitore/antenato ignoto)`, p.id);
      if ((ix.famFiglio.get(p.id) || []).length > 1) add("avviso", `${nome(p)}: ha più di una famiglia d'origine`, p.id);
      if (!(ix.famFiglio.get(p.id) || []).length && !(ix.famConiuge.get(p.id) || []).length) add("avviso", `${nome(p)}: persona isolata, nessun legame`, p.id);
      (ix.ev.get(p.id) || []).forEach(e => { if (e.data_testo && e.precisione === "testo") add("avviso", `${nome(p)}: data non interpretabile "${e.data_testo}"`, p.id); });
      const gn = genitori(ix, p.id);
      [gn.padre, gn.madre].forEach(g => {
        if (!g || !n) return;
        const ng = anno(evento(ix, g.id, "nascita"));
        if (ng && n - ng < 12) add("errore", `${nome(p)}: nato ${n - ng} anni dopo ${nome(g)} (nascita ${ng})`, p.id);
      });
    });
    ix.d.famiglie.forEach(f => {
      const a = ix.p.get(f.coniuge1_id), b = ix.p.get(f.coniuge2_id);
      if ((a && a.sesso === "F") || (b && b.sesso === "M")) add("avviso", `Ruoli/sesso da verificare nella coppia ${nome(a) || "?"} + ${nome(b) || "?"}`, (a || b || {}).id);
    });
    const per = new Map();
    ix.d.persone.forEach(p => { const k = nome(p).toLowerCase(); if (p.nome && p.nome !== "?") push(per, k, p); });
    per.forEach(l => {
      if (l.length < 2) return;
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
        const a = anno(evento(ix, l[i].id, "nascita")), b = anno(evento(ix, l[j].id, "nascita"));
        if (!(a && b && a !== b)) add("avviso", `Possibile duplicato: ${nome(l[i])}`, l[i].id);
      }
    });
    const cogn = [...new Set(ix.d.persone.map(p => p.cognome).filter(c => c && c.length >= 5))];
    for (let i = 0; i < cogn.length; i++) for (let j = i + 1; j < cogn.length; j++)
      if (lev(cogn[i].toLowerCase(), cogn[j].toLowerCase()) === 1) {
        const p = ix.d.persone.find(x => x.cognome === cogn[i]);
        add("avviso", `Cognomi molto simili: ${cogn[i]} / ${cogn[j]}`, p && p.id);
      }
    return out;
  }

  // ---------- EXPORT GEDCOM 5.5.1 ----------
  function dataGedcom(e) {
    if (!e.data_iso) return e.data_testo || "";
    const [y, m, d] = e.data_iso.split("-");
    if (e.precisione === "anno") return y;
    if (e.precisione === "mese") return `${MESI_EN[+m - 1]} ${y}`;
    return `${+d} ${MESI_EN[+m - 1]} ${y}`;
  }
  function gedcom(ix, fonti) {
    const o = ["0 HEAD", "1 SOUR JARVIS", "2 NAME J.A.R.V.I.S. Albero genealogico", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8", "1 SUBM @SUBM@", "0 @SUBM@ SUBM", "1 NAME JARVIS"];
    const pid = new Map(), fid = new Map();
    ix.d.persone.forEach((p, i) => pid.set(p.id, "@I" + (i + 1) + "@"));
    ix.d.famiglie.forEach((f, i) => fid.set(f.id, "@F" + (i + 1) + "@"));
    const sid = new Map();
    (fonti || []).forEach((s, i) => sid.set(s.id, "@S" + (i + 1) + "@"));
    const nota = (liv, t) => String(t).split(/\r?\n/).forEach((r, i) => o.push(`${liv} ${i ? "CONT" : "NOTE"} ${r}`));
    const evTag = { nascita: "BIRT", morte: "DEAT", residenza: "RESI", ordinazione: "ORDN", matrimonio: "MARR", separazione: "EVEN", divorzio: "DIV", altro: "EVEN" };
    const scriviEv = e => {
      o.push("1 " + evTag[e.tipo]);
      if (e.tipo === "separazione") o.push("2 TYPE Separazione");
      else if (e.tipo === "altro" && e.titolo) o.push("2 TYPE " + e.titolo);
      const d = dataGedcom(e); if (d) o.push("2 DATE " + d);
      const l = luogoNome(ix, e); if (l) o.push("2 PLAC " + l);
      if (e.note) nota(2, e.note);
    };
    ix.d.persone.forEach(p => {
      o.push(`0 ${pid.get(p.id)} INDI`);
      o.push(`1 NAME ${p.nome === "?" ? "" : (p.nome || "")} /${p.cognome || ""}/`);
      if (p.nome && p.nome !== "?") o.push("2 GIVN " + p.nome);
      if (p.cognome) o.push("2 SURN " + p.cognome);
      if (p.sesso !== "U") o.push("1 SEX " + p.sesso);
      (ix.ev.get(p.id) || []).forEach(scriviEv);
      (ix.famFiglio.get(p.id) || []).forEach(f => o.push("1 FAMC " + fid.get(f)));
      (ix.famConiuge.get(p.id) || []).forEach(f => o.push("1 FAMS " + fid.get(f)));
      (fonti || []).filter(s => s.persona_id === p.id).forEach(s => o.push("1 SOUR " + sid.get(s.id)));
      if (p.note) nota(1, p.note);
    });
    ix.d.famiglie.forEach(f => {
      o.push(`0 ${fid.get(f.id)} FAM`);
      const [a, b] = ordina(ix.p.get(f.coniuge1_id), ix.p.get(f.coniuge2_id));
      if (a) o.push("1 " + (a.sesso === "F" ? "WIFE " : "HUSB ") + pid.get(a.id));
      if (b) o.push("1 " + (b.sesso === "M" ? "HUSB " : "WIFE ") + pid.get(b.id));
      (ix.figliDi.get(f.id) || []).forEach(c => { if (pid.has(c)) o.push("1 CHIL " + pid.get(c)); });
      ix.d.eventi.filter(e => e.famiglia_id === f.id).forEach(scriviEv);
    });
    (fonti || []).forEach(s => {
      o.push(`0 ${sid.get(s.id)} SOUR`, "1 TITL " + s.titolo);
      if (s.archivio) o.push("1 PUBL " + s.archivio);
      if (s.url) o.push("1 NOTE " + s.url);
    });
    o.push("0 TRLR");
    return o.join("\n") + "\n";
  }

  return { L, TIPI, esc, indice, nome, parseData, evento, anno, luogoNome, vita, ordina, coppia, genitori, coniugi, figli, vivente, albero, vista, controlli, gedcom,
    parentela, cronologia, cronologiaGlobale, statistiche, ricorrenze, ics, incompleti, cerca, schedaVitaHtml, schedaFamigliaHtml, timelineHtml };
})();
