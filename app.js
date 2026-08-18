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

// ---------- CORE ANIMATION (SVG generato via JS, riusato in login + home) ----------
const CORE_SVG = `
<svg viewBox="0 0 420 420">
  <defs>
    <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#eafcff"/>
      <stop offset="30%" stop-color="#8fe8ff"/>
      <stop offset="65%" stop-color="#2ab8d9" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#2ab8d9" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0a2a38" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0a2a38" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="210" cy="210" r="205" fill="url(#bgGlow)"/>
  <g class="spin-1">
    <circle cx="210" cy="210" r="196" fill="none" stroke="rgba(42,184,217,.25)" stroke-width="14"/>
    <circle cx="210" cy="210" r="196" fill="none" stroke="rgba(143,232,255,.5)" stroke-width="1"/>
    <circle cx="210" cy="210" r="182" fill="none" stroke="rgba(143,232,255,.5)" stroke-width="1"/>
    <g class="core-ticks" stroke="#8fe8ff" stroke-width="2"></g>
  </g>
  <g class="spin-2">
    <circle cx="210" cy="210" r="196" fill="none" stroke="#ffb020" stroke-width="10" stroke-dasharray="140 900" stroke-linecap="round" opacity="0.85"/>
  </g>
  <g class="spin-2"><g class="core-dots"></g></g>
  <g class="spin-3">
    <circle cx="210" cy="210" r="150" fill="none" stroke="#2ab8d9" stroke-width="4" stroke-dasharray="16 10" opacity="0.55"/>
  </g>
  <circle cx="210" cy="210" r="118" fill="none" stroke="rgba(143,232,255,.4)" stroke-width="1"/>
  <circle cx="210" cy="210" r="112" fill="none" stroke="rgba(42,184,217,.25)" stroke-width="1"/>
  <circle class="pulse" cx="210" cy="210" r="70" fill="url(#coreGrad)"/>
  <circle cx="210" cy="210" r="24" fill="#eafcff" opacity="0.95"/>
</svg>`;

function renderCoreAnim(containerId){
  const el = document.getElementById(containerId);
  if(!el || el.dataset.rendered) return;
  el.innerHTML = CORE_SVG;
  el.dataset.rendered = "1";
  const ticks = el.querySelector(".core-ticks");
  for(let i=0;i<60;i++){
    const angle=(i/60)*360, long=i%5===0;
    const line=document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1","210"); line.setAttribute("y1", long?"180":"189");
    line.setAttribute("x2","210"); line.setAttribute("y2","203");
    line.setAttribute("transform", `rotate(${angle} 210 210)`);
    line.setAttribute("opacity", long?"0.9":"0.4");
    ticks.appendChild(line);
  }
  const dots = el.querySelector(".core-dots");
  [20,45,70,95].forEach((deg,i)=>{
    const rad = deg * Math.PI/180;
    const x = 210 + 196*Math.cos(rad - Math.PI/2);
    const y = 210 + 196*Math.sin(rad - Math.PI/2);
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx",x); c.setAttribute("cy",y); c.setAttribute("r","4");
    c.setAttribute("fill","#ffe28a"); c.setAttribute("class","dot");
    c.style.animationDelay = (i*0.4)+"s";
    dots.appendChild(c);
  });
}

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", async () => {
  renderCoreAnim("core-login");
  bindStaticEvents();
  startClock();
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW non registrato:", err));
  });
}

function bindStaticEvents(){
  document.getElementById("login-form").addEventListener("submit", (e)=>{ e.preventDefault(); handleLoginOrSignup(); });
  document.getElementById("btn-logout").addEventListener("click", handleLogout);
  document.getElementById("btn-hamburger").addEventListener("click", toggleMenu);
  document.getElementById("backdrop").addEventListener("click", closeMenu);
  document.querySelectorAll(".nav-item").forEach(el=>{
    el.addEventListener("click", ()=> { switchView(el.dataset.view); closeMenu(); });
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

// ---------- MENU (sidebar overlay con scan line + decode) ----------
const GLITCH_CHARS = "!<>-_\\/[]{}—=+*^?#";
function decodeEffect(el){
  const target = el.dataset.text;
  if(!target) return;
  let iterations = 0;
  clearInterval(el._interval);
  el._interval = setInterval(()=>{
    el.textContent = target.split("").map((ch,i)=>{
      if(i < iterations) return target[i];
      if(ch === " ") return " ";
      return GLITCH_CHARS[Math.floor(Math.random()*GLITCH_CHARS.length)];
    }).join("");
    if(iterations >= target.length) clearInterval(el._interval);
    iterations += 1/2;
  }, 30);
}
function toggleMenu(){
  const opening = !document.getElementById("sidebar").classList.contains("open");
  document.getElementById("sidebar").classList.toggle("open", opening);
  document.getElementById("backdrop").classList.toggle("open", opening);
  document.getElementById("btn-hamburger").classList.toggle("open", opening);
  if(opening){
    document.querySelectorAll("#sidebar .nav-item[data-text]").forEach((el,i)=>{
      setTimeout(()=> decodeEffect(el), 150 + i*130);
    });
  }
}
function closeMenu(){
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
  document.getElementById("btn-hamburger").classList.remove("open");
}

// ---------- OROLOGIO ----------
function startClock(){
  function tick(){
    const now = new Date();
    const clockEl = document.getElementById("clock");
    const dateEl = document.getElementById("dateStr");
    if(clockEl) clockEl.textContent = now.toLocaleTimeString("it-IT");
    if(dateEl) dateEl.textContent = now.toLocaleDateString("it-IT", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  }
  tick();
  setInterval(tick, 1000);
}

// ---------- METEO (geolocalizzazione + Open-Meteo, nessuna API key) ----------
const WEATHER_CODES = {
  0:"Sereno",1:"Poco nuvoloso",2:"Parz. nuvoloso",3:"Nuvoloso",
  45:"Nebbia",48:"Nebbia gelata",
  51:"Pioviggine",53:"Pioviggine",55:"Pioviggine forte",
  61:"Pioggia debole",63:"Pioggia",65:"Pioggia forte",
  71:"Neve debole",73:"Neve",75:"Neve forte",
  80:"Rovesci",81:"Rovesci",82:"Rovesci forti",
  95:"Temporale",96:"Temporale",99:"Temporale forte"
};
async function loadWeather(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude, longitude } = pos.coords;
    try{
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      const cond = WEATHER_CODES[data.current.weather_code] || "—";
      document.getElementById("weather-temp").textContent = temp + "°C";
      document.getElementById("weather-cond").textContent = cond;
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=it`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      const city = geoData.results && geoData.results[0] ? geoData.results[0].name : "";
      if(city) document.getElementById("weather-loc").textContent = city;
    }catch(e){ console.warn("Meteo non disponibile", e); }
  }, ()=>{ console.warn("Geolocalizzazione negata"); });
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
  renderCoreAnim("core-home");
  loadWeather();
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
