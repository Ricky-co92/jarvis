// albero.js — Modulo "Albero genealogico" di J.A.R.V.I.S.
// Richiede: app.js (sb, currentUser), albero-core.js (GEN), Leaflet, jsPDF + autotable.
// Tabelle: gen_* (vedi albero_genealogia.sql). Documenti nel bucket privato "gen-documenti".

const ALB = {
  d: null, ix: null, fonti: [], documenti: [], condivisioni: [],
  root: null, tab: "albero", vista: null, map: null, ed: null, caricato: false
};
const ALB_TAB = [["albero", "Albero"], ["persone", "Persone"], ["luoghi", "Luoghi e mappa"], ["fonti", "Fonti e documenti"], ["controlli", "Controlli"], ["condividi", "Condividi"]];
const ALB_TIPI_FONTE = ["Atto di nascita", "Atto di matrimonio", "Atto di morte", "Censimento", "Foto", "Lettera / documento", "Sito web", "Altro"];
const ALB_ORD_EV = ["nascita", "matrimonio", "residenza", "ordinazione", "altro", "morte"];

const $a = id => document.getElementById(id);
const esc = GEN.esc;

// ---------- CARICAMENTO ----------
async function albTutto(tabella) {
  let out = [], da = 0;
  for (;;) {
    const { data, error } = await sb.from(tabella).select("*").range(da, da + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    da += 1000;
  }
  return out;
}

async function albCarica() {
  const [persone, famiglie, figli, eventi, luoghi, fonti, documenti, condivisioni] =
    await Promise.all(["gen_persone", "gen_famiglie", "gen_figli", "gen_eventi", "gen_luoghi", "gen_fonti", "gen_documenti", "gen_condivisioni"].map(albTutto));
  ALB.d = { persone, famiglie, figli, eventi, luoghi };
  ALB.fonti = fonti; ALB.documenti = documenti; ALB.condivisioni = condivisioni;
  ALB.ix = GEN.indice(ALB.d);
  let r = null;
  try { r = localStorage.getItem("alb_root"); } catch (_) {}
  if (!r || !ALB.ix.p.has(r)) { const p = persone.find(x => x.rif_gedcom === "I282647190319") || persone[0]; r = p && p.id; }
  ALB.root = r;
  ALB.caricato = true;
}

function albErr(e) { console.error(e); alert("Errore: " + (e && e.message ? e.message : e)); }

// ---------- STILE ----------
function albStile() {
  if ($a("alb-style")) return;
  const s = document.createElement("style");
  s.id = "alb-style";
  s.textContent = `
  .alb-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .alb-tab{padding:8px 14px;border:1px solid rgba(42,184,217,.3);border-radius:3px;color:#8fb8cc;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:600;text-transform:uppercase;font-size:.85rem;letter-spacing:.3px}
  .alb-tab.active{color:#c8f2ff;border-color:#2ab8d9;background:rgba(42,184,217,.12)}
  .alb-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .alb-in,.alb-sel,.alb-ta{background:rgba(42,184,217,.05);border:1px solid rgba(42,184,217,.35);border-radius:3px;color:#c8f2ff;padding:8px 10px;font-family:inherit;font-size:.95rem;min-width:0}
  .alb-ta{width:100%;min-height:60px;resize:vertical}
  .alb-vista{position:relative;overflow:hidden;height:62vh;min-height:380px;border:1px solid rgba(42,184,217,.25);border-radius:4px;background:rgba(2,10,15,.6);cursor:grab;user-select:none}
  .alb-vista:active{cursor:grabbing}
  .alb-scheda{margin-top:12px;padding:12px 14px;border:1px solid rgba(42,184,217,.2);border-radius:4px;color:#c8f2ff}
  .alb-scheda small{color:#8fb8cc}
  .alb-table{width:100%;border-collapse:collapse;color:#c8f2ff;font-size:.95rem}
  .alb-table th{text-align:left;color:#4fc8e8;font-family:'Rajdhani',sans-serif;text-transform:uppercase;letter-spacing:.3px;padding:8px;border-bottom:1px solid rgba(42,184,217,.3)}
  .alb-table td{padding:7px 8px;border-bottom:1px solid rgba(42,184,217,.1);vertical-align:middle}
  .alb-table tr.cl{cursor:pointer}.alb-table tr.cl:hover{background:rgba(42,184,217,.08)}
  .alb-sez{margin:18px 0 8px;color:#4fc8e8;font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid rgba(42,184,217,.2);padding-bottom:4px}
  .alb-ev{display:grid;grid-template-columns:120px 1fr 1.2fr 1fr 32px;gap:6px;margin-bottom:6px}
  .alb-riga{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;color:#c8f2ff}
  .alb-link{color:#8fe8ff;cursor:pointer;text-decoration:underline dotted}
  .alb-x{cursor:pointer;color:#d96a6a;padding:0 6px}
  .alb-camp{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;color:#8fb8cc;font-size:.85rem}
  .alb-camp .alb-in,.alb-camp .alb-sel{font-size:.95rem}
  .alb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .alb-avv{color:#e8c36a}.alb-err{color:#e87a7a}
  #alb-map{height:340px;border:1px solid rgba(42,184,217,.25);border-radius:4px;margin-bottom:14px}
  @media(max-width:640px){.alb-ev{grid-template-columns:1fr 1fr}.alb-grid2{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}

// ---------- INIT / SHELL ----------
async function albInit() {
  albStile();
  const pannello = $a("albero-panel");
  if (!pannello.dataset.pronto) {
    pannello.dataset.pronto = "1";
    pannello.innerHTML = `
      <div class="panel-head">
        <div class="title">◈ albero genealogico</div>
        <div class="panel-actions">
          <button class="btn small ghost" id="alb-btn-gedcom">Esporta GEDCOM</button>
          <button class="btn small ghost" id="alb-btn-pdf-elenco">PDF elenco</button>
          <button class="btn small ghost" id="alb-btn-pdf-albero">PDF albero</button>
          <button class="btn small" id="alb-btn-nuova">+ Persona</button>
        </div>
      </div>
      <div class="alb-tabs" id="alb-tabs"></div>
      <div id="alb-body"></div>`;
    $a("alb-btn-nuova").onclick = () => albApriPersona(null);
    $a("alb-btn-gedcom").onclick = albEsportaGedcom;
    $a("alb-btn-pdf-elenco").onclick = albPdfElenco;
    $a("alb-btn-pdf-albero").onclick = albPdfAlbero;
    $a("alb-tabs").innerHTML = ALB_TAB.map(([k, t]) => `<div class="alb-tab" data-tab="${k}">${t}</div>`).join("");
    $a("alb-tabs").onclick = e => { const t = e.target.closest(".alb-tab"); if (t) { ALB.tab = t.dataset.tab; albRenderTab(); } };
  }
  if (!ALB.caricato) {
    $a("alb-body").innerHTML = `<div class="alb-scheda">Caricamento albero…</div>`;
    try { await albCarica(); }
    catch (e) {
      const mancano = e && (e.code === "42P01" || /does not exist|schema cache|relation/i.test(e.message || ""));
      $a("alb-body").innerHTML = `<div class="alb-scheda alb-err">${mancano
        ? "Tabelle dell'albero non trovate. Esegui il file <b>albero_genealogia.sql</b> nell'SQL Editor di Supabase, poi ricarica."
        : "Errore di caricamento: " + esc(e.message || e)}</div>`;
      return;
    }
  }
  albRenderTab();
}

async function albRicarica() { await albCarica(); albRenderTab(); }

function albRenderTab() {
  document.querySelectorAll(".alb-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === ALB.tab));
  if (ALB.map) { ALB.map.remove(); ALB.map = null; }
  ALB.vista = null;
  $a("alb-body").onclick = null;
  ({ albero: albTabAlbero, persone: albTabPersone, luoghi: albTabLuoghi, fonti: albTabFonti, controlli: albTabControlli, condividi: albTabCondividi })[ALB.tab]();
}

// ---------- UTILITÀ ----------
const albOrdPers = (a, b) => (a.cognome || "").localeCompare(b.cognome || "", "it") || (a.nome || "").localeCompare(b.nome || "", "it");
function albEtichetta(p) { const v = p.vivente ? "" : GEN.vita(ALB.ix, p.id); return GEN.nome(p) + (v ? " (" + v + ")" : ""); }
function albOpzPersone(escludi, sel) {
  return [...ALB.d.persone].filter(p => p.id !== escludi).sort(albOrdPers)
    .map(p => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${esc(albEtichetta(p))}</option>`).join("");
}
function albScaricaTesto(nome, testo, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([testo], { type: mime }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const albOggi = () => new Date().toISOString().slice(0, 10);

// ---------- TAB: ALBERO ----------
function albTabAlbero() {
  const conta = {};
  const etichette = new Map();
  ALB.d.persone.forEach(p => { const e = albEtichetta(p); conta[e] = (conta[e] || 0) + 1; etichette.set(conta[e] > 1 ? `${e} · n.${conta[e]}` : e, p.id); });
  $a("alb-body").innerHTML = `
    <div class="alb-bar">
      <input class="alb-in" id="alb-cerca" list="alb-dl" placeholder="Cerca e vai a una persona…" style="flex:1;min-width:200px">
      <datalist id="alb-dl">${[...etichette.keys()].map(k => `<option value="${esc(k)}">`).join("")}</datalist>
      <button class="btn small ghost" id="alb-zm-p">＋</button><button class="btn small ghost" id="alb-zm-m">－</button>
      <button class="btn small ghost" id="alb-zm-r">Centra</button>
      <label style="color:#8fb8cc;font-size:.85rem">Antenati
        <select class="alb-sel" id="alb-gavi">${[2, 3, 4, 5, 6].map(n => `<option${n === 4 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label style="color:#8fb8cc;font-size:.85rem">Discendenti
        <select class="alb-sel" id="alb-gdisc">${[1, 2, 3, 4, 5].map(n => `<option${n === 3 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>
    <div class="alb-vista" id="alb-vista"></div>
    <div class="alb-scheda" id="alb-scheda"></div>
    <div style="color:#8fb8cc;font-size:.8rem;margin-top:6px">Trascina per spostare · rotella per zoom · clic su una persona per aprire la scheda (da lì puoi centrarla nell'albero).</div>`;
  ALB.vista = GEN.vista($a("alb-vista"), ALB.ix, {
    onSeleziona: id => albApriScheda(id)
  });
  $a("alb-cerca").onchange = e => { const id = etichette.get(e.target.value); if (id) { ALB.root = id; e.target.value = ""; albAggiornaAlbero(); } };
  $a("alb-zm-p").onclick = () => ALB.vista.zoom(1.25);
  $a("alb-zm-m").onclick = () => ALB.vista.zoom(0.8);
  $a("alb-zm-r").onclick = () => ALB.vista.adatta();
  $a("alb-gavi").onchange = e => { ALB.vista.st.gAvi = +e.target.value; albAggiornaAlbero(); };
  $a("alb-gdisc").onchange = e => { ALB.vista.st.gDisc = +e.target.value; albAggiornaAlbero(); };
  albAggiornaAlbero();
}

function albAggiornaAlbero() {
  if (!ALB.vista || !ALB.root) { if ($a("alb-scheda")) $a("alb-scheda").textContent = "Nessuna persona: usa “+ Persona” per iniziare."; return; }
  ALB.vista.imposta(ALB.root, ALB.ix);
  const p = ALB.ix.p.get(ALB.root), ix = ALB.ix;
  const nasc = GEN.evento(ix, p.id, "nascita"), mor = GEN.evento(ix, p.id, "morte");
  const g = GEN.genitori(ix, p.id), cons = GEN.coniugi(ix, p.id).map(c => c.altro).filter(Boolean), fg = GEN.figli(ix, p.id);
  const riga = (t, v) => v ? `<div><small>${t}:</small> ${v}</div>` : "";
  $a("alb-scheda").innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><b style="font-size:1.1rem">${esc(GEN.nome(p))}</b> <small>${esc(GEN.vita(ix, p.id))}</small></div>
      <button class="btn small ghost" id="alb-apri-root">Apri scheda</button></div>
    ${riga("Nato", esc([nasc && nasc.data_testo, GEN.luogoNome(ix, nasc)].filter(Boolean).join(" · ")))}
    ${riga("Morto", esc([mor && mor.data_testo, GEN.luogoNome(ix, mor)].filter(Boolean).join(" · ")))}
    ${riga("Genitori", esc([g.padre, g.madre].filter(Boolean).map(GEN.nome).join(" e ")))}
    ${riga("Coniugi", esc(cons.map(GEN.nome).join(", ")))}
    ${riga("Figli", esc(fg.map(GEN.nome).join(", ")))}`;
  $a("alb-apri-root").onclick = () => albApriScheda(p.id);
}

// ---------- TAB: PERSONE ----------
function albTabPersone() {
  $a("alb-body").innerHTML = `
    <div class="alb-bar"><input class="alb-in" id="alb-filtro" placeholder="Filtra per nome, cognome o luogo…" style="flex:1;min-width:200px">
      <span style="color:#8fb8cc" id="alb-conta"></span></div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Nome</th><th>Nascita</th><th>Luogo nascita</th><th>Morte</th><th>Fonti</th></tr></thead><tbody id="alb-persone-tb"></tbody></table></div>`;
  const disegna = () => {
    const q = $a("alb-filtro").value.trim().toLowerCase();
    const righe = [...ALB.d.persone].sort(albOrdPers).map(p => {
      const n = GEN.evento(ALB.ix, p.id, "nascita"), m = GEN.evento(ALB.ix, p.id, "morte");
      return { p, n, m, luogo: GEN.luogoNome(ALB.ix, n), nf: ALB.fonti.filter(f => f.persona_id === p.id).length + ALB.documenti.filter(f => f.persona_id === p.id).length };
    }).filter(r => !q || (GEN.nome(r.p) + " " + r.luogo).toLowerCase().includes(q));
    $a("alb-conta").textContent = righe.length + " persone";
    $a("alb-persone-tb").innerHTML = righe.map(r => `<tr class="cl" data-id="${r.p.id}">
      <td>${esc(GEN.nome(r.p))}</td><td>${esc(r.n && r.n.data_testo || "")}</td><td>${esc(r.luogo)}</td>
      <td>${esc(r.m && r.m.data_testo || "")}</td><td>${r.nf || ""}</td></tr>`).join("");
  };
  $a("alb-filtro").oninput = disegna;
  $a("alb-persone-tb").onclick = e => { const tr = e.target.closest("tr"); if (tr) albApriScheda(tr.dataset.id); };
  disegna();
}

// ---------- TAB: LUOGHI E MAPPA ----------
function albTabLuoghi() {
  $a("alb-body").innerHTML = `
    <div id="alb-map"></div>
    <div class="alb-bar"><button class="btn small" id="alb-luogo-nuovo">+ Luogo</button>
      <span style="color:#8fb8cc;font-size:.85rem">Le coordinate sono approssimative: correggile o usa “Cerca” (OpenStreetMap).</span></div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Luogo</th><th>Lat</th><th>Lng</th><th>Eventi</th><th></th></tr></thead><tbody id="alb-luoghi-tb"></tbody></table></div>`;
  const luoghi = [...ALB.d.luoghi].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  $a("alb-luoghi-tb").innerHTML = luoghi.map(l => `<tr data-id="${l.id}">
    <td><input class="alb-in" data-f="nome" value="${esc(l.nome)}" style="width:100%;min-width:220px"></td>
    <td><input class="alb-in" data-f="lat" type="number" step="any" value="${l.lat == null ? "" : l.lat}" style="width:100px"></td>
    <td><input class="alb-in" data-f="lng" type="number" step="any" value="${l.lng == null ? "" : l.lng}" style="width:100px"></td>
    <td>${ALB.d.eventi.filter(e => e.luogo_id === l.id).length}</td>
    <td style="white-space:nowrap"><button class="btn small ghost" data-az="cerca">Cerca</button> <span class="alb-x" data-az="elimina" title="Elimina luogo">✕</span></td></tr>`).join("");
  $a("alb-luoghi-tb").onchange = async e => {
    const tr = e.target.closest("tr"), f = e.target.dataset.f; if (!tr || !f) return;
    let v = e.target.value.trim();
    if (f !== "nome") v = v === "" ? null : parseFloat(v);
    const { error } = await sb.from("gen_luoghi").update({ [f]: v }).eq("id", tr.dataset.id);
    if (error) return albErr(error);
    await albRicarica();
  };
  $a("alb-luoghi-tb").onclick = async e => {
    const az = e.target.dataset.az, tr = e.target.closest("tr"); if (!az || !tr) return;
    const l = ALB.d.luoghi.find(x => x.id === tr.dataset.id);
    if (az === "elimina") {
      if (!confirm(`Eliminare il luogo “${l.nome}”? Gli eventi restano, senza luogo collegato.`)) return;
      const { error } = await sb.from("gen_luoghi").delete().eq("id", l.id); if (error) return albErr(error);
      await albRicarica();
    } else if (az === "cerca") {
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(l.nome));
        const j = await r.json();
        if (!j.length) return alert("Nessun risultato per “" + l.nome + "”.");
        const { error } = await sb.from("gen_luoghi").update({ lat: +j[0].lat, lng: +j[0].lon }).eq("id", l.id);
        if (error) return albErr(error);
        await albRicarica();
      } catch (err) { albErr(err); }
    }
  };
  $a("alb-luogo-nuovo").onclick = async () => {
    const nome = (prompt("Nome del luogo (es. Busalla, Genova, Liguria, Italia):") || "").trim();
    if (!nome) return;
    const { error } = await sb.from("gen_luoghi").insert({ nome }); if (error) return albErr(error);
    await albRicarica();
  };
  // mappa
  ALB.map = L.map("alb-map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(ALB.map);
  const punti = [];
  luoghi.filter(l => l.lat != null && l.lng != null).forEach(l => {
    const evs = ALB.d.eventi.filter(e => e.luogo_id === l.id && e.persona_id);
    const righe = evs.slice(0, 12).map(e => `${esc(GEN.nome(ALB.ix.p.get(e.persona_id)))} <small>(${esc(GEN.TIPI[e.tipo] || e.tipo)}${e.data_testo ? " " + esc(e.data_testo) : ""})</small>`);
    L.marker([l.lat, l.lng]).addTo(ALB.map).bindPopup(`<b>${esc(l.nome)}</b><br>${righe.join("<br>")}${evs.length > 12 ? "<br>… +" + (evs.length - 12) : ""}`);
    punti.push([l.lat, l.lng]);
  });
  if (punti.length) ALB.map.fitBounds(punti, { padding: [30, 30], maxZoom: 9 }); else ALB.map.setView([44.5, 9], 5);
  setTimeout(() => ALB.map && ALB.map.invalidateSize(), 100);
}

// ---------- TAB: FONTI E DOCUMENTI ----------
function albTabFonti() {
  const nomeP = id => esc(GEN.nome(ALB.ix.p.get(id)));
  $a("alb-body").innerHTML = `
    <div class="alb-sez">Fonti (${ALB.fonti.length})</div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Persona</th><th>Titolo</th><th>Tipo</th><th>Archivio</th><th>Link</th></tr></thead><tbody>
    ${ALB.fonti.map(f => `<tr class="cl" data-p="${f.persona_id || ""}"><td>${f.persona_id ? nomeP(f.persona_id) : ""}</td><td>${esc(f.titolo)}</td><td>${esc(f.tipo || "")}</td><td>${esc(f.archivio || "")}</td>
      <td>${f.url ? `<a class="alb-link" href="${esc(f.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">apri</a>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" style="color:#8fb8cc">Nessuna fonte. Aggiungile dalla scheda di una persona.</td></tr>`}
    </tbody></table></div>
    <div class="alb-sez">Documenti (${ALB.documenti.length})</div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Persona</th><th>File</th><th>Caricato</th><th></th></tr></thead><tbody>
    ${ALB.documenti.map(x => `<tr class="cl" data-p="${x.persona_id || ""}"><td>${x.persona_id ? nomeP(x.persona_id) : ""}</td><td>${esc(x.nome)}</td><td>${esc((x.created_at || "").slice(0, 10))}</td>
      <td><button class="btn small ghost" data-doc="${x.id}">Scarica</button></td></tr>`).join("") || `<tr><td colspan="4" style="color:#8fb8cc">Nessun documento.</td></tr>`}
    </tbody></table></div>`;
  $a("alb-body").onclick = e => {
    const d = e.target.closest("[data-doc]");
    if (d) { e.stopPropagation(); return albApriDoc(d.dataset.doc); }
    const tr = e.target.closest("tr[data-p]"); if (tr && tr.dataset.p) albApriScheda(tr.dataset.p);
  };
}

// ---------- TAB: CONTROLLI ----------
function albTabControlli() {
  const c = GEN.controlli(ALB.ix);
  $a("alb-body").innerHTML = `<div style="color:#8fb8cc;margin-bottom:10px">${c.length ? c.length + " segnalazioni (non modificano i dati: correggi dalla scheda persona)" : "Nessuna anomalia trovata."}</div>
    <div style="overflow-x:auto"><table class="alb-table"><tbody>${c.map(x => `<tr class="${x.pid ? "cl" : ""}" data-id="${x.pid || ""}">
      <td class="${x.gravita === "errore" ? "alb-err" : "alb-avv"}" style="width:30px">${x.gravita === "errore" ? "✖" : "⚠"}</td><td>${esc(x.testo)}</td></tr>`).join("")}</tbody></table></div>`;
  $a("alb-body").onclick = e => { const tr = e.target.closest("tr[data-id]"); if (tr && tr.dataset.id) albApriScheda(tr.dataset.id); };
}

// ---------- TAB: CONDIVIDI ----------
function albLink(t) { return new URL("albero-pubblico.html", location.href).href.split("#")[0] + "#" + t; }
function albTabCondividi() {
  $a("alb-body").innerHTML = `
    <div class="alb-scheda" style="margin:0 0 12px">Crea un link di <b>sola lettura</b> per i parenti. Le persone viventi (senza data di morte e nate negli ultimi 100 anni, o senza data di nascita e senza figli nati da oltre 90 anni) appaiono come “Vivente”, senza date, luoghi o note. Note, fonti e documenti non vengono mai condivisi. Puoi disattivare o eliminare il link in qualsiasi momento.
      Per escludere/includere una persona, cambia “Stato in vita” nella sua scheda.</div>
    <div class="alb-bar"><button class="btn small" id="alb-link-nuovo">+ Nuovo link</button></div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Etichetta</th><th>Link</th><th>Stato</th><th></th></tr></thead><tbody>
    ${ALB.condivisioni.map(c => `<tr data-id="${c.id}"><td>${esc(c.etichetta || "")}</td>
      <td><input class="alb-in" readonly value="${esc(albLink(c.token))}" style="width:100%;min-width:260px" onclick="this.select()"></td>
      <td>${c.attiva ? "attivo" : "disattivato"}</td>
      <td style="white-space:nowrap"><button class="btn small ghost" data-az="copia">Copia</button> <button class="btn small ghost" data-az="toggle">${c.attiva ? "Disattiva" : "Attiva"}</button> <span class="alb-x" data-az="elimina">✕</span></td></tr>`).join("") || `<tr><td colspan="4" style="color:#8fb8cc">Nessun link creato.</td></tr>`}
    </tbody></table></div>`;
  $a("alb-link-nuovo").onclick = async () => {
    const etichetta = prompt("Per chi è questo link? (es. Cugini Repetto)") || "";
    const { error } = await sb.from("gen_condivisioni").insert({ etichetta: etichetta.trim() || null });
    if (error) return albErr(error);
    await albRicarica();
  };
  $a("alb-body").onclick = async e => {
    const az = e.target.dataset.az, tr = e.target.closest("tr[data-id]"); if (!az || !tr) return;
    const c = ALB.condivisioni.find(x => x.id === tr.dataset.id);
    if (az === "copia") { try { await navigator.clipboard.writeText(albLink(c.token)); e.target.textContent = "Copiato"; } catch (_) { tr.querySelector("input").select(); } }
    else if (az === "toggle") { const { error } = await sb.from("gen_condivisioni").update({ attiva: !c.attiva }).eq("id", c.id); if (error) return albErr(error); await albRicarica(); }
    else if (az === "elimina") { if (!confirm("Eliminare il link? Chi lo possiede non potrà più aprirlo.")) return; const { error } = await sb.from("gen_condivisioni").delete().eq("id", c.id); if (error) return albErr(error); await albRicarica(); }
  };
}

// ---------- SCHEDA PERSONA (modale) ----------
function albModale(id, titolo, corpo, largo) {
  let m = $a(id);
  if (m) m.remove();
  m = document.createElement("div");
  m.id = id; m.className = "modal-overlay";
  m.style.zIndex = id === "alb-modal2" ? 60 : 55;
  m.innerHTML = `<div class="modal" style="max-width:${largo || 720}px"><span class="modal-close" data-chiudi>✕</span><div class="title">${titolo}</div>${corpo}</div>`;
  m.querySelector("[data-chiudi]").onclick = () => m.remove();
  document.body.appendChild(m);
  return m;
}

function albRigaEv(e) {
  const tipi = Object.keys(GEN.TIPI).map(k => `<option value="${k}"${k === e.tipo ? " selected" : ""}>${GEN.TIPI[k]}</option>`).join("");
  return `<div class="alb-ev" data-eid="${e.id || ""}">
    <select class="alb-sel" data-f="tipo">${tipi}</select>
    <input class="alb-in" data-f="data_testo" placeholder="Data (28 mag 1992 / 1940)" value="${esc(e.data_testo || "")}">
    <input class="alb-in" data-f="luogo" list="alb-luoghi-dl" placeholder="Luogo" value="${esc(e.luogo || "")}">
    <input class="alb-in" data-f="titolo" placeholder="Titolo (se “Altro”)" value="${esc(e.titolo || "")}">
    <span class="alb-x" data-az="ev-del" title="Rimuovi">✕</span></div>`;
}

function albApriPersona(id) {
  const ix = ALB.ix;
  const p = id ? ix.p.get(id) : { nome: "", cognome: "", sesso: "U", stato_vita: "auto", note: "" };
  if (id && !p) return;
  const eventi = id ? [...(ix.ev.get(id) || [])].map(e => ({ ...e, luogo: GEN.luogoNome(ix, e) }))
    .sort((a, b) => ALB_ORD_EV.indexOf(a.tipo) - ALB_ORD_EV.indexOf(b.tipo)) : [{ tipo: "nascita" }];
  let rel = "";
  if (id) {
    const g = GEN.genitori(ix, id), cons = GEN.coniugi(ix, id), fg = GEN.figli(ix, id);
    const nm = (q, ruolo, extra) => `<div class="alb-riga">${ruolo ? `<small>${ruolo}:</small>` : ""}<span class="alb-link" data-az="apri" data-id="${q.id}">${esc(GEN.nome(q))}</span> <small>${esc(GEN.vita(ix, q.id))}</small>${extra || ""}</div>`;
    rel = `<div class="alb-sez">Famiglia</div>
      ${g.padre ? nm(g.padre, "Padre", `<span class="alb-x" data-az="rel-del" data-t="genitore" data-id="${g.padre.id}" title="Scollega">✕</span>`) : ""}
      ${g.madre ? nm(g.madre, "Madre", `<span class="alb-x" data-az="rel-del" data-t="genitore" data-id="${g.madre.id}" title="Scollega">✕</span>`) : ""}
      ${cons.filter(c => c.altro).map(c => nm(c.altro, "Coniuge", `<span class="alb-x" data-az="rel-del" data-t="coniuge" data-id="${c.altro.id}" data-fam="${c.fam}" title="Scollega">✕</span>`)).join("")}
      ${fg.map(c => nm(c, "Figlio/a", `<span class="alb-x" data-az="rel-del" data-t="figlio" data-id="${c.id}" title="Scollega">✕</span>`)).join("")}
      <div class="alb-bar" style="margin-top:8px"><button class="btn small ghost" data-az="rel-add" data-t="genitore">+ Genitore</button>
        <button class="btn small ghost" data-az="rel-add" data-t="coniuge">+ Coniuge</button>
        <button class="btn small ghost" data-az="rel-add" data-t="figlio">+ Figlio/a</button></div>`;
  } else rel = `<div class="alb-scheda" style="margin-top:14px"><small>Salva la persona per aggiungere relazioni, fonti e documenti.</small></div>`;

  let fd = "";
  if (id) {
    const fonti = ALB.fonti.filter(f => f.persona_id === id), docs = ALB.documenti.filter(f => f.persona_id === id);
    fd = `<div class="alb-sez">Fonti</div>
      ${fonti.map(f => `<div class="alb-riga"><b>${esc(f.titolo)}</b> <small>${esc(f.tipo || "")}${f.archivio ? " · " + esc(f.archivio) : ""}</small>
        ${f.url ? `<a class="alb-link" href="${esc(f.url)}" target="_blank" rel="noopener">link</a>` : ""}<span class="alb-x" data-az="fonte-del" data-id="${f.id}">✕</span></div>`).join("")}
      <div class="alb-bar"><button class="btn small ghost" data-az="fonte-add">+ Fonte</button></div>
      <div class="alb-sez">Documenti</div>
      ${docs.map(x => `<div class="alb-riga"><span class="alb-link" data-az="doc-dl" data-id="${x.id}">${esc(x.nome)}</span><span class="alb-x" data-az="doc-del" data-id="${x.id}">✕</span></div>`).join("")}
      <div class="alb-bar"><label class="btn small ghost" style="cursor:pointer">+ Carica file<input type="file" id="alb-file" hidden multiple></label></div>`;
  }

  const m = albModale("alb-modal", id ? "Scheda: " + esc(GEN.nome(p)) : "Nuova persona", `
    <datalist id="alb-luoghi-dl">${ALB.d.luoghi.map(l => `<option value="${esc(l.nome)}">`).join("")}</datalist>
    <div class="alb-grid2">
      <label class="alb-camp">Nome<input class="alb-in" name="nome" value="${esc(p.nome === "?" ? "" : p.nome || "")}"></label>
      <label class="alb-camp">Cognome<input class="alb-in" name="cognome" value="${esc(p.cognome || "")}"></label>
      <label class="alb-camp">Sesso<select class="alb-sel" name="sesso">${[["M", "Maschio"], ["F", "Femmina"], ["U", "Non indicato"]].map(([k, t]) => `<option value="${k}"${p.sesso === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="alb-camp">Stato in vita (per la condivisione)<select class="alb-sel" name="stato_vita">${[["auto", "Automatico"], ["vivente", "Vivente"], ["deceduto", "Deceduto"]].map(([k, t]) => `<option value="${k}"${p.stato_vita === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <div class="alb-sez">Eventi</div>
    <div id="alb-evlist">${eventi.map(albRigaEv).join("")}</div>
    <div class="alb-bar"><button class="btn small ghost" data-az="ev-add">+ Evento</button></div>
    <label class="alb-camp">Note<textarea class="alb-ta" name="note">${esc(p.note || "")}</textarea></label>
    ${rel}${fd}
    <div class="modal-actions" style="margin-top:18px">
      ${id ? `<button class="btn small ghost" data-az="elimina">Elimina persona</button>` : "<span></span>"}
      <span><button class="btn small ghost" data-az="albero" style="${id ? "" : "display:none"}">Mostra nell'albero</button> <button class="btn small" data-az="salva">Salva</button></span>
    </div>`);

  m.onclick = async e => {
    const t = e.target.closest("[data-az]"); if (!t) return;
    const az = t.dataset.az;
    if (az === "ev-add") $a("alb-evlist").insertAdjacentHTML("beforeend", albRigaEv({ tipo: "altro" }));
    else if (az === "ev-del") t.closest(".alb-ev").remove();
    else if (az === "salva") albSalvaPersona(id);
    else if (az === "apri") albApriPersona(t.dataset.id);
    else if (az === "albero") { ALB.root = id; ALB.tab = "albero"; m.remove(); albRenderTab(); }
    else if (az === "elimina") albEliminaPersona(id);
    else if (az === "rel-add") albFormRelazione(t.dataset.t, id);
    else if (az === "rel-del") albScollega(t.dataset.t, id, t.dataset.id, t.dataset.fam);
    else if (az === "fonte-add") albFormFonte(id);
    else if (az === "fonte-del") { if (!confirm("Eliminare la fonte?")) return; const { error } = await sb.from("gen_fonti").delete().eq("id", t.dataset.id); if (error) return albErr(error); await albRicarica(); albApriPersona(id); }
    else if (az === "doc-dl") albApriDoc(t.dataset.id);
    else if (az === "doc-del") albEliminaDoc(t.dataset.id, id);
  };
  const file = $a("alb-file");
  if (file) file.onchange = async e => {
    for (const f of e.target.files) {
      const nomeSicuro = f.name.replace(/[^\w.\-]+/g, "_");
      const percorso = `${currentUser.id}/${id}/${Date.now()}_${nomeSicuro}`;
      const up = await sb.storage.from("gen-documenti").upload(percorso, f, { contentType: f.type || undefined });
      if (up.error) return albErr(up.error);
      const { error } = await sb.from("gen_documenti").insert({ persona_id: id, nome: f.name, percorso, mime: f.type || null });
      if (error) return albErr(error);
    }
    await albRicarica(); albApriPersona(id);
  };
}

// ---------- SCHEDA PERSONA (sola lettura, con tutti i collegamenti) ----------
function albEta(ix, id) {
  const n = GEN.anno(GEN.evento(ix, id, "nascita")), m = GEN.anno(GEN.evento(ix, id, "morte")), oggi = new Date().getFullYear();
  if (n && m) return `${m - n} anni alla morte`;
  if (n && oggi - n <= 100) return `circa ${oggi - n} anni`;
  return "";
}

function albApriScheda(id) {
  const ix = ALB.ix, p = ix.p.get(id);
  if (!p) return;
  const nm = q => `<span class="alb-link" data-az="scheda" data-id="${q.id}">${esc(GEN.nome(q))}</span> <small>${esc(GEN.vita(ix, q.id))}</small>`;
  const uniq = arr => { const v = new Set(); return arr.filter(x => x && !v.has(x.id) && v.add(x.id)); };
  const lista = (t, arr) => arr.length ? `<div class="alb-riga" style="align-items:flex-start"><small style="min-width:92px">${t}:</small><span>${arr.map(nm).join(" · ")}</span></div>` : "";

  const g = GEN.genitori(ix, id), genitori = [g.padre, g.madre].filter(Boolean);
  const fratelli = uniq((ix.famFiglio.get(id) || []).flatMap(fid => (ix.figliDi.get(fid) || []).map(c => ix.p.get(c))).filter(x => x && x.id !== id));
  const nonni = uniq(genitori.flatMap(gp => { const gg = GEN.genitori(ix, gp.id); return [gg.padre, gg.madre]; }));
  const zii = uniq(genitori.flatMap(gp => (ix.famFiglio.get(gp.id) || []).flatMap(fid => (ix.figliDi.get(fid) || []).map(c => ix.p.get(c))).filter(x => x && x.id !== gp.id)));
  const figli = GEN.figli(ix, id);
  const nipoti = uniq(figli.flatMap(c => GEN.figli(ix, c.id)));
  const unioni = GEN.coniugi(ix, id).map(c => {
    const fg = (ix.figliDi.get(c.fam) || []).map(x => ix.p.get(x)).filter(Boolean);
    return `<div class="alb-riga" style="align-items:flex-start"><small style="min-width:92px">Coniuge:</small><span>${c.altro ? nm(c.altro) : "<small>(non indicato)</small>"}${fg.length ? ` <small>— figli insieme:</small> ${fg.map(nm).join(" · ")}` : ""}</span></div>`;
  }).join("");

  const eventi = [...(ix.ev.get(id) || [])].sort((a, b) => ALB_ORD_EV.indexOf(a.tipo) - ALB_ORD_EV.indexOf(b.tipo));
  const righeEv = eventi.map(e => `<div class="alb-riga"><b style="min-width:92px">${esc(e.tipo === "altro" && e.titolo ? e.titolo : GEN.TIPI[e.tipo] || e.tipo)}</b>
    <span>${esc([e.data_testo, GEN.luogoNome(ix, e)].filter(Boolean).join(" · ") || "—")}${e.tipo === "altro" || !e.titolo ? "" : " <small>" + esc(e.titolo) + "</small>"}${e.note ? ` <small>(${esc(e.note)})</small>` : ""}</span></div>`).join("");
  const fonti = ALB.fonti.filter(f => f.persona_id === id), docs = ALB.documenti.filter(f => f.persona_id === id);
  const eta = albEta(ix, id), sesso = { M: "Maschio", F: "Femmina", U: "" }[p.sesso];
  const haFam = genitori.length || fratelli.length || unioni || figli.length || nonni.length || nipoti.length || zii.length;

  const m = albModale("alb-scheda-modal", esc(GEN.nome(p)), `
    <div style="color:#8fb8cc;margin:-10px 0 10px">${esc([GEN.vita(ix, id), eta, sesso].filter(Boolean).join(" · "))}</div>
    ${righeEv ? `<div class="alb-sez" style="margin-top:6px">Vita</div>${righeEv}` : ""}
    <div class="alb-sez">Famiglia</div>
    ${lista("Genitori", genitori)}${lista("Fratelli/sorelle", fratelli)}${unioni}${lista("Figli", figli)}
    ${lista("Nonni", nonni)}${lista("Zii", zii)}${lista("Nipoti", nipoti)}
    ${haFam ? "" : `<div style="color:#8fb8cc">Nessun legame registrato.</div>`}
    ${p.note ? `<div class="alb-sez">Note</div><div style="white-space:pre-wrap">${esc(p.note)}</div>` : ""}
    ${fonti.length ? `<div class="alb-sez">Fonti</div>${fonti.map(f => `<div class="alb-riga"><b>${esc(f.titolo)}</b> <small>${esc([f.tipo, f.archivio].filter(Boolean).join(" · "))}</small>${f.url ? ` <a class="alb-link" href="${esc(f.url)}" target="_blank" rel="noopener">link</a>` : ""}</div>`).join("")}` : ""}
    ${docs.length ? `<div class="alb-sez">Documenti</div>${docs.map(x => `<div class="alb-riga"><span class="alb-link" data-az="doc-dl" data-id="${x.id}">${esc(x.nome)}</span></div>`).join("")}` : ""}
    <div class="modal-actions" style="margin-top:18px">
      <button class="btn small ghost" data-az="centra">Centra nell'albero</button>
      <button class="btn small" data-az="modifica">Modifica</button>
    </div>`, 640);

  m.onclick = e => {
    const t = e.target.closest("[data-az]"); if (!t) return;
    const az = t.dataset.az;
    if (az === "scheda") albApriScheda(t.dataset.id);
    else if (az === "doc-dl") albApriDoc(t.dataset.id);
    else if (az === "modifica") { m.remove(); albApriPersona(id); }
    else if (az === "centra") {
      ALB.root = id; try { localStorage.setItem("alb_root", id); } catch (_) {}
      m.remove(); ALB.tab = "albero"; albRenderTab();
    }
  };
}

async function albLuogoId(nome) {
  const n = nome.trim().toLowerCase();
  let l = ALB.d.luoghi.find(x => x.nome.toLowerCase() === n);
  if (l) return l.id;
  const { data, error } = await sb.from("gen_luoghi").insert({ nome: nome.trim() }).select().single();
  if (error) throw error;
  ALB.d.luoghi.push(data);
  return data.id;
}

async function albSalvaPersona(id) {
  const m = $a("alb-modal");
  const v = n => m.querySelector(`[name=${n}]`).value.trim();
  const dati = { nome: v("nome") || null, cognome: v("cognome") || null, sesso: v("sesso"), stato_vita: v("stato_vita"), note: v("note") || null };
  if (!dati.nome && !dati.cognome) return alert("Inserisci almeno nome o cognome.");
  try {
    const nuova = !id;
    if (id) { const { error } = await sb.from("gen_persone").update(dati).eq("id", id); if (error) throw error; }
    else { const { data, error } = await sb.from("gen_persone").insert(dati).select().single(); if (error) throw error; id = data.id; }
    const esistenti = new Map((ALB.ix && ALB.ix.ev.get(id) || []).map(e => [e.id, e]));
    const tenuti = new Set();
    for (const r of m.querySelectorAll(".alb-ev")) {
      const g = f => r.querySelector(`[data-f=${f}]`).value.trim();
      const tipo = g("tipo"), dt = g("data_testo"), luogo = g("luogo"), titolo = g("titolo");
      if (!dt && !luogo && !titolo) continue;
      const pd = GEN.parseData(dt), luogo_id = luogo ? await albLuogoId(luogo) : null;
      const riga = { persona_id: id, tipo, titolo: titolo || null, data_testo: dt || null, data_iso: pd.data_iso, precisione: pd.precisione, luogo_id, luogo_testo: luogo_id ? null : (luogo || null) };
      if (r.dataset.eid) { tenuti.add(r.dataset.eid); const { error } = await sb.from("gen_eventi").update(riga).eq("id", r.dataset.eid); if (error) throw error; }
      else { const { error } = await sb.from("gen_eventi").insert(riga); if (error) throw error; }
    }
    for (const eid of esistenti.keys()) if (!tenuti.has(eid)) { const { error } = await sb.from("gen_eventi").delete().eq("id", eid); if (error) throw error; }
    if (!ALB.root) ALB.root = id;
    await albRicarica();
    m.remove(); if (nuova) albApriPersona(id); else albApriScheda(id);
  } catch (e) { albErr(e); }
}

async function albEliminaPersona(id) {
  const p = ALB.ix.p.get(id);
  if (!confirm(`Eliminare definitivamente ${GEN.nome(p)} con eventi, fonti e documenti? I legami familiari verranno rimossi.`)) return;
  try {
    const docs = ALB.documenti.filter(x => x.persona_id === id).map(x => x.percorso);
    if (docs.length) await sb.storage.from("gen-documenti").remove(docs);
    const { error } = await sb.from("gen_persone").delete().eq("id", id); if (error) throw error;
    if (ALB.root === id) ALB.root = null;
    $a("alb-modal").remove();
    await albRicarica();
  } catch (e) { albErr(e); }
}

// ---------- RELAZIONI ----------
const albSlot = p => (p && p.sesso === "F") ? "coniuge2_id" : "coniuge1_id";

function albFormRelazione(tipo, pid) {
  const p = ALB.ix.p.get(pid), cons = GEN.coniugi(ALB.ix, pid);
  const titolo = { genitore: "Aggiungi genitore a ", coniuge: "Aggiungi coniuge a ", figlio: "Aggiungi figlio/a a " }[tipo] + esc(GEN.nome(p));
  const scelta = tipo === "figlio" && cons.length > 1
    ? `<label class="alb-camp">Con quale coniuge<select class="alb-sel" name="fam">${cons.map(c => `<option value="${c.fam}">${esc(c.altro ? GEN.nome(c.altro) : "(coniuge sconosciuto)")}</option>`).join("")}</select></label>` : "";
  const m = albModale("alb-modal2", titolo, `
    <label class="alb-camp">Persona già presente nell'albero<select class="alb-sel" name="esistente"><option value="">— nuova persona —</option>${albOpzPersone(pid)}</select></label>
    <div id="alb-nuova"><div class="alb-grid2">
      <label class="alb-camp">Nome<input class="alb-in" name="nome"></label>
      <label class="alb-camp">Cognome<input class="alb-in" name="cognome"></label></div>
      <label class="alb-camp">Sesso<select class="alb-sel" name="sesso"><option value="U">Non indicato</option><option value="M">Maschio</option><option value="F">Femmina</option></select></label></div>
    ${scelta}
    <div class="modal-actions" style="margin-top:14px"><span></span><button class="btn small" data-az="ok">Conferma</button></div>`, 520);
  const sel = m.querySelector("[name=esistente]");
  sel.onchange = () => { $a("alb-nuova").style.display = sel.value ? "none" : ""; };
  m.querySelector("[data-az=ok]").onclick = async () => {
    const q = n => (m.querySelector(`[name=${n}]`) || {}).value;
    try {
      let altroId = q("esistente");
      if (!altroId) {
        const nome = (q("nome") || "").trim(), cognome = (q("cognome") || "").trim();
        if (!nome && !cognome) return alert("Scegli una persona esistente oppure inserisci nome/cognome.");
        const { data, error } = await sb.from("gen_persone").insert({ nome: nome || null, cognome: cognome || null, sesso: q("sesso") }).select().single();
        if (error) throw error; altroId = data.id;
        ALB.d.persone.push(data); ALB.ix = GEN.indice(ALB.d);
      }
      await albCollega(tipo, pid, altroId, q("fam"));
      m.remove();
      await albRicarica();
      albApriPersona(pid);
    } catch (e) { albErr(e); }
  };
}

async function albCollega(tipo, pid, altroId, famScelta) {
  const ix = ALB.ix, p = ix.p.get(pid), altro = ix.p.get(altroId);
  if (tipo === "coniuge") {
    const [a, b] = GEN.ordina(p, altro);
    const { error } = await sb.from("gen_famiglie").insert({ coniuge1_id: a.id, coniuge2_id: b.id }); if (error) throw error;
  } else if (tipo === "figlio") {
    let fid = famScelta || (ix.famConiuge.get(pid) || [])[0];
    if (!fid) { const { data, error } = await sb.from("gen_famiglie").insert({ [albSlot(p)]: pid }).select().single(); if (error) throw error; fid = data.id; }
    const { error } = await sb.from("gen_figli").insert({ famiglia_id: fid, persona_id: altroId, ordine: (ix.figliDi.get(fid) || []).length });
    if (error) throw error;
  } else if (tipo === "genitore") {
    let fid = (ix.famFiglio.get(pid) || [])[0];
    if (!fid) {
      const { data, error } = await sb.from("gen_famiglie").insert({ [albSlot(altro)]: altroId }).select().single(); if (error) throw error;
      const r = await sb.from("gen_figli").insert({ famiglia_id: data.id, persona_id: pid, ordine: 0 }); if (r.error) throw r.error;
    } else {
      const f = ix.fam.get(fid), pref = albSlot(altro), alt = pref === "coniuge1_id" ? "coniuge2_id" : "coniuge1_id";
      const slot = !f[pref] ? pref : (!f[alt] ? alt : null);
      if (!slot) throw new Error("I due genitori sono già presenti: scollegane uno prima.");
      const { error } = await sb.from("gen_famiglie").update({ [slot]: altroId }).eq("id", fid); if (error) throw error;
    }
  }
}

async function albScollega(tipo, pid, altroId, fam) {
  if (!confirm("Scollegare questa relazione? (le persone non vengono eliminate)")) return;
  const ix = ALB.ix;
  try {
    if (tipo === "genitore") {
      const fid = (ix.famFiglio.get(pid) || [])[0];
      const f = ix.fam.get(fid);
      const slot = f.coniuge1_id === altroId ? "coniuge1_id" : "coniuge2_id";
      const { error } = await sb.from("gen_famiglie").update({ [slot]: null }).eq("id", fid); if (error) throw error;
      await albPulisciFamiglia(fid, slot === "coniuge1_id" ? f.coniuge2_id : f.coniuge1_id);
    } else if (tipo === "coniuge") {
      const f = ix.fam.get(fam), slot = f.coniuge1_id === altroId ? "coniuge1_id" : "coniuge2_id";
      const { error } = await sb.from("gen_famiglie").update({ [slot]: null }).eq("id", fam); if (error) throw error;
      await albPulisciFamiglia(fam, slot === "coniuge1_id" ? f.coniuge2_id : f.coniuge1_id);
    } else if (tipo === "figlio") {
      const { error } = await sb.from("gen_figli").delete().eq("persona_id", altroId).in("famiglia_id", ix.famConiuge.get(pid) || []); if (error) throw error;
    }
    await albRicarica();
    albApriPersona(pid);
  } catch (e) { albErr(e); }
}

// elimina la famiglia se rimasta senza coniugi e senza figli
async function albPulisciFamiglia(fid, altroConiuge) {
  if (altroConiuge) return;
  if ((ALB.ix.figliDi.get(fid) || []).length) return;
  await sb.from("gen_famiglie").delete().eq("id", fid);
}

// ---------- FONTI / DOCUMENTI ----------
function albFormFonte(pid) {
  const m = albModale("alb-modal2", "Nuova fonte", `
    <label class="alb-camp">Titolo<input class="alb-in" name="titolo" placeholder="es. Atto di nascita n. 123, Comune di Busalla"></label>
    <div class="alb-grid2">
      <label class="alb-camp">Tipo<select class="alb-sel" name="tipo">${ALB_TIPI_FONTE.map(t => `<option>${t}</option>`).join("")}</select></label>
      <label class="alb-camp">Archivio / dove si trova<input class="alb-in" name="archivio"></label></div>
    <label class="alb-camp">Link<input class="alb-in" name="url" placeholder="https://…"></label>
    <label class="alb-camp">Note<textarea class="alb-ta" name="note"></textarea></label>
    <div class="modal-actions"><span></span><button class="btn small" data-az="ok">Salva</button></div>`, 520);
  m.querySelector("[data-az=ok]").onclick = async () => {
    const q = n => m.querySelector(`[name=${n}]`).value.trim();
    if (!q("titolo")) return alert("Inserisci un titolo.");
    const { error } = await sb.from("gen_fonti").insert({ persona_id: pid, titolo: q("titolo"), tipo: q("tipo"), archivio: q("archivio") || null, url: q("url") || null, note: q("note") || null });
    if (error) return albErr(error);
    m.remove(); await albRicarica(); albApriPersona(pid);
  };
}

async function albApriDoc(docId) {
  const d = ALB.documenti.find(x => x.id === docId); if (!d) return;
  const { data, error } = await sb.storage.from("gen-documenti").createSignedUrl(d.percorso, 3600);
  if (error) return albErr(error);
  window.open(data.signedUrl, "_blank", "noopener");
}

async function albEliminaDoc(docId, pid) {
  const d = ALB.documenti.find(x => x.id === docId);
  if (!confirm(`Eliminare il documento “${d.nome}”?`)) return;
  await sb.storage.from("gen-documenti").remove([d.percorso]);
  const { error } = await sb.from("gen_documenti").delete().eq("id", docId); if (error) return albErr(error);
  await albRicarica(); albApriPersona(pid);
}

// ---------- ESPORTAZIONI ----------
function albEsportaGedcom() {
  if (!ALB.ix) return;
  albScaricaTesto(`albero_${albOggi()}.ged`, GEN.gedcom(ALB.ix, ALB.fonti), "text/plain;charset=utf-8");
}

function albPdfElenco() {
  if (!ALB.ix) return;
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }), ix = ALB.ix;
  doc.setFontSize(14); doc.text("Albero genealogico — elenco persone", 40, 36);
  doc.setFontSize(9); doc.text(`Generato il ${albOggi()} · ${ALB.d.persone.length} persone`, 40, 50);
  const righe = [...ALB.d.persone].sort(albOrdPers).map(p => {
    const n = GEN.evento(ix, p.id, "nascita"), m = GEN.evento(ix, p.id, "morte"), g = GEN.genitori(ix, p.id);
    return [GEN.nome(p), (n && n.data_testo) || "", GEN.luogoNome(ix, n), (m && m.data_testo) || "", GEN.luogoNome(ix, m), g.padre ? GEN.nome(g.padre) : "", g.madre ? GEN.nome(g.madre) : ""];
  });
  doc.autoTable({ startY: 62, head: [["Nome", "Nascita", "Luogo nascita", "Morte", "Luogo morte", "Padre", "Madre"]], body: righe, styles: { fontSize: 8 }, headStyles: { fillColor: [20, 90, 115] } });
  doc.save(`albero_elenco_${albOggi()}.pdf`);
}

function albPdfAlbero() {
  if (!ALB.ix || !ALB.root) return;
  const st = ALB.vista ? ALB.vista.st : { gAvi: 4, gDisc: 3 };
  const r = GEN.albero(ALB.ix, ALB.root, { gAvi: st.gAvi, gDisc: st.gDisc });
  const img = new Image();
  img.onload = () => {
    const k = Math.min(2, 6000 / r.w), c = document.createElement("canvas");
    c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
    const x = c.getContext("2d"); x.fillStyle = "#050d12"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: r.w >= r.h ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), mg = 24, top = 44;
    doc.setFontSize(13); doc.text(`Albero genealogico — ${GEN.nome(ALB.ix.p.get(ALB.root))}`, mg, 30);
    const s = Math.min((pw - mg * 2) / r.w, (ph - top - mg) / r.h);
    doc.addImage(c.toDataURL("image/png"), "PNG", mg, top, r.w * s, r.h * s);
    doc.save(`albero_${albOggi()}.pdf`);
  };
  img.onerror = () => alert("Impossibile generare l'immagine dell'albero.");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg);
}
