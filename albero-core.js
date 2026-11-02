// albero-core.js — Albero genealogico: modello dati, albero SVG, controlli, export GEDCOM.
// Condiviso da app.js (area privata) e da albero-pubblico.html. Nessuna dipendenza da Supabase.
const GEN = (() => {
  const L = { W: 164, H: 48, GX: 16, RIGA: 100 };
  const MESI_IT = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
  const MESI_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const TIPI = { nascita: "Nascita", morte: "Morte", matrimonio: "Matrimonio", residenza: "Residenza", ordinazione: "Ordinazione", altro: "Altro" };
  const COL = {
    M: { s: "#2ab8d9", f: "rgba(42,184,217,.12)" },
    F: { s: "#d96ab0", f: "rgba(217,106,176,.12)" },
    U: { s: "#7a8f99", f: "rgba(122,143,153,.12)" }
  };

  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // d = { persone, famiglie, figli, eventi, luoghi }
  function indice(d) {
    const ix = { d, p: new Map(), fam: new Map(), famConiuge: new Map(), famFiglio: new Map(), figliDi: new Map(), ev: new Map(), luogo: new Map() };
    d.persone.forEach(p => ix.p.set(p.id, p));
    d.famiglie.forEach(f => {
      ix.fam.set(f.id, f);
      [f.coniuge1_id, f.coniuge2_id].forEach(c => { if (c) push(ix.famConiuge, c, f.id); });
    });
    [...d.figli].sort((a, b) => (a.ordine || 0) - (b.ordine || 0)).forEach(r => {
      push(ix.figliDi, r.famiglia_id, r.persona_id);
      push(ix.famFiglio, r.persona_id, r.famiglia_id);
    });
    d.eventi.forEach(e => { if (e.persona_id) push(ix.ev, e.persona_id, e); });
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
  function albero(ix, rootId, opz) {
    opz = Object.assign({ gAvi: 4, gDisc: 3 }, opz || {});
    const { W, H, GX, RIGA } = L;
    const root = ix.p.get(rootId);
    if (!root) return { svg: "", w: 0, h: 0 };

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

    const els = [], lin = [];
    const box = (p, x, y, ev) => {
      const c = COL[p.sesso] || COL.U, sel = ev === "root";
      let n = nome(p); if (n.length > 23) n = n.slice(0, 22) + "…";
      const v = p.vivente ? "" : vita(ix, p.id);
      els.push(`<g class="gn" data-id="${p.id}" transform="translate(${x},${y})" style="cursor:pointer">` +
        `<rect width="${W}" height="${H}" rx="4" fill="${c.f}" stroke="${c.s}" stroke-width="${sel ? 2.6 : 1.2}"/>` +
        `<text x="${W / 2}" y="20" text-anchor="middle" font-family="Rajdhani,Segoe UI,sans-serif" font-size="14" font-weight="700" fill="#c8f2ff">${esc(n)}</text>` +
        `<text x="${W / 2}" y="37" text-anchor="middle" font-family="Rajdhani,Segoe UI,sans-serif" font-size="12" fill="#8fb8cc">${esc(v)}</text></g>`);
    };
    const gomito = (x1, y1, x2, y2) => { const m = (y1 + y2) / 2; lin.push(`<path d="M${x1},${y1} V${m} H${x2} V${y2}" fill="none" stroke="#2a7f99" stroke-width="1.2"/>`); };

    const rigaRoot = profA * RIGA;
    // posizioni discendenti (frame virtuale: sinistra del nodo radice = 0)
    let xr = 0;
    (function pos(n, left, y, isRoot) {
      const ux = left + (n.w - n.unitW) / 2;
      box(n.p, ux, y, isRoot ? "root" : "");
      if (isRoot) xr = ux + W / 2;
      n.sp.forEach((s, k) => {
        const sx = ux + (k + 1) * (W + GX);
        lin.push(`<line x1="${ux + k * (W + GX) + W}" y1="${y + H / 2}" x2="${sx}" y2="${y + H / 2}" stroke="#2a7f99" stroke-width="1.2"/>`);
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
    const Wa = Math.pow(2, profA) * (W + GX);
    const centro = (g, i) => xr + ((i + 0.5) / Math.pow(2, g) - 0.5) * Wa;
    for (let g = 1; g <= profA; g++) {
      livelli[g].forEach((p, i) => {
        if (!p) return;
        const y = (profA - g) * RIGA, cx = centro(g, i);
        box(p, cx - W / 2, y, "");
        const fx = g === 1 ? xr : centro(g - 1, i >> 1);
        gomito(fx, (profA - g + 1) * RIGA, cx, y + H);
      });
    }

    // dimensioni totali con margine
    const minX = Math.min(0, xr - Wa / 2), maxX = Math.max(nd.w, xr + Wa / 2);
    const maxDisc = (function prof(n) { return n.figli.length ? 1 + Math.max(...n.figli.map(prof)) : 0; })(nd);
    const pad = 24, w = maxX - minX + pad * 2, h = (profA + maxDisc) * RIGA + H + pad * 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<g transform="translate(${pad - minX},${pad})">${lin.join("")}${els.join("")}</g></svg>`;
    return { svg, w, h, cx: xr + pad - minX, cy: rigaRoot + pad + H / 2 };
  }

  // ---------- VISTA INTERATTIVA (trascina, zoom con rotella/pulsanti, clic = seleziona) ----------
  function vista(cont, ix, opz) {
    opz = opz || {};
    const st = { x: 0, y: 0, s: 1, w: 0, h: 0, cx: 0, cy: 0, root: null, gAvi: opz.gAvi || 4, gDisc: opz.gDisc || 3 };
    cont.classList.add("gen-vista");
    cont.style.touchAction = "none";
    cont.innerHTML = '<div class="gen-tela" style="transform-origin:0 0;position:absolute;left:0;top:0"></div>';
    const tela = cont.firstChild;
    const applica = () => { tela.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; };
    function adatta() {
      const cw = cont.clientWidth || 800, ch = cont.clientHeight || 500;
      st.s = Math.max(0.55, Math.min(1, cw / st.w));
      st.x = cw / 2 - st.cx * st.s;
      st.y = ch / 2 - st.cy * st.s;
      applica();
    }
    function imposta(rootId, nuovoIx) {
      if (nuovoIx) ix = nuovoIx;
      st.root = rootId;
      const r = albero(ix, rootId, { gAvi: st.gAvi, gDisc: st.gDisc });
      st.w = r.w; st.h = r.h; st.cx = r.cx; st.cy = r.cy;
      tela.innerHTML = r.svg;
      adatta();
    }
    function zoom(f, px, py) {
      px = px == null ? cont.clientWidth / 2 : px; py = py == null ? cont.clientHeight / 2 : py;
      const ns = Math.min(2.5, Math.max(0.15, st.s * f)), k = ns / st.s;
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
    return { imposta, zoom, adatta, st, svg: () => tela.querySelector("svg") };
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
    const evTag = { nascita: "BIRT", morte: "DEAT", residenza: "RESI", ordinazione: "ORDN", matrimonio: "MARR", altro: "EVEN" };
    const scriviEv = e => {
      o.push("1 " + evTag[e.tipo]);
      if (e.tipo === "altro" && e.titolo) o.push("2 TYPE " + e.titolo);
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

  return { L, TIPI, esc, indice, nome, parseData, evento, anno, luogoNome, vita, ordina, coppia, genitori, coniugi, figli, albero, vista, controlli, gedcom };
})();
