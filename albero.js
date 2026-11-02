// albero.js — Modulo "Albero genealogico" di J.A.R.V.I.S.
// Richiede: app.js (sb, currentUser), albero-core.js (GEN), Leaflet, jsPDF + autotable.
// Tabelle: gen_* (vedi albero_genealogia.sql). Documenti nel bucket privato "gen-documenti".

const ALB = {
  d: null, ix: null, fonti: [], documenti: [], condivisioni: [], foto: new Map(),
  root: null, tab: "albero", vista: null, map: null, ed: null, caricato: false, parentela: { a: null, b: null }, opzAlbero: { fratelli: false, foto: true }
};
const ALB_TAB = [["albero", "Albero"], ["persone", "Persone"], ["ricerca", "Ricerca"], ["parentela", "Parentela"], ["cronologia", "Cronologia"], ["statistiche", "Statistiche"], ["ricorrenze", "Ricorrenze"], ["completare", "Da completare"], ["luoghi", "Luoghi e mappa"], ["fonti", "Fonti e documenti"], ["controlli", "Controlli"], ["condividi", "Condividi"]];
const ALB_TIPI_FONTE = ["Atto di nascita", "Atto di matrimonio", "Atto di morte", "Censimento", "Foto", "Lettera / documento", "Sito web", "Altro"];
const ALB_ORD_EV = ["nascita", "matrimonio", "separazione", "divorzio", "residenza", "ordinazione", "altro", "morte"];

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
  await albCaricaFoto();
  let r = null;
  try { r = localStorage.getItem("alb_root"); } catch (_) {}
  if (!r || !ALB.ix.p.has(r)) { const p = persone.find(x => x.rif_gedcom === "I282647190319") || persone[0]; r = p && p.id; }
  ALB.root = r;
  ALB.caricato = true;
}

// URL firmati (1 ora) delle foto profilo, per albero e schede
async function albCaricaFoto() {
  ALB.foto = new Map();
  const con = ALB.d.persone.filter(p => p.foto_percorso);
  if (!con.length) return;
  try {
    const { data } = await sb.storage.from("gen-documenti").createSignedUrls(con.map(p => p.foto_percorso), 3600);
    (data || []).forEach(x => { const p = con.find(q => q.foto_percorso === x.path); if (p && x.signedUrl) ALB.foto.set(p.id, x.signedUrl); });
  } catch (e) { console.warn("Foto non caricate:", e); }
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
  .alb-foto{width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid #2ab8d9;background:#0a1a22;flex:none}
  .alb-galleria{display:flex;gap:8px;flex-wrap:wrap}.alb-galleria img{width:92px;height:92px;object-fit:cover;border-radius:4px;border:1px solid rgba(42,184,217,.35);cursor:pointer}
  .alb-barra{display:grid;grid-template-columns:150px 1fr 40px;gap:8px;align-items:center;margin:3px 0;font-size:.9rem;color:#c8f2ff}
  .alb-barra i{display:block;height:12px;border-radius:2px;background:linear-gradient(90deg,#1a7f9a,#4fc8e8)}
  .alb-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:8px}
  .alb-kpi div{border:1px solid rgba(42,184,217,.25);border-radius:4px;padding:10px;text-align:center;color:#8fb8cc;font-size:.8rem;text-transform:uppercase}
  .alb-kpi b{display:block;font-size:1.5rem;color:#c8f2ff;font-family:'Rajdhani',sans-serif}
  .alb-det{border-bottom:1px solid rgba(42,184,217,.12);padding:4px 0}.alb-det summary{cursor:pointer;color:#c8f2ff}
  .alb-bio{white-space:pre-wrap;line-height:1.45;margin:6px 0}
  .alb-chk{color:#8fb8cc;font-size:.85rem;display:flex;gap:5px;align-items:center;cursor:pointer}
  @media(max-width:640px){.alb-barra{grid-template-columns:100px 1fr 34px}.alb-ev{grid-template-columns:1fr 1fr}.alb-grid2{grid-template-columns:1fr}}`;
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
          <button class="btn small ghost" id="alb-btn-libro">Libro di famiglia</button>
          <button class="btn small ghost" id="alb-btn-tutto">Tutti i dati</button>
          <button class="btn small" id="alb-btn-nuova">+ Persona</button>
        </div>
      </div>
      <div class="alb-tabs" id="alb-tabs"></div>
      <div id="alb-body"></div>`;
    $a("alb-btn-nuova").onclick = () => albApriPersona(null);
    $a("alb-btn-gedcom").onclick = albEsportaGedcom;
    $a("alb-btn-pdf-elenco").onclick = albPdfElenco;
    $a("alb-btn-pdf-albero").onclick = albPdfAlbero;
    $a("alb-btn-libro").onclick = albLibroPdf;
    $a("alb-btn-tutto").onclick = albTuttiIDati;
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
  ({ albero: albTabAlbero, persone: albTabPersone, ricerca: albTabRicerca, parentela: albTabParentela, cronologia: albTabCronologia, statistiche: albTabStatistiche, ricorrenze: albTabRicorrenze, completare: albTabCompletare, luoghi: albTabLuoghi, fonti: albTabFonti, controlli: albTabControlli, condividi: albTabCondividi })[ALB.tab]();
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
      <label class="alb-chk"><input type="checkbox" id="alb-chk-fr"${ALB.opzAlbero.fratelli ? " checked" : ""}> Fratelli</label>
      <label class="alb-chk"><input type="checkbox" id="alb-chk-foto"${ALB.opzAlbero.foto ? " checked" : ""}> Foto</label>
      <label style="color:#8fb8cc;font-size:.85rem">Antenati
        <select class="alb-sel" id="alb-gavi">${[2, 3, 4, 5, 6].map(n => `<option${n === 4 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label style="color:#8fb8cc;font-size:.85rem">Discendenti
        <select class="alb-sel" id="alb-gdisc">${[1, 2, 3, 4, 5].map(n => `<option${n === 3 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>
    <div class="alb-vista" id="alb-vista"></div>
    <div class="alb-scheda" id="alb-scheda"></div>
    <div style="color:#8fb8cc;font-size:.8rem;margin-top:6px">Trascina per spostare · rotella per zoom · clic su una persona per aprire la scheda (da lì puoi centrarla nell'albero).</div>`;
  ALB.vista = GEN.vista($a("alb-vista"), ALB.ix, {
    onSeleziona: id => albApriScheda(id), fratelli: ALB.opzAlbero.fratelli, foto: ALB.opzAlbero.foto ? ALB.foto : null
  });
  $a("alb-chk-fr").onchange = e => { ALB.opzAlbero.fratelli = e.target.checked; ALB.vista.st.fratelli = e.target.checked; albAggiornaAlbero(); };
  $a("alb-chk-foto").onchange = e => { ALB.opzAlbero.foto = e.target.checked; albAggiornaAlbero(); };
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
  ALB.vista.st.foto = ALB.opzAlbero.foto ? ALB.foto : null;
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
function albDescrRamo(c) {
  const p = c.persona_radice_id && ALB.ix.p.get(c.persona_radice_id);
  if (!p || !c.ramo || c.ramo === "tutto") return "Tutto l'albero";
  return ({ antenati: "Antenati di ", discendenti: "Discendenti di ", entrambi: "Antenati e discendenti di " })[c.ramo] + GEN.nome(p);
}
function albTabCondividi() {
  $a("alb-body").innerHTML = `
    <div class="alb-scheda" style="margin:0 0 12px">Crea un link di <b>sola lettura</b> per i parenti. Le persone viventi (senza data di morte e nate negli ultimi 100 anni, o senza data di nascita e senza figli nati da oltre 90 anni) appaiono come “Vivente”, senza date, luoghi o note. Note, fonti e documenti non vengono mai condivisi. Puoi disattivare o eliminare il link in qualsiasi momento.
      Per escludere/includere una persona, cambia “Stato in vita” nella sua scheda.</div>
    <div class="alb-bar"><button class="btn small" id="alb-link-nuovo">+ Nuovo link</button></div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Etichetta / contenuto</th><th>Link</th><th>Stato</th><th></th></tr></thead><tbody>
    ${ALB.condivisioni.map(c => `<tr data-id="${c.id}"><td>${esc(c.etichetta || "")}<br><small style="color:#8fb8cc">${esc(albDescrRamo(c))}</small></td>
      <td><input class="alb-in" readonly value="${esc(albLink(c.token))}" style="width:100%;min-width:260px" onclick="this.select()"></td>
      <td>${c.attiva ? "attivo" : "disattivato"}</td>
      <td style="white-space:nowrap"><button class="btn small ghost" data-az="copia">Copia</button> <button class="btn small ghost" data-az="toggle">${c.attiva ? "Disattiva" : "Attiva"}</button> <span class="alb-x" data-az="elimina">✕</span></td></tr>`).join("") || `<tr><td colspan="4" style="color:#8fb8cc">Nessun link creato.</td></tr>`}
    </tbody></table></div>`;
  $a("alb-link-nuovo").onclick = async () => {
    const m = albModale("alb-modal2", "Nuovo link di condivisione", `
      <label class="alb-camp">Per chi è questo link?<input class="alb-in" name="etichetta" placeholder="es. Cugini Repetto"></label>
      <label class="alb-camp">Cosa condividere<select class="alb-sel" name="ramo">
        <option value="tutto">Tutto l'albero</option><option value="antenati">Solo gli antenati di una persona</option>
        <option value="discendenti">Solo i discendenti di una persona (con coniugi)</option><option value="entrambi">Antenati e discendenti di una persona</option></select></label>
      <label class="alb-camp" id="alb-c-rad" style="display:none">Persona di partenza<select class="alb-sel" name="radice">${albOpzPersone(null, ALB.root)}</select></label>
      <div class="modal-actions"><span></span><button class="btn small" data-az="ok">Crea link</button></div>`, 520);
    const q = n => m.querySelector(`[name=${n}]`);
    q("ramo").onchange = () => { $a("alb-c-rad").style.display = q("ramo").value === "tutto" ? "none" : ""; };
    m.querySelector("[data-az=ok]").onclick = async () => {
      const riga = { etichetta: q("etichetta").value.trim() || null };
      if (q("ramo").value !== "tutto") { riga.ramo = q("ramo").value; riga.persona_radice_id = q("radice").value; }
      const { error } = await sb.from("gen_condivisioni").insert(riga);
      if (error) return albErr(/persona_radice|ramo/.test(error.message || "") ? new Error("Esegui prima albero_aggiornamento_1.sql in Supabase.") : error);
      m.remove(); await albRicarica();
    };
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
  const p = id ? ix.p.get(id) : { nome: "", cognome: "", sesso: "U", stato_vita: "auto", note: "", biografia: "" };
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
      ${cons.filter(c => c.altro).map(c => nm(c.altro, "Coniuge", `<span class="alb-link" data-az="unione" data-fam="${c.fam}" title="Matrimonio, separazione, divorzio">⚭ dettagli</span> <span class="alb-x" data-az="rel-del" data-t="coniuge" data-id="${c.altro.id}" data-fam="${c.fam}" title="Scollega">✕</span>`)).join("")}
      ${fg.map(c => nm(c, "Figlio/a", `<span class="alb-x" data-az="rel-del" data-t="figlio" data-id="${c.id}" title="Scollega">✕</span>`)).join("")}
      <div class="alb-bar" style="margin-top:8px"><button class="btn small ghost" data-az="rel-add" data-t="genitore">+ Genitore</button>
        <button class="btn small ghost" data-az="rel-add" data-t="coniuge">+ Coniuge</button>
        <button class="btn small ghost" data-az="rel-add" data-t="figlio">+ Figlio/a</button></div>`;
  } else rel = `<div class="alb-scheda" style="margin-top:14px"><small>Salva la persona per aggiungere relazioni, fonti e documenti.</small></div>`;

  let fd = "";
  if (id) {
    const fonti = ALB.fonti.filter(f => f.persona_id === id), docs = ALB.documenti.filter(f => f.persona_id === id);
    fd = `<div class="alb-sez">Foto profilo</div>
      <div class="alb-riga">${ALB.foto.get(id) ? `<img class="alb-foto" src="${esc(ALB.foto.get(id))}" alt="">` : "<small>Nessuna foto.</small>"}
        <label class="btn small ghost" style="cursor:pointer">${ALB.foto.get(id) ? "Cambia foto" : "+ Foto"}<input type="file" id="alb-file-foto" accept="image/*" hidden></label>
        ${ALB.foto.get(id) ? `<button class="btn small ghost" data-az="foto-del">Rimuovi</button>` : ""}</div>
      <div class="alb-sez">Fonti</div>
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
    <label class="alb-camp">Biografia (racconto della vita, visibile anche nel link condiviso se la persona è deceduta)<textarea class="alb-ta" name="biografia" style="min-height:120px">${esc(p.biografia || "")}</textarea></label>
    <label class="alb-camp">Note private<textarea class="alb-ta" name="note">${esc(p.note || "")}</textarea></label>
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
    else if (az === "unione") albFormUnione(t.dataset.fam, id);
    else if (az === "foto-del") albRimuoviFoto(id);
    else if (az === "rel-add") albFormRelazione(t.dataset.t, id);
    else if (az === "rel-del") albScollega(t.dataset.t, id, t.dataset.id, t.dataset.fam);
    else if (az === "fonte-add") albFormFonte(id);
    else if (az === "fonte-del") { if (!confirm("Eliminare la fonte?")) return; const { error } = await sb.from("gen_fonti").delete().eq("id", t.dataset.id); if (error) return albErr(error); await albRicarica(); albApriPersona(id); }
    else if (az === "doc-dl") albApriDoc(t.dataset.id);
    else if (az === "doc-del") albEliminaDoc(t.dataset.id, id);
  };
  const ff = $a("alb-file-foto");
  if (ff) ff.onchange = e => { if (e.target.files[0]) albCaricaFotoProfilo(id, e.target.files[0]); };
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
  const fonti = ALB.fonti.filter(f => f.persona_id === id), docs = ALB.documenti.filter(f => f.persona_id === id);
  const imgs = docs.filter(x => (x.mime || "").startsWith("image/"));
  const eta = albEta(ix, id), sesso = { M: "Maschio", F: "Femmina", U: "" }[p.sesso];
  const vita = GEN.schedaVitaHtml(ix, id), tl = GEN.timelineHtml(ix, id);
  const m = albModale("alb-scheda-modal", esc(GEN.nome(p)), `
    <div class="alb-riga" style="margin:-6px 0 10px;gap:14px">
      ${ALB.foto.get(id) ? `<img class="alb-foto" src="${esc(ALB.foto.get(id))}" alt="">` : ""}
      <div style="color:#8fb8cc">${esc([GEN.vita(ix, id), eta, sesso].filter(Boolean).join(" · "))}</div></div>
    ${p.biografia ? `<div class="alb-sez" style="margin-top:6px">Biografia</div><div class="alb-bio">${esc(p.biografia)}</div>` : ""}
    ${vita ? `<div class="alb-sez" style="margin-top:6px">Vita</div>${vita}` : ""}
    <div class="alb-sez">Famiglia</div>
    ${GEN.schedaFamigliaHtml(ix, id)}
    ${tl ? `<div class="alb-sez">Linea del tempo</div>${tl}` : ""}
    ${p.note ? `<div class="alb-sez">Note</div><div style="white-space:pre-wrap">${esc(p.note)}</div>` : ""}
    ${fonti.length ? `<div class="alb-sez">Fonti</div>${fonti.map(f => `<div class="alb-riga"><b>${esc(f.titolo)}</b> <small>${esc([f.tipo, f.archivio].filter(Boolean).join(" · "))}</small>${f.url ? ` <a class="alb-link" href="${esc(f.url)}" target="_blank" rel="noopener">link</a>` : ""}</div>`).join("")}` : ""}
    ${imgs.length ? `<div class="alb-sez">Galleria</div><div class="alb-galleria" id="alb-gal"></div>` : ""}
    ${docs.length ? `<div class="alb-sez">Documenti</div>${docs.map(x => `<div class="alb-riga"><span class="alb-link" data-az="doc-dl" data-id="${x.id}">${esc(x.nome)}</span></div>`).join("")}` : ""}
    <div class="modal-actions" style="margin-top:18px">
      <span><button class="btn small ghost" data-az="centra">Centra nell'albero</button> <button class="btn small ghost" data-az="parentela">Parentela con…</button></span>
      <button class="btn small" data-az="modifica">Modifica</button>
    </div>`, 680);

  if (imgs.length) sb.storage.from("gen-documenti").createSignedUrls(imgs.map(x => x.percorso), 3600).then(({ data }) => {
    const g = $a("alb-gal"); if (!g || !data) return;
    g.innerHTML = data.map((u, i) => u.signedUrl ? `<img src="${esc(u.signedUrl)}" alt="${esc(imgs[i].nome)}" title="${esc(imgs[i].nome)}" data-az="img" data-url="${esc(u.signedUrl)}">` : "").join("");
  }).catch(() => {});

  m.onclick = e => {
    const t = e.target.closest("[data-az]"); if (!t) return;
    const az = t.dataset.az;
    if (az === "scheda") albApriScheda(t.dataset.id);
    else if (az === "doc-dl") albApriDoc(t.dataset.id);
    else if (az === "img") window.open(t.dataset.url, "_blank", "noopener");
    else if (az === "modifica") { m.remove(); albApriPersona(id); }
    else if (az === "parentela") { ALB.parentela = { a: id, b: null }; ALB.tab = "parentela"; m.remove(); albRenderTab(); }
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
  const dati = { nome: v("nome") || null, cognome: v("cognome") || null, sesso: v("sesso"), stato_vita: v("stato_vita"), note: v("note") || null, biografia: v("biografia") || null };
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

// ---------- FOTO PROFILO ----------
function albRidimensiona(file, max) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok(b) : ko(new Error("Immagine non valida")), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

async function albCaricaFotoProfilo(id, file) {
  try {
    const blob = await albRidimensiona(file, 800), vecchia = ALB.ix.p.get(id).foto_percorso;
    const percorso = `${currentUser.id}/${id}/foto_${Date.now()}.jpg`;
    const up = await sb.storage.from("gen-documenti").upload(percorso, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const { error } = await sb.from("gen_persone").update({ foto_percorso: percorso }).eq("id", id);
    if (error) throw new Error(/foto_percorso/.test(error.message || "") ? "Esegui prima albero_aggiornamento_1.sql in Supabase." : error.message);
    if (vecchia) await sb.storage.from("gen-documenti").remove([vecchia]);
    await albRicarica(); albApriPersona(id);
  } catch (e) { albErr(e); }
}

async function albRimuoviFoto(id) {
  if (!confirm("Rimuovere la foto profilo?")) return;
  try {
    const vecchia = ALB.ix.p.get(id).foto_percorso;
    const { error } = await sb.from("gen_persone").update({ foto_percorso: null }).eq("id", id); if (error) throw error;
    if (vecchia) await sb.storage.from("gen-documenti").remove([vecchia]);
    await albRicarica(); albApriPersona(id);
  } catch (e) { albErr(e); }
}

// ---------- UNIONI (matrimonio, separazione, divorzio) ----------
function albFormUnione(famId, pid) {
  const ix = ALB.ix, f = ix.fam.get(famId); if (!f) return;
  const evs = ix.evFam.get(famId) || [];
  const nomi = [ix.p.get(f.coniuge1_id), ix.p.get(f.coniuge2_id)].filter(Boolean).map(GEN.nome).join(" e ");
  const riga = tipo => {
    const e = evs.find(x => x.tipo === tipo) || {};
    return `<div class="alb-grid2"><label class="alb-camp">${GEN.TIPI[tipo]} — data<input class="alb-in" name="${tipo}_d" value="${esc(e.data_testo || "")}" placeholder="12 giu 1950 / 1950"></label>
      <label class="alb-camp">Luogo<input class="alb-in" name="${tipo}_l" list="alb-luoghi-dl" value="${esc(GEN.luogoNome(ix, e) || "")}"></label></div>`;
  };
  const m = albModale("alb-modal2", "Unione: " + esc(nomi), `
    <datalist id="alb-luoghi-dl">${ALB.d.luoghi.map(l => `<option value="${esc(l.nome)}">`).join("")}</datalist>
    <label class="alb-camp">Tipo di unione<select class="alb-sel" name="tipo_unione">${[["matrimonio", "Matrimonio"], ["convivenza", "Convivenza"], ["altro", "Altro"]].map(([k, t]) => `<option value="${k}"${(f.tipo_unione || "matrimonio") === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    ${riga("matrimonio")}${riga("separazione")}${riga("divorzio")}
    <div class="modal-actions" style="margin-top:14px"><span></span><button class="btn small" data-az="ok">Salva</button></div>`, 560);
  m.querySelector("[data-az=ok]").onclick = async () => {
    const q = n => m.querySelector(`[name=${n}]`).value.trim();
    try {
      const { error: e0 } = await sb.from("gen_famiglie").update({ tipo_unione: q("tipo_unione") }).eq("id", famId);
      if (e0) throw new Error(/tipo_unione/.test(e0.message || "") ? "Esegui prima albero_aggiornamento_1.sql in Supabase." : e0.message);
      for (const tipo of ["matrimonio", "separazione", "divorzio"]) {
        const dt = q(tipo + "_d"), luogo = q(tipo + "_l"), es = evs.find(x => x.tipo === tipo);
        if (!dt && !luogo) { if (es) { const { error } = await sb.from("gen_eventi").delete().eq("id", es.id); if (error) throw error; } continue; }
        const pd = GEN.parseData(dt), luogo_id = luogo ? await albLuogoId(luogo) : null;
        const r = { famiglia_id: famId, persona_id: null, tipo, data_testo: dt || null, data_iso: pd.data_iso, precisione: pd.precisione, luogo_id, luogo_testo: null };
        const { error } = es ? await sb.from("gen_eventi").update(r).eq("id", es.id) : await sb.from("gen_eventi").insert(r);
        if (error) throw error;
      }
      m.remove(); await albRicarica(); albApriPersona(pid);
    } catch (e) { albErr(e); }
  };
}

// ---------- TAB: RICERCA ----------
function albTabRicerca() {
  const cognomi = [...new Set(ALB.d.persone.map(p => p.cognome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
  $a("alb-body").innerHTML = `
    <div class="alb-bar">
      <input class="alb-in" id="r-q" placeholder="Nome…" style="flex:1;min-width:140px">
      <select class="alb-sel" id="r-cognome"><option value="">Tutti i cognomi</option>${cognomi.map(c => `<option>${esc(c)}</option>`).join("")}</select>
      <select class="alb-sel" id="r-sesso"><option value="">Sesso</option><option value="M">Maschio</option><option value="F">Femmina</option></select>
      <select class="alb-sel" id="r-stato"><option value="">Vivi e defunti</option><option value="vivi">Solo vivi</option><option value="morti">Solo defunti</option></select>
      <input class="alb-in" id="r-luogo" placeholder="Luogo (qualsiasi evento)" style="min-width:150px">
      <input class="alb-in" id="r-da" type="number" placeholder="Nato dal" style="width:100px"><input class="alb-in" id="r-a" type="number" placeholder="al" style="width:90px"></div>
    <div class="alb-bar">
      <label class="alb-chk"><input type="checkbox" id="r-sf"> Senza fonti</label>
      <label class="alb-chk"><input type="checkbox" id="r-sn"> Senza data di nascita</label>
      <label class="alb-chk"><input type="checkbox" id="r-sg"> Senza genitori</label>
      <label class="alb-chk"><input type="checkbox" id="r-bio"> Con biografia</label>
      <span style="color:#8fb8cc" id="r-conta"></span></div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Nome</th><th>Nascita</th><th>Luogo nascita</th><th>Morte</th></tr></thead><tbody id="r-tb"></tbody></table></div>`;
  const esegui = () => {
    const v = id => $a(id).value, c = id => $a(id).checked;
    const r = GEN.cerca(ALB.ix, { q: v("r-q"), cognome: v("r-cognome"), sesso: v("r-sesso"), stato: v("r-stato"), luogo: v("r-luogo"), da: v("r-da"), a: v("r-a"),
      senzaFonti: c("r-sf"), senzaNascita: c("r-sn"), senzaGenitori: c("r-sg"), conBiografia: c("r-bio") }, ALB.fonti).sort(albOrdPers);
    $a("r-conta").textContent = r.length + " risultati";
    $a("r-tb").innerHTML = r.slice(0, 500).map(p => { const n = GEN.evento(ALB.ix, p.id, "nascita"), m = GEN.evento(ALB.ix, p.id, "morte");
      return `<tr class="cl" data-id="${p.id}"><td>${esc(GEN.nome(p))}</td><td>${esc(n && n.data_testo || "")}</td><td>${esc(GEN.luogoNome(ALB.ix, n))}</td><td>${esc(m && m.data_testo || "")}</td></tr>`; }).join("");
  };
  $a("alb-body").querySelectorAll("input,select").forEach(el => { el.oninput = esegui; el.onchange = esegui; });
  $a("alb-body").onclick = e => { const tr = e.target.closest("tr.cl"); if (tr) albApriScheda(tr.dataset.id); };
  esegui();
}

// ---------- TAB: PARENTELA ----------
function albTabParentela() {
  const P = ALB.parentela;
  if (!P.a || !ALB.ix.p.has(P.a)) P.a = ALB.root;
  $a("alb-body").innerHTML = `
    <div class="alb-bar"><label class="alb-camp" style="min-width:240px;flex:1">Persona A<select class="alb-sel" id="p-a">${albOpzPersone(null, P.a)}</select></label>
      <label class="alb-camp" style="min-width:240px;flex:1">Persona B<select class="alb-sel" id="p-b"><option value="">— scegli —</option>${albOpzPersone(P.a, P.b)}</select></label></div>
    <div id="p-ris"></div>`;
  const calcola = () => {
    P.a = $a("p-a").value; P.b = $a("p-b").value;
    const box = $a("p-ris");
    if (!P.a || !P.b) { box.innerHTML = `<div class="alb-scheda">Scegli due persone per scoprire come sono imparentate.</div>`; return; }
    const r = GEN.parentela(ALB.ix, P.a, P.b);
    const lk = id => `<span class="alb-link" data-az="scheda" data-id="${id}">${esc(GEN.nome(ALB.ix.p.get(id)))}</span>`;
    box.innerHTML = `<div class="alb-scheda"><div style="font-size:1.1rem"><b>${esc(r.frase)}</b></div>
      ${r.avo ? `<div class="alb-riga" style="margin-top:8px"><small>Antenato comune più vicino:</small> ${lk(r.avo.id)} <small>${esc(GEN.vita(ALB.ix, r.avo.id))}</small></div>` : ""}
      ${r.percorso.length > 1 ? `<div class="alb-sez">Percorso</div><div class="alb-riga">${r.percorso.map(lk).join(" → ")}</div>` : ""}</div>`;
  };
  $a("p-a").onchange = () => { $a("p-b").innerHTML = `<option value="">— scegli —</option>` + albOpzPersone($a("p-a").value, $a("p-b").value); calcola(); };
  $a("p-b").onchange = calcola;
  $a("alb-body").onclick = e => { const t = e.target.closest("[data-az=scheda]"); if (t) albApriScheda(t.dataset.id); };
  calcola();
}

// ---------- TAB: CRONOLOGIA ----------
function albTabCronologia() {
  const tutti = GEN.cronologiaGlobale(ALB.ix);
  $a("alb-body").innerHTML = `
    <div class="alb-bar"><input class="alb-in" id="c-q" placeholder="Filtra per persona, luogo, evento…" style="flex:1;min-width:200px">
      <select class="alb-sel" id="c-t"><option value="">Tutti gli eventi</option>${Object.keys(GEN.TIPI).map(k => `<option value="${k}">${GEN.TIPI[k]}</option>`).join("")}</select>
      <span style="color:#8fb8cc" id="c-conta"></span></div>
    <div id="c-lista"></div>`;
  const disegna = () => {
    const q = $a("c-q").value.trim().toLowerCase(), t = $a("c-t").value;
    const r = tutti.filter(x => (!t || x.tipo === t) && (!q || (x.chi + " " + x.testo + " " + x.luogo).toLowerCase().includes(q)));
    $a("c-conta").textContent = r.length + " eventi";
    let ultimo = null, h = "";
    r.slice(0, 1500).forEach(x => {
      const dec = x.anno != null ? Math.floor(x.anno / 10) * 10 + "-" + (Math.floor(x.anno / 10) * 10 + 9) : "Senza data";
      if (dec !== ultimo) { h += `<div class="alb-sez">${dec}</div>`; ultimo = dec; }
      h += `<div class="alb-riga"><b style="min-width:52px">${x.anno != null ? x.anno : "—"}</b><span class="alb-link" data-az="scheda" data-id="${x.pid}">${esc(x.chi)}</span><span>${esc(x.testo)}${x.luogo ? " <small>· " + esc(x.luogo) + "</small>" : ""}</span></div>`;
    });
    $a("c-lista").innerHTML = h || `<div style="color:#8fb8cc">Nessun evento.</div>`;
  };
  $a("c-q").oninput = disegna; $a("c-t").onchange = disegna;
  $a("alb-body").onclick = e => { const t = e.target.closest("[data-az=scheda]"); if (t) albApriScheda(t.dataset.id); };
  disegna();
}

// ---------- TAB: STATISTICHE ----------
function albTabStatistiche() {
  const s = GEN.statistiche(ALB.ix, ALB.fonti), nz = v => v == null ? "—" : (Math.round(v * 10) / 10).toString().replace(".", ",");
  const barre = (t, arr) => arr.length ? `<div class="alb-sez">${t}</div>` + (() => { const mx = Math.max(...arr.map(x => x[1])); return arr.map(([k, n]) => `<div class="alb-barra"><span>${esc(String(k))}</span><i style="width:${Math.max(2, 100 * n / mx)}%"></i><span>${n}</span></div>`).join(""); })() : "";
  const kpi = (t, v) => `<div>${t}<b>${v}</b></div>`;
  const pe = x => x ? `${esc(GEN.nome(x.p))} (${x.eta})` : "—";
  $a("alb-body").innerHTML = `
    <div class="alb-kpi">${kpi("Persone", s.persone)}${kpi("Famiglie", s.famiglie)}${kpi("Generazioni", s.generazioni)}${kpi("Viventi", s.viventi)}
      ${kpi("Età media alla morte", nz(s.etaMedia))}${kpi("Figli per coppia", nz(s.figliPerCoppia))}
      ${kpi("Età 1° figlio (M)", nz(s.etaPrimoFiglioM))}${kpi("Età 1° figlio (F)", nz(s.etaPrimoFiglioF))}
      ${kpi("Più antico", s.annoPiuAntico || "—")}${kpi("Più recente", s.annoPiuRecente || "—")}</div>
    <div class="alb-riga"><small>Più longevo:</small> ${pe(s.etaMax)} <small>· Meno longevo:</small> ${pe(s.etaMin)}</div>
    ${barre("Completezza dati (% persone)", [["Con data di nascita", s.pctNascita], ["Con luogo di nascita", s.pctLuogo], ["Con entrambi i genitori", s.pctGenitori], ["Con almeno una fonte", s.pctFonti]])}
    ${barre("Sesso", [["Maschi", s.sesso.M], ["Femmine", s.sesso.F], ["Non indicato", s.sesso.U]].filter(x => x[1]))}
    ${barre("Cognomi più frequenti", s.cognomi)}${barre("Luoghi di nascita", s.luoghiNascita)}${barre("Luoghi di morte", s.luoghiMorte)}
    ${barre("Nascite per decennio", s.decenni.map(([d, n]) => [d + "s", n]))}`;
}

// ---------- TAB: RICORRENZE ----------
let albGiorniRic = 90;
function albTabRicorrenze() {
  $a("alb-body").innerHTML = `
    <div class="alb-bar"><select class="alb-sel" id="rc-g">${[[30, "Prossimi 30 giorni"], [90, "Prossimi 90 giorni"], [365, "Prossimo anno"]].map(([k, t]) => `<option value="${k}"${k === albGiorniRic ? " selected" : ""}>${t}</option>`).join("")}</select>
      <button class="btn small ghost" id="rc-ics">Scarica calendario (.ics)</button></div>
    <div id="rc-lista"></div>`;
  const disegna = () => {
    albGiorniRic = +$a("rc-g").value;
    const r = GEN.ricorrenze(ALB.ix, albGiorniRic);
    $a("rc-lista").innerHTML = r.map(x => `<div class="alb-riga"><span style="min-width:30px">${x.icona}</span><b style="min-width:110px">${x.giorniA === 0 ? "oggi" : x.giorniA === 1 ? "domani" : "tra " + x.giorniA + " giorni"}</b><span class="alb-link" data-az="scheda" data-id="${x.pid}">${esc(x.testo)}</span></div>`).join("") || `<div style="color:#8fb8cc">Nessuna ricorrenza in questo periodo.</div>`;
  };
  $a("rc-g").onchange = disegna;
  $a("rc-ics").onclick = () => albScaricaTesto(`ricorrenze_famiglia.ics`, GEN.ics(ALB.ix), "text/calendar;charset=utf-8");
  $a("alb-body").onclick = e => { const t = e.target.closest("[data-az=scheda]"); if (t) albApriScheda(t.dataset.id); };
  disegna();
}

// ---------- TAB: DA COMPLETARE ----------
function albTabCompletare() {
  const r = GEN.incompleti(ALB.ix, ALB.root, ALB.fonti);
  $a("alb-body").innerHTML = `
    <div class="alb-kpi"><div>Completezza dell'albero<b>${r.completezza}%</b></div><div>Persone con dati mancanti<b>${r.lista.length}</b></div></div>
    <div style="color:#8fb8cc;margin-bottom:8px">In ordine di priorità: prima chi è vicino a ${esc(GEN.nome(ALB.ix.p.get(ALB.root) || {}))} e ha più lacune. Clic per modificare.</div>
    <div style="overflow-x:auto"><table class="alb-table"><thead><tr><th>Persona</th><th>Cosa manca</th></tr></thead><tbody>
    ${r.lista.slice(0, 200).map(x => `<tr class="cl" data-id="${x.p.id}"><td>${esc(GEN.nome(x.p))} <small>${esc(GEN.vita(ALB.ix, x.p.id))}</small></td><td class="alb-avv">${esc(x.mancanze.join(", "))}</td></tr>`).join("")}</tbody></table></div>`;
  $a("alb-body").onclick = e => { const tr = e.target.closest("tr.cl"); if (tr) albApriPersona(tr.dataset.id); };
}

// ---------- LIBRO DI FAMIGLIA (PDF) ----------
async function albDataUrl(url) {
  const b = await (await fetch(url)).blob();
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });
}

function albTestoFamiglia(id) {
  const ix = ALB.ix, n = GEN.nome, out = [];
  const g = GEN.genitori(ix, id), gen = [g.padre, g.madre].filter(Boolean);
  if (gen.length) out.push(["Genitori", gen.map(n).join(" e ")]);
  const fr = [...new Set((ix.famFiglio.get(id) || []).flatMap(f => ix.figliDi.get(f) || []))].filter(x => x !== id).map(x => ix.p.get(x)).filter(Boolean);
  if (fr.length) out.push(["Fratelli/sorelle", fr.map(n).join(", ")]);
  GEN.coniugi(ix, id).forEach(c => {
    const evs = (ix.evFam.get(c.fam) || []).filter(e => e.data_testo || GEN.luogoNome(ix, e)).map(e => `${GEN.TIPI[e.tipo] || e.tipo}${e.data_testo ? " " + e.data_testo : ""}${GEN.luogoNome(ix, e) ? " a " + GEN.luogoNome(ix, e) : ""}`);
    const kids = (ix.figliDi.get(c.fam) || []).map(x => ix.p.get(x)).filter(Boolean);
    out.push(["Unione", (c.altro ? n(c.altro) : "(non indicato)") + (evs.length ? " - " + evs.join("; ") : "") + (kids.length ? ". Figli: " + kids.map(n).join(", ") : "")]);
  });
  return out;
}

async function albLibroPdf() {
  if (!ALB.ix || !ALB.d.persone.length) return;
  const btn = $a("alb-btn-libro"), testo0 = btn.textContent;
  btn.disabled = true; btn.textContent = "Creo il libro…";
  try {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "pt", format: "a4" }), ix = ALB.ix;
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
    const radice = ix.p.get(ALB.root), cogn = (radice && radice.cognome) || "";
    // copertina
    doc.setFontSize(30); doc.text("Libro di famiglia", W / 2, H / 3, { align: "center" });
    doc.setFontSize(20); doc.text(cogn ? "Famiglia " + cogn : "", W / 2, H / 3 + 36, { align: "center" });
    doc.setFontSize(11); doc.text(`${ALB.d.persone.length} persone - generato il ${albOggi()}`, W / 2, H / 3 + 70, { align: "center" });
    // albero della persona scelta
    if (radice) {
      try {
        const r = GEN.albero(ix, ALB.root, { gAvi: 4, gDisc: 3 });
        const png = await new Promise((ok, ko) => {
          const img = new Image();
          img.onload = () => { const k = Math.min(2, 5000 / r.w), c = document.createElement("canvas"); c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
            const x = c.getContext("2d"); x.fillStyle = "#050d12"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL("image/png")); };
          img.onerror = ko; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg);
        });
        doc.addPage("a4", r.w >= r.h ? "landscape" : "portrait");
        const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
        doc.setFontSize(13); doc.text("Albero di " + GEN.nome(radice), 32, 30);
        const sc = Math.min((pw - 64) / r.w, (ph - 70) / r.h);
        doc.addImage(png, "PNG", 32, 44, r.w * sc, r.h * sc);
      } catch (_) { /* albero non disegnabile: si prosegue con le schede */ }
    }
    // schede persone
    const indice = [];
    const persone = [...ALB.d.persone].sort(albOrdPers);
    for (const p of persone) {
      doc.addPage("a4", "portrait");
      indice.push([GEN.nome(p), doc.internal.getNumberOfPages()]);
      let y = M;
      doc.setFontSize(20); doc.text(GEN.nome(p), M, y + 8);
      doc.setFontSize(11); doc.setTextColor(90); doc.text(GEN.vita(ix, p.id) || "", M, y + 28); doc.setTextColor(0);
      const url = ALB.foto.get(p.id);
      if (url) { try { doc.addImage(await albDataUrl(url), "JPEG", W - M - 90, M - 6, 90, 90); } catch (_) {} }
      y += 60;
      if (p.biografia) {
        doc.setFontSize(10);
        const righe = doc.splitTextToSize(p.biografia, W - M * 2);
        for (const r of righe) { if (y > H - M) { doc.addPage("a4", "portrait"); y = M; } doc.text(r, M, y); y += 13; }
        y += 8;
      }
      const ev = [...(ix.ev.get(p.id) || [])].sort((a, b) => ALB_ORD_EV.indexOf(a.tipo) - ALB_ORD_EV.indexOf(b.tipo))
        .map(e => [e.tipo === "altro" && e.titolo ? e.titolo : GEN.TIPI[e.tipo] || e.tipo, e.data_testo || "", GEN.luogoNome(ix, e)]);
      if (ev.length) { doc.autoTable({ startY: y, head: [["Evento", "Data", "Luogo"]], body: ev, styles: { fontSize: 9 }, headStyles: { fillColor: [20, 90, 115] }, margin: { left: M, right: M } }); y = doc.lastAutoTable.finalY + 12; }
      const fam = albTestoFamiglia(p.id);
      if (fam.length) { doc.autoTable({ startY: y, body: fam, styles: { fontSize: 9 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 100 } }, theme: "plain", margin: { left: M, right: M } }); y = doc.lastAutoTable.finalY + 12; }
      const fonti = ALB.fonti.filter(f => f.persona_id === p.id).map(f => [f.titolo, [f.tipo, f.archivio].filter(Boolean).join(" - ")]);
      if (fonti.length) doc.autoTable({ startY: y, head: [["Fonti", ""]], body: fonti, styles: { fontSize: 8 }, headStyles: { fillColor: [90, 90, 90] }, margin: { left: M, right: M } });
    }
    // indice analitico
    doc.addPage("a4", "portrait");
    doc.setFontSize(16); doc.text("Indice dei nomi", M, M);
    doc.autoTable({ startY: M + 14, body: indice, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 1: { halign: "right", cellWidth: 40 } }, theme: "plain", margin: { left: M, right: M } });
    doc.save(`libro_di_famiglia_${albOggi()}.pdf`);
  } catch (e) { albErr(e); }
  btn.disabled = false; btn.textContent = testo0;
}


// ---------- TUTTI I DATI INSERITI (riepilogo completo + backup JSON) ----------
function albTuttiIDati() {
  const ix = ALB.ix, d = ALB.d, n = GEN.nome;
  if (!ix) return;
  const conta = [["Persone", d.persone.length], ["Famiglie/unioni", d.famiglie.length], ["Eventi", d.eventi.length], ["Luoghi", d.luoghi.length],
    ["Fonti", ALB.fonti.length], ["Documenti", ALB.documenti.length], ["Foto profilo", d.persone.filter(p => p.foto_percorso).length],
    ["Biografie", d.persone.filter(p => p.biografia).length], ["Con note", d.persone.filter(p => p.note).length]];
  const lk = q => `<span class="alb-link" data-az="scheda" data-id="${q.id}">${esc(n(q))}</span>`;
  const scheda = p => {
    const g = GEN.genitori(ix, p.id), cons = GEN.coniugi(ix, p.id), fg = GEN.figli(ix, p.id);
    const r = (t, v) => v ? `<div class="alb-riga" style="align-items:flex-start;margin-bottom:3px"><small style="min-width:92px">${t}:</small><span>${v}</span></div>` : "";
    const evs = GEN.schedaVitaHtml(ix, p.id);
    const fonti = ALB.fonti.filter(f => f.persona_id === p.id), docs = ALB.documenti.filter(f => f.persona_id === p.id);
    return `<details class="alb-det" data-nome="${esc((n(p) + " " + GEN.vita(ix, p.id)).toLowerCase())}"><summary><b>${esc(n(p))}</b> <small>${esc(GEN.vita(ix, p.id))}</small></summary>
      <div style="padding:6px 0 10px 14px">
      ${r("Sesso", { M: "Maschio", F: "Femmina", U: "" }[p.sesso])}${r("Stato in vita", { auto: "", vivente: "Vivente", deceduto: "Deceduto" }[p.stato_vita])}
      ${evs}${r("Genitori", [g.padre, g.madre].filter(Boolean).map(lk).join(" · "))}
      ${cons.map(c => r("Coniuge", (c.altro ? lk(c.altro) : "(non indicato)"))).join("")}${r("Figli", fg.map(lk).join(" · "))}
      ${r("Biografia", p.biografia ? `<span class="alb-bio">${esc(p.biografia)}</span>` : "")}${r("Note", p.note ? `<span class="alb-bio">${esc(p.note)}</span>` : "")}
      ${r("Fonti", fonti.map(f => esc(f.titolo)).join("; "))}${r("Documenti", docs.map(x => esc(x.nome)).join("; "))}${r("Foto", p.foto_percorso ? "sì" : "")}
      <span class="alb-link" data-az="modifica" data-id="${p.id}">Modifica</span></div></details>`;
  };
  const m = albModale("alb-tutto-modal", "Tutti i dati inseriti", `
    <div class="alb-kpi">${conta.map(([t, v]) => `<div>${t}<b>${v}</b></div>`).join("")}</div>
    <div class="alb-bar"><input class="alb-in" id="tt-q" placeholder="Filtra per nome…" style="flex:1;min-width:160px">
      <button class="btn small ghost" id="tt-esp">Espandi tutto</button><button class="btn small ghost" id="tt-bk">Scarica backup (JSON)</button></div>
    <div id="tt-lista">${[...d.persone].sort(albOrdPers).map(scheda).join("")}</div>`, 900);
  const det = () => [...m.querySelectorAll(".alb-det")];
  $a("tt-q").oninput = e => { const q = e.target.value.trim().toLowerCase(); det().forEach(x => { x.style.display = !q || x.dataset.nome.includes(q) ? "" : "none"; }); };
  let aperti = false;
  $a("tt-esp").onclick = e => { aperti = !aperti; det().forEach(x => { if (x.style.display !== "none") x.open = aperti; }); e.target.textContent = aperti ? "Chiudi tutto" : "Espandi tutto"; };
  $a("tt-bk").onclick = () => albScaricaTesto(`albero_backup_${albOggi()}.json`, JSON.stringify({ ...d, fonti: ALB.fonti, documenti: ALB.documenti }, null, 1), "application/json");
  m.onclick = e => {
    const t = e.target.closest("[data-az]"); if (!t) return;
    if (t.dataset.az === "scheda") albApriScheda(t.dataset.id);
    else if (t.dataset.az === "modifica") { m.remove(); albApriPersona(t.dataset.id); }
  };
}
