const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let campi = [];       // definizione campi dinamici
let contratti = [];   // record contratti

const DEFAULT_CAMPI = [
  { chiave:"intestatario", etichetta:"Intestatario", tipo:"testo", ordine:0,  mostra_in_tabella:true  },
  { chiave:"numero",       etichetta:"Numero",        tipo:"testo", ordine:1,  mostra_in_tabella:true  },
  { chiave:"iccid",        etichetta:"ICCID",         tipo:"testo", ordine:2,  mostra_in_tabella:false },
  { chiave:"operatore",    etichetta:"Operatore",     tipo:"testo", ordine:3,  mostra_in_tabella:true  },
  { chiave:"tariffa",      etichetta:"Tariffa",       tipo:"testo", ordine:4,  mostra_in_tabella:true  },
  { chiave:"note",         etichetta:"Note",          tipo:"testo", ordine:5,  mostra_in_tabella:false },
  { chiave:"in_uso",       etichetta:"In uso a",      tipo:"testo", ordine:6,  mostra_in_tabella:false },
  { chiave:"dispositivo",  etichetta:"Dispositivo / Posizione", tipo:"testo", ordine:7, mostra_in_tabella:false },
  { chiave:"mdp",          etichetta:"MDP",           tipo:"testo", ordine:8,  mostra_in_tabella:false },
  { chiave:"data",         etichetta:"Data",          tipo:"data",  ordine:9,  mostra_in_tabella:false },
  { chiave:"canone",       etichetta:"Canone",        tipo:"euro",  ordine:10, mostra_in_tabella:true  },
  { chiave:"finanzia",     etichetta:"Finanzia",      tipo:"euro",  ordine:11, mostra_in_tabella:false },
  { chiave:"totale",       etichetta:"Totale",        tipo:"euro",  ordine:12, mostra_in_tabella:true  },
  { chiave:"cdf",          etichetta:"CDF",           tipo:"testo", ordine:13, mostra_in_tabella:false },
  { chiave:"marca",        etichetta:"Marca dispositivo",  tipo:"testo", ordine:14, mostra_in_tabella:false },
  { chiave:"modello",      etichetta:"Modello dispositivo", tipo:"testo", ordine:15, mostra_in_tabella:false },
  { chiave:"imei",         etichetta:"IMEI",          tipo:"testo", ordine:16, mostra_in_tabella:false },
  { chiave:"rata",         etichetta:"Rata finanziamento", tipo:"euro", ordine:17, mostra_in_tabella:false },
  { chiave:"istituto",     etichetta:"Istituto finanziario", tipo:"testo", ordine:18, mostra_in_tabella:false },
  { chiave:"scadenza_finanziamento", etichetta:"Scadenza finanziamento", tipo:"data", ordine:19, mostra_in_tabella:false },
];

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", async () => {
  bindStaticEvents();
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
});

function bindStaticEvents(){
  document.getElementById("btn-login").addEventListener("click", handleLoginOrSignup);
  document.getElementById("btn-logout").addEventListener("click", handleLogout);
  document.querySelectorAll(".nav-item").forEach(el=>{
    el.addEventListener("click", ()=> switchView(el.dataset.view));
  });
  document.getElementById("btn-nuovo-contratto").addEventListener("click", ()=> openContrattoModal(null));
  document.getElementById("btn-gestisci-campi").addEventListener("click", openCampiModal);
  document.getElementById("btn-salva-contratto").addEventListener("click", saveContratto);
  document.getElementById("btn-elimina-contratto").addEventListener("click", deleteContratto);
  document.getElementById("btn-aggiungi-campo").addEventListener("click", addCampoRow);
  document.getElementById("btn-salva-campi").addEventListener("click", saveCampi);
  document.querySelectorAll(".modal-close").forEach(el=>{
    el.addEventListener("click", ()=> closeModal(el.dataset.close));
  });
}

async function handleLoginOrSignup(){
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  if(!email || !password){ errEl.textContent = "Inserisci email e password."; return; }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ errEl.textContent = "Credenziali non valide."; return; }
  await onLogin(data.user);
}

async function handleLogout(){
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("screen-login").classList.remove("hidden");
}

async function onLogin(user){
  currentUser = user;
  document.getElementById("screen-login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("welcome-text").textContent = "bentornato, " + user.email.split("@")[0];
  await ensureCampi();
  await loadContratti();
  switchView("home");
}

// ---------- NAV ----------
function switchView(view){
  document.querySelectorAll(".nav-item").forEach(el=>{
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.getElementById("view-home").classList.toggle("hidden", view!=="home");
  document.getElementById("view-contratti").classList.toggle("hidden", view!=="contratti");
  if(view==="contratti") renderTable();
}

// ---------- CAMPI ----------
async function ensureCampi(){
  const { data, error } = await sb.from("contratti_campi").select("*").order("ordine");
  if(error){ console.error(error); return; }
  if(data.length === 0){
    const toInsert = DEFAULT_CAMPI.map(c => ({...c, user_id: currentUser.id}));
    const { data: inserted, error: insErr } = await sb.from("contratti_campi").insert(toInsert).select();
    if(insErr){ console.error(insErr); return; }
    campi = inserted.sort((a,b)=>a.ordine-b.ordine);
  } else {
    campi = data;
  }
}

async function loadContratti(){
  const { data, error } = await sb.from("contratti").select("*").order("created_at", { ascending:false });
  if(error){ console.error(error); return; }
  contratti = data;
}

function renderTable(){
  const visibili = campi.filter(c=>c.mostra_in_tabella).sort((a,b)=>a.ordine-b.ordine);
  const thead = document.getElementById("contratti-thead-row");
  thead.innerHTML = visibili.map(c=>`<th>${escapeHtml(c.etichetta)}</th>`).join("");
  const tbody = document.getElementById("contratti-tbody");
  const emptyEl = document.getElementById("contratti-empty");
  if(contratti.length===0){
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  tbody.innerHTML = contratti.map(row=>{
    const cells = visibili.map(c=>`<td>${formatValue(row.dati[c.chiave], c.tipo)}</td>`).join("");
    return `<tr data-id="${row.id}">${cells}</tr>`;
  }).join("");
  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const rec = contratti.find(r=>r.id===tr.dataset.id);
      openContrattoModal(rec);
    });
  });
}

function formatValue(val, tipo){
  if(val===undefined || val===null || val==="") return "\u2014";
  if(tipo==="euro") return "\u20ac " + Number(val).toFixed(2);
  return escapeHtml(String(val));
}

function escapeHtml(str){
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- MODAL CONTRATTO ----------
let editingId = null;

function openContrattoModal(record){
  editingId = record ? record.id : null;
  document.getElementById("modal-contratto-title").textContent = record ? "Modifica contratto" : "Nuovo contratto";
  document.getElementById("btn-elimina-contratto").classList.toggle("hidden", !record);
  const wrap = document.getElementById("modal-contratto-fields");
  const ordinati = [...campi].sort((a,b)=>a.ordine-b.ordine);
  wrap.innerHTML = ordinati.map(c=>{
    const val = record ? (record.dati[c.chiave] ?? "") : "";
    const inputType = c.tipo==="data" ? "date" : (c.tipo==="numero"||c.tipo==="euro" ? "number" : "text");
    const step = c.tipo==="euro" ? ' step="0.01"' : "";
    return `<div class="field"><label>${escapeHtml(c.etichetta)}</label>
      <input type="${inputType}"${step} data-chiave="${c.chiave}" value="${escapeHtml(String(val))}"></div>`;
  }).join("");
  document.getElementById("modal-contratto").classList.remove("hidden");
}

async function saveContratto(){
  const inputs = document.querySelectorAll("#modal-contratto-fields input");
  const dati = {};
  inputs.forEach(inp=>{
    if(inp.value !== "") dati[inp.dataset.chiave] = inp.value;
  });
  if(editingId){
    const { error } = await sb.from("contratti").update({ dati }).eq("id", editingId);
    if(error){ alert("Errore salvataggio: " + error.message); return; }
  } else {
    const { error } = await sb.from("contratti").insert({ dati, user_id: currentUser.id });
    if(error){ alert("Errore salvataggio: " + error.message); return; }
  }
  closeModal("modal-contratto");
  await loadContratti();
  renderTable();
}

async function deleteContratto(){
  if(!editingId) return;
  if(!confirm("Eliminare questo contratto?")) return;
  const { error } = await sb.from("contratti").delete().eq("id", editingId);
  if(error){ alert("Errore eliminazione: " + error.message); return; }
  closeModal("modal-contratto");
  await loadContratti();
  renderTable();
}

// ---------- MODAL CAMPI ----------
function openCampiModal(){
  const list = document.getElementById("campi-list");
  const ordinati = [...campi].sort((a,b)=>a.ordine-b.ordine);
  list.innerHTML = "";
  ordinati.forEach(c => list.appendChild(buildCampoRow(c)));
  document.getElementById("modal-campi").classList.remove("hidden");
}

function buildCampoRow(campo){
  const row = document.createElement("div");
  row.className = "campo-row";
  row.dataset.id = campo.id || "";
  row.innerHTML = `
    <input type="text" class="campo-etichetta" value="${escapeHtml(campo.etichetta||"")}" placeholder="Nome campo">
    <select class="campo-tipo">
      <option value="testo"${campo.tipo==="testo"?" selected":""}>Testo</option>
      <option value="numero"${campo.tipo==="numero"?" selected":""}>Numero</option>
      <option value="euro"${campo.tipo==="euro"?" selected":""}>Euro</option>
      <option value="data"${campo.tipo==="data"?" selected":""}>Data</option>
    </select>
    <label class="chk"><input type="checkbox" class="campo-mostra"${campo.mostra_in_tabella?" checked":""}> in tabella</label>
    <span class="campo-del">✕</span>
  `;
  row.querySelector(".campo-del").addEventListener("click", ()=> row.remove());
  return row;
}

function addCampoRow(){
  const list = document.getElementById("campi-list");
  list.appendChild(buildCampoRow({ chiave:null, etichetta:"", tipo:"testo", mostra_in_tabella:false }));
}

function slugify(str){
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\s_]/g,"")
    .replace(/\s+/g,"_") || ("campo_" + Date.now());
}

async function saveCampi(){
  const rows = document.querySelectorAll("#campi-list .campo-row");
  const nuoviCampi = [];
  rows.forEach((row, idx)=>{
    const etichetta = row.querySelector(".campo-etichetta").value.trim();
    if(!etichetta) return;
    const existing = campi.find(c=>c.id===row.dataset.id);
    nuoviCampi.push({
      id: row.dataset.id || undefined,
      chiave: existing ? existing.chiave : slugify(etichetta),
      etichetta,
      tipo: row.querySelector(".campo-tipo").value,
      ordine: idx,
      mostra_in_tabella: row.querySelector(".campo-mostra").checked,
      user_id: currentUser.id
    });
  });

  const idsAttuali = campi.map(c=>c.id);
  const idsRimasti = nuoviCampi.filter(c=>c.id).map(c=>c.id);
  const idsRimossi = idsAttuali.filter(id=>!idsRimasti.includes(id));
  if(idsRimossi.length){
    await sb.from("contratti_campi").delete().in("id", idsRimossi);
  }

  for(const c of nuoviCampi){
    if(c.id){
      await sb.from("contratti_campi").update({
        etichetta:c.etichetta, tipo:c.tipo, ordine:c.ordine, mostra_in_tabella:c.mostra_in_tabella
      }).eq("id", c.id);
    } else {
      delete c.id;
      await sb.from("contratti_campi").insert(c);
    }
  }

  const { data } = await sb.from("contratti_campi").select("*").order("ordine");
  campi = data;
  closeModal("modal-campi");
  renderTable();
}

// ---------- UTIL ----------
function closeModal(id){
  document.getElementById(id).classList.add("hidden");
}
