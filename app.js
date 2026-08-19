const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

let currentUser = null;
let weatherData = null;
let weatherCity = "";
let weatherMap = null;
let radarLayer = null;
let radarFrames = [];
let radarHost = "";
let radarFrameIndex = 0;
let radarInterval = null;
let sessionStart = null;
let tempoInterval = null;

// ---------- CAMPI DI DEFAULT PER SEZIONE ----------
const DEFAULT_CAMPI_CONTRATTI = [
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

const DEFAULT_CAMPI_ABBONAMENTI = [
  { chiave:"servizio",    etichetta:"Servizio",       tipo:"testo",       ordine:0, mostra_in_tabella:true },
  { chiave:"costo",       etichetta:"Costo",          tipo:"euro",        ordine:1, mostra_in_tabella:true },
  { chiave:"periodicita", etichetta:"Periodicità",    tipo:"periodicita", ordine:2, mostra_in_tabella:true },
  { chiave:"mdp",         etichetta:"Come lo pago",   tipo:"testo",       ordine:3, mostra_in_tabella:true },
  { chiave:"note",        etichetta:"Note",           tipo:"testo",       ordine:4, mostra_in_tabella:false },
  { chiave:"rinnovo",     etichetta:"Rinnovo",        tipo:"rinnovo",     ordine:5, mostra_in_tabella:true },
];

const DEFAULT_CAMPI_VEICOLI = [
  { chiave:"targa",                     etichetta:"Targa",                    tipo:"testo", ordine:0, mostra_in_tabella:true },
  { chiave:"marca",                     etichetta:"Marca",                    tipo:"testo", ordine:1, mostra_in_tabella:true },
  { chiave:"modello",                   etichetta:"Modello",                  tipo:"testo", ordine:2, mostra_in_tabella:true },
  { chiave:"scadenza_bollo",            etichetta:"Scadenza bollo",           tipo:"data",  ordine:3, mostra_in_tabella:true },
  { chiave:"scadenza_assicurazione",    etichetta:"Scadenza assicurazione",   tipo:"data",  ordine:4, mostra_in_tabella:true },
  { chiave:"scadenza_revisione",        etichetta:"Scadenza revisione",       tipo:"data",  ordine:5, mostra_in_tabella:false },
  { chiave:"costo_assicurazione",       etichetta:"Costo assicurazione",      tipo:"euro",  ordine:6, mostra_in_tabella:false },
  { chiave:"note",                      etichetta:"Note",                     tipo:"testo", ordine:7, mostra_in_tabella:false },
];

const DEFAULT_CAMPI_DOCUMENTI = [
  { chiave:"nome_documento", etichetta:"Documento",         tipo:"testo", ordine:0, mostra_in_tabella:true },
  { chiave:"numero",         etichetta:"Numero",            tipo:"testo", ordine:1, mostra_in_tabella:false },
  { chiave:"scadenza",       etichetta:"Scadenza",          tipo:"data",  ordine:2, mostra_in_tabella:true },
  { chiave:"dove_rinnovare", etichetta:"Dove rinnovarlo",   tipo:"testo", ordine:3, mostra_in_tabella:false },
  { chiave:"note",           etichetta:"Note",              tipo:"testo", ordine:4, mostra_in_tabella:false },
];

const DEFAULT_CAMPI_ACCESSI = [
  { chiave:"servizio", etichetta:"Servizio",  tipo:"testo",     ordine:0, mostra_in_tabella:true },
  { chiave:"username", etichetta:"Username",  tipo:"testo",     ordine:1, mostra_in_tabella:true },
  { chiave:"password", etichetta:"Password",  tipo:"password",  ordine:2, mostra_in_tabella:true },
  { chiave:"url",       etichetta:"URL",       tipo:"testo",     ordine:3, mostra_in_tabella:false },
  { chiave:"note",     etichetta:"Note",      tipo:"testo",     ordine:4, mostra_in_tabella:false },
];

const DEFAULT_CAMPI_CONTATTI = [
  { chiave:"nome",       etichetta:"Nome",       tipo:"testo", ordine:0, mostra_in_tabella:true },
  { chiave:"cognome",    etichetta:"Cognome",    tipo:"testo", ordine:1, mostra_in_tabella:true },
  { chiave:"compleanno", etichetta:"Compleanno", tipo:"data",  ordine:2, mostra_in_tabella:true },
  { chiave:"telefono",   etichetta:"Telefono",   tipo:"testo", ordine:3, mostra_in_tabella:false },
  { chiave:"email",      etichetta:"Email",      tipo:"testo", ordine:4, mostra_in_tabella:false },
  { chiave:"note",       etichetta:"Note",       tipo:"testo", ordine:5, mostra_in_tabella:false },
];

// ---------- REGISTRO SEZIONI (tabella dinamica generica) ----------
const SECTIONS = {
  contratti: {
    table: "contratti", camposTable: "contratti_campi",
    defaultCampi: DEFAULT_CAMPI_CONTRATTI, totalField: "totale",
    computedField: { chiave: "totale", sources: ["canone","finanzia"] },
    campi: [], records: []
  },
  abbonamenti: {
    table: "abbonamenti", camposTable: "abbonamenti_campi",
    defaultCampi: DEFAULT_CAMPI_ABBONAMENTI, totalField: "costo",
    periodicityField: "periodicita", rinnovoField: "rinnovo",
    campi: [], records: []
  },
  veicoli: {
    table: "veicoli", camposTable: "veicoli_campi",
    defaultCampi: DEFAULT_CAMPI_VEICOLI,
    campi: [], records: []
  },
  documenti: {
    table: "documenti", camposTable: "documenti_campi",
    defaultCampi: DEFAULT_CAMPI_DOCUMENTI,
    campi: [], records: []
  },
  accessi: {
    table: "accessi", camposTable: "accessi_campi",
    defaultCampi: DEFAULT_CAMPI_ACCESSI,
    campi: [], records: []
  },
  contatti: {
    table: "anagrafica_contatti", camposTable: "contatti_campi",
    defaultCampi: DEFAULT_CAMPI_CONTATTI, birthdayField: "compleanno",
    campi: [], records: []
  }
};

// ---------- CORE ANIMATION (SVG generato via JS, riusato in login + home) ----------
const CORE_SVG = `
<svg viewBox="0 0 420 420">
  <defs>
    <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="20%" stop-color="#eafcff"/>
      <stop offset="45%" stop-color="#8fe8ff"/>
      <stop offset="75%" stop-color="#2ab8d9" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#2ab8d9" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0f3a4a" stop-opacity="0.6"/>
      <stop offset="60%" stop-color="#0a2a38" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0a2a38" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowSoft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowStrong" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(143,232,255,.08)" stroke-width="1"/>
    </pattern>
  </defs>
  <circle cx="210" cy="210" r="205" fill="url(#bgGlow)"/>
  <circle cx="210" cy="210" r="196" fill="url(#grid)" opacity="0.5"/>
  <g class="spin-1" filter="url(#glowSoft)">
    <circle cx="210" cy="210" r="196" fill="none" stroke="rgba(42,184,217,.3)" stroke-width="14"/>
    <circle cx="210" cy="210" r="196" fill="none" stroke="rgba(143,232,255,.6)" stroke-width="1"/>
    <circle cx="210" cy="210" r="182" fill="none" stroke="rgba(143,232,255,.5)" stroke-width="1"/>
    <g class="core-ticks" stroke="#8fe8ff" stroke-width="2"></g>
  </g>
  <g class="spin-2" filter="url(#glowStrong)">
    <circle cx="210" cy="210" r="196" fill="none" stroke="#ffb020" stroke-width="9" stroke-dasharray="140 900" stroke-linecap="round" opacity="0.9"/>
  </g>
  <g class="spin-2" filter="url(#glowSoft)"><g class="core-dots"></g></g>
  <g class="spin-3" filter="url(#glowSoft)">
    <circle cx="210" cy="210" r="150" fill="none" stroke="#2ab8d9" stroke-width="4" stroke-dasharray="16 10" opacity="0.6"/>
  </g>
  <circle cx="210" cy="210" r="118" fill="none" stroke="rgba(143,232,255,.45)" stroke-width="1"/>
  <circle cx="210" cy="210" r="112" fill="none" stroke="rgba(42,184,217,.3)" stroke-width="1"/>
  <line x1="210" y1="98" x2="210" y2="118" stroke="#8fe8ff" stroke-width="1" opacity="0.5"/>
  <line x1="210" y1="302" x2="210" y2="322" stroke="#8fe8ff" stroke-width="1" opacity="0.5"/>
  <line x1="98" y1="210" x2="118" y2="210" stroke="#8fe8ff" stroke-width="1" opacity="0.5"/>
  <line x1="302" y1="210" x2="322" y2="210" stroke="#8fe8ff" stroke-width="1" opacity="0.5"/>
  <circle class="pulse" cx="210" cy="210" r="72" fill="url(#coreGrad)" filter="url(#glowStrong)"/>
  <circle cx="210" cy="210" r="26" fill="#ffffff" opacity="0.95" filter="url(#glowSoft)"/>
</svg>`;

function renderCoreAnim(containerId){
  const el = document.getElementById(containerId);
  if(!el || el.dataset.rendered) return;
  const suffix = "-" + containerId;
  const svgHtml = CORE_SVG.replace(/id="([a-zA-Z]+)"/g, `id="$1${suffix}"`)
                           .replace(/url\(#([a-zA-Z]+)\)/g, `url(#$1${suffix})`);
  el.innerHTML = svgHtml;
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

  const burst = document.createElement("div");
  burst.className = "burst";
  for(let i=0;i<16;i++){
    const ray = document.createElement("div");
    ray.className = "ray";
    ray.style.setProperty("--a", (i*22.5)+"deg");
    burst.appendChild(ray);
  }
  el.appendChild(burst);
}

// ---------- HEX MODULE TICKS ----------
function renderHexTicks(groupId){
  const g = document.getElementById(groupId);
  if(!g || g.dataset.rendered) return;
  g.dataset.rendered = "1";
  for(let i=0;i<36;i++){
    const angle=(i/36)*360, long=i%3===0;
    const line=document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1","44"); line.setAttribute("y1", long?"3":"5");
    line.setAttribute("x2","44"); line.setAttribute("y2","8");
    line.setAttribute("stroke","#8fe8ff");
    line.setAttribute("stroke-width", long?"1.3":"0.8");
    line.setAttribute("opacity", long?"0.85":"0.35");
    line.setAttribute("transform", `rotate(${angle} 44 44)`);
    g.appendChild(line);
  }
}

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", async () => {
  renderCoreAnim("core-login");
  renderHexTicks("mod-time-ticks");
  renderHexTicks("mod-weather-ticks");
  renderHexTicks("mod-compleanni-ticks");
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

  document.getElementById("btn-nuovo-contratto").addEventListener("click", ()=> openRecordModal("contratti", null));
  document.getElementById("btn-gestisci-campi").addEventListener("click", ()=> openCampiModal("contratti"));
  document.getElementById("btn-nuovo-abbonamento").addEventListener("click", ()=> openRecordModal("abbonamenti", null));
  document.getElementById("btn-gestisci-campi-abbonamenti").addEventListener("click", ()=> openCampiModal("abbonamenti"));
  document.getElementById("btn-nuovo-veicolo").addEventListener("click", ()=> openRecordModal("veicoli", null));
  document.getElementById("btn-gestisci-campi-veicoli").addEventListener("click", ()=> openCampiModal("veicoli"));
  document.getElementById("btn-nuovo-documento").addEventListener("click", ()=> openRecordModal("documenti", null));
  document.getElementById("btn-gestisci-campi-documenti").addEventListener("click", ()=> openCampiModal("documenti"));
  document.getElementById("btn-nuovo-accesso").addEventListener("click", ()=> openRecordModal("accessi", null));
  document.getElementById("btn-gestisci-campi-accessi").addEventListener("click", ()=> openCampiModal("accessi"));
  document.getElementById("btn-nuovo-contatto").addEventListener("click", ()=> openRecordModal("contatti", null));
  document.getElementById("btn-gestisci-campi-contatti").addEventListener("click", ()=> openCampiModal("contatti"));
  document.getElementById("mod-weather").addEventListener("click", openWeatherModal);
  document.getElementById("mod-time").addEventListener("click", openTempoModal);
  document.querySelector("[data-close-birthday]").addEventListener("click", closeBirthdayPopup);
  document.getElementById("mod-compleanni").addEventListener("click", openUpcomingBirthdaysModal);

  Object.keys(SECTIONS).forEach(section=>{
    const btn = document.getElementById("btn-export-" + section);
    if(btn) btn.addEventListener("click", ()=> exportSectionPDF(section));
  });

  document.getElementById("btn-salva-contratto").addEventListener("click", saveRecord);
  document.getElementById("btn-elimina-contratto").addEventListener("click", deleteRecord);
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
    if(clockEl) clockEl.textContent = now.toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"});
    if(dateEl) dateEl.textContent = now.toLocaleDateString("it-IT", {day:"numeric", month:"short"});
  }
  tick();
  setInterval(tick, 30000);
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
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      weatherData = data;
      const temp = Math.round(data.current.temperature_2m);
      const cond = WEATHER_CODES[data.current.weather_code] || "—";
      document.getElementById("weather-temp").textContent = temp + "°";
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=it`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      const city = geoData.results && geoData.results[0] ? geoData.results[0].name : "";
      weatherCity = city;
      document.getElementById("weather-loc").textContent = city || cond;
    }catch(e){ console.warn("Meteo non disponibile", e); }
  }, ()=>{ console.warn("Geolocalizzazione negata"); });
}

function openWeatherModal(){
  const body = document.getElementById("modal-meteo-body");
  document.getElementById("modal-meteo-title").textContent = weatherCity ? `Meteo — ${weatherCity}` : "Meteo";
  if(!weatherData){
    body.innerHTML = "Dati meteo non disponibili. Verifica di aver concesso il permesso di posizione.";
  } else {
    const c = weatherData.current;
    const d = weatherData.daily;
    const cond = WEATHER_CODES[c.weather_code] || "—";
    body.innerHTML = `
      <div>Condizione: <b style="color:#8fe8ff">${cond}</b></div>
      <div>Temperatura: <b style="color:#8fe8ff">${Math.round(c.temperature_2m)}°C</b></div>
      <div>Percepita: ${Math.round(c.apparent_temperature)}°C</div>
      <div>Umidità: ${c.relative_humidity_2m}%</div>
      <div>Vento: ${Math.round(c.wind_speed_10m)} km/h</div>
      <div>Min / Max oggi: ${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</div>
      <div>Alba: ${d.sunrise[0].slice(11,16)} · Tramonto: ${d.sunset[0].slice(11,16)}</div>
    `;
  }
  document.getElementById("modal-meteo").classList.remove("hidden");
  initRadar();
}

// ---------- RADAR PRECIPITAZIONI (RainViewer, nessuna API key) ----------
async function fetchRadarFrames(){
  try{
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const data = await res.json();
    radarHost = data.host;
    radarFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])];
  }catch(e){
    console.warn("Radar non disponibile", e);
    radarFrames = [];
  }
}

function radarTileUrl(frame){
  return `${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function initRadar(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude, longitude } = pos.coords;

    if(!weatherMap){
      weatherMap = L.map("radar-map", { zoomControl:false, attributionControl:false }).setView([latitude, longitude], 7);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains:"abcd", maxZoom:19 }).addTo(weatherMap);
      L.marker([latitude, longitude]).addTo(weatherMap);
    } else {
      weatherMap.setView([latitude, longitude], 7);
      setTimeout(()=> weatherMap.invalidateSize(), 100);
    }

    if(radarFrames.length === 0) await fetchRadarFrames();
    if(radarFrames.length === 0) return;

    if(radarLayer) weatherMap.removeLayer(radarLayer);
    radarFrameIndex = radarFrames.length - 1; // frame più recente
    radarLayer = L.tileLayer(radarTileUrl(radarFrames[radarFrameIndex]), { opacity:0.65 }).addTo(weatherMap);

    clearInterval(radarInterval);
    radarInterval = setInterval(()=>{
      radarFrameIndex = (radarFrameIndex + 1) % radarFrames.length;
      radarLayer.setUrl(radarTileUrl(radarFrames[radarFrameIndex]));
    }, 600);
  }, ()=>{ console.warn("Geolocalizzazione negata"); });
}

function stopRadar(){
  clearInterval(radarInterval);
  radarInterval = null;
}

// ---------- DIAGNOSTICA DI SESSIONE (click sull'ora) ----------
function getDayOfYear(d){
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

function getISOWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

const MOON_PHASES = ["Novilunio","Luna crescente","Primo quarto","Gibbosa crescente","Plenilunio","Gibbosa calante","Ultimo quarto","Luna calante"];
function getMoonPhase(d){
  // riferimento: novilunio noto 6 gennaio 2000, ciclo sinodico 29.53058867 giorni
  const synodic = 29.53058867;
  const ref = new Date(Date.UTC(2000,0,6,18,14));
  const days = (d - ref) / 86400000;
  const phase = ((days % synodic) + synodic) % synodic;
  const index = Math.floor((phase / synodic) * 8 + 0.5) % 8;
  return { name: MOON_PHASES[index], pct: Math.round((phase/synodic)*100) };
}

function formatDuration(ms){
  const totalSec = Math.floor(ms/1000);
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function renderTempoBody(){
  const now = new Date();
  const body = document.getElementById("modal-tempo-body");
  const elapsed = sessionStart ? formatDuration(now - sessionStart) : "—";
  const doy = getDayOfYear(now);
  const totalDays = ((now.getFullYear()%4===0 && now.getFullYear()%100!==0) || now.getFullYear()%400===0) ? 366 : 365;
  const week = getISOWeek(now);
  const moon = getMoonPhase(now);
  body.innerHTML = `
    <div>Sessione attiva da: <b style="color:#8fe8ff">${elapsed}</b></div>
    <div>Giorno dell'anno: ${doy} / ${totalDays}</div>
    <div>Settimana ISO: n. ${week}</div>
    <div>Fase lunare: <b style="color:#8fe8ff">${moon.name}</b> (${moon.pct}% del ciclo)</div>
    <div>Timestamp locale: ${now.toLocaleString("it-IT")}</div>
  `;
}

function openTempoModal(){
  renderTempoBody();
  document.getElementById("modal-tempo").classList.remove("hidden");
  clearInterval(tempoInterval);
  tempoInterval = setInterval(renderTempoBody, 1000);
}

function stopTempo(){
  clearInterval(tempoInterval);
  tempoInterval = null;
}

// ---------- LOGIN / LOGOUT ----------
async function handleLoginOrSignup(){
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  if(!email || !password){ errEl.textContent = "Inserisci email e password."; return; }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ errEl.textContent = "Credenziali non valide."; return; }
  await playLoginTransition();
  await onLogin(data.user);
}

// ---------- TRANSIZIONE DI ACCESSO ----------
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

async function playLoginTransition(){
  const core = document.getElementById("core-login");
  const loginBox = document.getElementById("login");
  const label = document.getElementById("transition-label");
  const ticks = core.querySelectorAll(".core-ticks line");
  const accentArc = core.querySelector('circle[stroke="#ffb020"]');

  loginBox.classList.add("fading");

  core.classList.add("assembling");
  await wait(30);
  core.classList.remove("assembling");
  await wait(600);

  core.classList.add("charging");
  if(accentArc){
    accentArc.classList.add("charge-arc");
    accentArc.style.strokeDasharray = "1233 0";
  }
  ticks.forEach((t,i)=> setTimeout(()=> t.classList.add("tick-lit"), i*7));
  await wait(650);

  core.classList.add("bursting");
  const flash = document.getElementById("login-flash");
  flash.classList.add("flash");
  await wait(200);

  label.classList.add("show");
  const iris = document.getElementById("login-iris");
  iris.style.clipPath = "circle(150% at 50% 50%)";
  document.getElementById("screen-login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  await wait(450);
  flash.classList.remove("flash");

  await wait(150);
  iris.style.clipPath = "";
  iris.classList.add("opening");
  label.classList.remove("show");
  await wait(720);
  iris.classList.remove("opening");

  core.classList.remove("charging","bursting");
  ticks.forEach(t=>t.classList.remove("tick-lit"));
  if(accentArc){
    accentArc.style.strokeDasharray = "140 900";
    accentArc.classList.remove("charge-arc");
  }
  loginBox.classList.remove("fading");
}

async function handleLogout(){
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("screen-login").classList.remove("hidden");
}

async function onLogin(user){
  currentUser = user;
  sessionStart = new Date();
  const displayName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
    || user.email.split("@")[0];
  document.getElementById("user-name").textContent = displayName;
  document.getElementById("welcome-text").textContent = "bentornato, " + displayName;
  renderCoreAnim("core-home");
  loadWeather();
  for(const section of Object.keys(SECTIONS)){
    await ensureCampi(section);
    await loadRecords(section);
  }
  checkBirthdaysToday();
  updateBirthdayWidget();
  switchView("home");
}

// ---------- POPUP COMPLEANNI ----------
function checkBirthdaysToday(){
  const cfg = SECTIONS.contatti;
  if(!cfg || !cfg.birthdayField) return;
  const now = new Date();
  const todayNames = cfg.records
    .filter(r => {
      const val = r.dati[cfg.birthdayField];
      if(!val) return false;
      const d = new Date(val);
      if(isNaN(d)) return false;
      return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    })
    .map(r => [r.dati.nome, r.dati.cognome].filter(Boolean).join(" ") || "Contatto senza nome");

  if(todayNames.length === 0) return;
  document.getElementById("birthday-names").innerHTML = todayNames.map(n=>`🎉 ${escapeHtml(n)}`).join("<br>");
  document.getElementById("birthday-popup").classList.add("show");
}

function closeBirthdayPopup(){
  document.getElementById("birthday-popup").classList.remove("show");
}

// ---------- PROSSIMI COMPLEANNI (30 giorni) ----------
function getUpcomingBirthdays(daysAhead){
  const cfg = SECTIONS.contatti;
  if(!cfg || !cfg.birthdayField) return [];
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const result = [];
  cfg.records.forEach(r=>{
    const val = r.dati[cfg.birthdayField];
    if(!val) return;
    const bday = new Date(val);
    if(isNaN(bday)) return;

    let next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
    if(next < todayMidnight) next = new Date(now.getFullYear()+1, bday.getMonth(), bday.getDate());
    const daysUntil = Math.round((next - todayMidnight) / 86400000);
    if(daysUntil <= daysAhead){
      const name = [r.dati.nome, r.dati.cognome].filter(Boolean).join(" ") || "Contatto senza nome";
      result.push({ name, date: next, daysUntil });
    }
  });
  result.sort((a,b)=> a.daysUntil - b.daysUntil);
  return result;
}

function updateBirthdayWidget(){
  const upcoming = getUpcomingBirthdays(30);
  const el = document.getElementById("compleanni-count");
  if(el) el.textContent = upcoming.length;
}

function openUpcomingBirthdaysModal(){
  const upcoming = getUpcomingBirthdays(30);
  const body = document.getElementById("modal-compleanni-body");
  if(upcoming.length === 0){
    body.innerHTML = "Nessun compleanno nei prossimi 30 giorni.";
  } else {
    body.innerHTML = upcoming.map(u=>{
      const dataStr = u.date.toLocaleDateString("it-IT", { day:"numeric", month:"long" });
      const quando = u.daysUntil === 0 ? "oggi" : (u.daysUntil === 1 ? "domani" : `tra ${u.daysUntil} giorni`);
      return `<div>🎂 <b style="color:#8fe8ff">${escapeHtml(u.name)}</b> — ${dataStr} (${quando})</div>`;
    }).join("");
  }
  document.getElementById("modal-compleanni").classList.remove("hidden");
}

// ---------- NAV ----------
function switchView(view){
  document.querySelectorAll(".nav-item").forEach(el=>{
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.getElementById("view-home").classList.toggle("hidden", view!=="home");
  ["contratti","abbonamenti","veicoli","documenti","accessi","contatti"].forEach(v=>{
    document.getElementById("view-"+v).classList.toggle("hidden", view!==v);
  });
  if(SECTIONS[view]) renderTable(view);
}

// ---------- CAMPI (generico per sezione) ----------
async function ensureCampi(section){
  const cfg = SECTIONS[section];
  const { data, error } = await sb.from(cfg.camposTable).select("*").order("ordine");
  if(error){ console.error(error); return; }
  if(data.length === 0){
    const toInsert = cfg.defaultCampi.map(c => ({...c, user_id: currentUser.id}));
    const { data: inserted, error: insErr } = await sb.from(cfg.camposTable).insert(toInsert).select();
    if(insErr){ console.error(insErr); return; }
    cfg.campi = inserted.sort((a,b)=>a.ordine-b.ordine);
  } else {
    cfg.campi = data;
  }

  // migrazione: chi aveva già creato gli abbonamenti prima dell'introduzione della periodicità
  if(cfg.periodicityField && !cfg.campi.find(c=>c.chiave===cfg.periodicityField)){
    const { data: added, error: addErr } = await sb.from(cfg.camposTable).insert({
      chiave: cfg.periodicityField, etichetta:"Periodicità", tipo:"periodicita",
      ordine: cfg.campi.length, mostra_in_tabella:true, user_id: currentUser.id
    }).select();
    if(!addErr && added) cfg.campi.push(added[0]);
  }

  // migrazione: campo "rinnovo" da data fissa a giorno/mese ricorrente
  if(cfg.rinnovoField){
    const rinnovoCampo = cfg.campi.find(c=>c.chiave===cfg.rinnovoField);
    if(rinnovoCampo && rinnovoCampo.tipo !== "rinnovo"){
      await sb.from(cfg.camposTable).update({ tipo:"rinnovo" }).eq("id", rinnovoCampo.id);
      rinnovoCampo.tipo = "rinnovo";
      cfg._migrateRinnovoValues = true;
    }
  }
}

async function loadRecords(section){
  const cfg = SECTIONS[section];
  const { data, error } = await sb.from(cfg.table).select("*").order("created_at", { ascending:false });
  if(error){ console.error(error); return; }
  cfg.records = data;

  // migrazione valori: converte le vecchie date fisse del campo rinnovo nel nuovo formato giorno/mese
  if(cfg._migrateRinnovoValues && cfg.rinnovoField){
    for(const r of cfg.records){
      const val = r.dati[cfg.rinnovoField];
      if(val && /^\d{4}-\d{2}-\d{2}$/.test(val)){
        const d = new Date(val);
        const isAnnuale = r.dati[cfg.periodicityField] === "annuale";
        const nuovoValore = isAnnuale
          ? String(d.getDate()).padStart(2,"0") + "-" + String(d.getMonth()+1).padStart(2,"0")
          : String(d.getDate()).padStart(2,"0");
        r.dati[cfg.rinnovoField] = nuovoValore;
        await sb.from(cfg.table).update({ dati: r.dati }).eq("id", r.id);
      }
    }
    cfg._migrateRinnovoValues = false;
  }
}

function updateTotal(section){
  const cfg = SECTIONS[section];
  const sum = cfg.records.reduce((acc, r) => {
    let v;
    if(cfg.computedField && cfg.totalField === cfg.computedField.chiave){
      v = computeFieldValue(cfg, r.dati);
    } else {
      v = parseFloat(r.dati[cfg.totalField]);
    }
    if(isNaN(v)) return acc;
    const isAnnuale = cfg.periodicityField && r.dati[cfg.periodicityField] === "annuale";
    return acc + (isAnnuale ? v/12 : v);
  }, 0);
  const el = document.getElementById(section + "-total-value");
  if(el) el.textContent = "€ " + sum.toFixed(2);
}

function renderTable(section){
  const cfg = SECTIONS[section];
  const visibili = cfg.campi.filter(c=>c.mostra_in_tabella).sort((a,b)=>a.ordine-b.ordine);
  const thead = document.getElementById(section + "-thead-row");
  thead.innerHTML = visibili.map(c=>`<th>${escapeHtml(c.etichetta)}</th>`).join("");
  const tbody = document.getElementById(section + "-tbody");
  const emptyEl = document.getElementById(section + "-empty");
  if(cfg.records.length===0){
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    updateTotal(section);
    return;
  }
  emptyEl.classList.add("hidden");
  tbody.innerHTML = cfg.records.map(row=>{
    const cells = visibili.map(c=>{
      let raw;
      let dateForBadge = null;
      if(cfg.computedField && c.chiave === cfg.computedField.chiave){
        raw = formatValue(computeFieldValue(cfg, row.dati).toFixed(2), "euro");
      } else if(cfg.rinnovoField && c.chiave === cfg.rinnovoField){
        const periodicitaVal = cfg.periodicityField ? row.dati[cfg.periodicityField] : null;
        raw = formatRinnovo(row.dati[c.chiave], periodicitaVal);
        dateForBadge = nextRinnovoDate(row.dati[c.chiave], periodicitaVal);
      } else {
        raw = formatValue(row.dati[c.chiave], c.tipo);
      }
      if(dateForBadge){
        return `<td><span class="${dateStatusClassFromDate(dateForBadge)}">${raw}</span></td>`;
      }
      if(c.tipo==="data" && row.dati[c.chiave]){
        return `<td><span class="${dateStatusClass(row.dati[c.chiave])}">${raw}</span></td>`;
      }
      return `<td>${raw}</td>`;
    }).join("");
    return `<tr data-id="${row.id}">${cells}</tr>`;
  }).join("");
  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const rec = cfg.records.find(r=>r.id===tr.dataset.id);
      openRecordModal(section, rec);
    });
  });
  updateTotal(section);
}

function formatValue(val, tipo){
  if(val===undefined || val===null || val==="") return "\u2014";
  if(tipo==="euro") return "\u20ac " + Number(val).toFixed(2);
  if(tipo==="periodicita") return val==="annuale" ? "Annuale" : "Mensile";
  if(tipo==="password") return "••••••••";
  return escapeHtml(String(val));
}

function computeFieldValue(cfg, dati){
  if(!cfg.computedField) return null;
  return cfg.computedField.sources.reduce((acc,k)=> acc + (parseFloat(dati[k])||0), 0);
}

// ---------- ESPORTAZIONE PDF ----------
const SECTION_TITLES = {
  contratti:"Contratti telefonici", abbonamenti:"Abbonamenti", veicoli:"Veicoli",
  documenti:"Documenti", accessi:"Accessi", contatti:"Contatti"
};

function exportFormatValue(val, tipo){
  if(val===undefined || val===null || val==="") return "";
  if(tipo==="euro") return "€ " + Number(val).toFixed(2);
  if(tipo==="periodicita") return val==="annuale" ? "Annuale" : "Mensile";
  if(tipo==="password") return "••••••••";
  return String(val);
}

function exportSectionPDF(section){
  const cfg = SECTIONS[section];
  if(!cfg || cfg.records.length === 0){ alert("Nessun dato da esportare in questa sezione."); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  const ordinati = [...cfg.campi].sort((a,b)=>a.ordine-b.ordine);
  const head = [ordinati.map(c=>c.etichetta)];
  const body = cfg.records.map(r=>
    ordinati.map(c=>{
      if(cfg.computedField && c.chiave === cfg.computedField.chiave){
        return "€ " + computeFieldValue(cfg, r.dati).toFixed(2);
      }
      if(cfg.rinnovoField && c.chiave === cfg.rinnovoField){
        const periodicitaVal = cfg.periodicityField ? r.dati[cfg.periodicityField] : null;
        return formatRinnovo(r.dati[c.chiave], periodicitaVal);
      }
      const v = exportFormatValue(r.dati[c.chiave], c.tipo);
      return v || "—";
    })
  );

  const title = SECTION_TITLES[section] || section;
  doc.setFontSize(14);
  doc.text(`J.A.R.V.I.S. — ${title}`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Esportato il ${new Date().toLocaleString("it-IT")} — ${cfg.records.length} record`, 40, 56);

  doc.autoTable({
    head, body,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [10, 30, 42], textColor: [255,255,255] },
    alternateRowStyles: { fillColor: [240,248,250] },
    margin: { left: 40, right: 40 }
  });

  doc.save(`${section}_${new Date().toISOString().slice(0,10)}.pdf`);
}

function dateStatusClass(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if(isNaN(d)) return "";
  return dateStatusClassFromDate(d);
}

function dateStatusClassFromDate(d){
  if(!d) return "";
  const diffDays = Math.floor((d - new Date()) / 86400000);
  if(diffDays < 0) return "date-expired";
  if(diffDays <= 30) return "date-soon";
  return "";
}

const MONTH_NAMES_SHORT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

function formatRinnovo(val, periodicitaVal){
  if(!val) return "\u2014";
  if(periodicitaVal === "annuale"){
    const [dd,mm] = val.split("-");
    const mi = parseInt(mm,10) - 1;
    return `${parseInt(dd,10)} ${MONTH_NAMES_SHORT[mi] || ""}`;
  }
  return `Il ${parseInt(val,10)} di ogni mese`;
}

function nextRinnovoDate(val, periodicitaVal){
  if(!val) return null;
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let day, month;
  if(periodicitaVal === "annuale"){
    const [dd,mm] = val.split("-").map(Number);
    day = dd; month = mm - 1;
  } else {
    day = parseInt(val,10); month = now.getMonth();
  }
  let next = new Date(now.getFullYear(), month, day);
  if(next < todayMid){
    next = periodicitaVal === "annuale"
      ? new Date(now.getFullYear()+1, month, day)
      : new Date(now.getFullYear(), now.getMonth()+1, day);
  }
  return next;
}

function escapeHtml(str){
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- MODAL RECORD (generico, riusato per contratti e abbonamenti) ----------
let activeSection = null;
let editingId = null;

function openRecordModal(section, record){
  activeSection = section;
  editingId = record ? record.id : null;
  const cfg = SECTIONS[section];
  const nome = section === "contratti" ? "contratto" : "abbonamento";
  document.getElementById("modal-contratto-title").textContent = record ? `Modifica ${nome}` : `Nuovo ${nome}`;
  document.getElementById("btn-elimina-contratto").classList.toggle("hidden", !record);
  const wrap = document.getElementById("modal-contratto-fields");
  const ordinati = [...cfg.campi].sort((a,b)=>a.ordine-b.ordine);
  wrap.innerHTML = ordinati.map(c=>{
    const val = record ? (record.dati[c.chiave] ?? "") : "";
    if(c.tipo === "periodicita"){
      return `<div class="field"><label>${escapeHtml(c.etichetta)}</label>
        <select data-chiave="${c.chiave}">
          <option value="mensile"${val!=="annuale"?" selected":""}>Mensile</option>
          <option value="annuale"${val==="annuale"?" selected":""}>Annuale (diviso automaticamente nel totale mensile)</option>
        </select></div>`;
    }
    if(c.tipo === "password"){
      return `<div class="field pw-field-wrap"><label>${escapeHtml(c.etichetta)}</label>
        <input type="password" data-chiave="${c.chiave}" value="${escapeHtml(String(val))}" class="pw-input">
        <span class="pw-toggle" onclick="const i=this.previousElementSibling; i.type = i.type==='password' ? 'text' : 'password'; this.textContent = i.type==='password' ? 'mostra' : 'nascondi';">mostra</span></div>`;
    }
    if(cfg.computedField && c.chiave === cfg.computedField.chiave){
      const computed = record ? computeFieldValue(cfg, record.dati).toFixed(2) : "0.00";
      return `<div class="field"><label>${escapeHtml(c.etichetta)} (calcolato automaticamente)</label>
        <input type="text" id="computed-${c.chiave}" value="€ ${computed}" disabled style="opacity:.7;"></div>`;
    }
    if(cfg.rinnovoField && c.chiave === cfg.rinnovoField){
      let giorno = "", mese = "";
      if(val){
        if(String(val).includes("-")){ const [dd,mm]=String(val).split("-"); giorno=dd; mese=mm; }
        else { giorno = String(val).padStart(2,"0"); }
      }
      const giornoOpts = Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0"))
        .map(d=>`<option value="${d}"${d===giorno?" selected":""}>${parseInt(d,10)}</option>`).join("");
      const meseOpts = MONTH_NAMES_SHORT.map((m,i)=>{
        const mm = String(i+1).padStart(2,"0");
        return `<option value="${mm}"${mm===mese?" selected":""}>${m}</option>`;
      }).join("");
      return `<div class="field"><label>${escapeHtml(c.etichetta)}</label>
        <div style="display:flex;gap:8px;">
          <select id="rinnovo-giorno">${giornoOpts}</select>
          <select id="rinnovo-mese" style="display:none;">${meseOpts}</select>
        </div></div>`;
    }
    const inputType = c.tipo==="data" ? "date" : (c.tipo==="numero"||c.tipo==="euro" ? "number" : "text");
    const step = c.tipo==="euro" ? ' step="0.01"' : "";
    return `<div class="field"><label>${escapeHtml(c.etichetta)}</label>
      <input type="${inputType}"${step} data-chiave="${c.chiave}" value="${escapeHtml(String(val))}"></div>`;
  }).join("");
  document.getElementById("modal-contratto").classList.remove("hidden");

  // mostra/nasconde il selettore mese in base alla periodicità
  if(cfg.rinnovoField && cfg.periodicityField){
    const periodicitaSelect = wrap.querySelector(`[data-chiave="${cfg.periodicityField}"]`);
    const meseSelect = document.getElementById("rinnovo-mese");
    if(periodicitaSelect && meseSelect){
      const syncMeseVisibility = ()=>{
        meseSelect.style.display = periodicitaSelect.value === "annuale" ? "inline-block" : "none";
      };
      syncMeseVisibility();
      periodicitaSelect.addEventListener("change", syncMeseVisibility);
    }
  }

  // aggiorna dal vivo il campo calcolato mentre si digita
  if(cfg.computedField){
    const computedEl = document.getElementById("computed-" + cfg.computedField.chiave);
    if(computedEl){
      cfg.computedField.sources.forEach(key=>{
        const input = wrap.querySelector(`[data-chiave="${key}"]`);
        if(input){
          input.addEventListener("input", ()=>{
            const dati = {};
            cfg.computedField.sources.forEach(k=>{
              const inp = wrap.querySelector(`[data-chiave="${k}"]`);
              dati[k] = inp ? inp.value : "";
            });
            computedEl.value = "€ " + computeFieldValue(cfg, dati).toFixed(2);
          });
        }
      });
    }
  }
}

async function saveRecord(){
  const cfg = SECTIONS[activeSection];
  const inputs = document.querySelectorAll("#modal-contratto-fields input, #modal-contratto-fields select");
  const dati = {};
  inputs.forEach(inp=>{
    if(inp.dataset.chiave && inp.value !== "") dati[inp.dataset.chiave] = inp.value;
  });
  if(cfg.computedField){
    dati[cfg.computedField.chiave] = computeFieldValue(cfg, dati).toFixed(2);
  }
  if(cfg.rinnovoField){
    const giornoEl = document.getElementById("rinnovo-giorno");
    const meseEl = document.getElementById("rinnovo-mese");
    if(giornoEl){
      const isAnnuale = cfg.periodicityField && dati[cfg.periodicityField] === "annuale";
      dati[cfg.rinnovoField] = isAnnuale ? `${giornoEl.value}-${meseEl.value}` : giornoEl.value;
    }
  }
  if(editingId){
    const { error } = await sb.from(cfg.table).update({ dati }).eq("id", editingId);
    if(error){ alert("Errore salvataggio: " + error.message); return; }
  } else {
    const { error } = await sb.from(cfg.table).insert({ dati, user_id: currentUser.id });
    if(error){ alert("Errore salvataggio: " + error.message); return; }
  }
  closeModal("modal-contratto");
  await loadRecords(activeSection);
  renderTable(activeSection);
}

async function deleteRecord(){
  if(!editingId) return;
  const cfg = SECTIONS[activeSection];
  if(!confirm("Eliminare questo elemento?")) return;
  const { error } = await sb.from(cfg.table).delete().eq("id", editingId);
  if(error){ alert("Errore eliminazione: " + error.message); return; }
  closeModal("modal-contratto");
  await loadRecords(activeSection);
  renderTable(activeSection);
}

// ---------- MODAL CAMPI (generico, riusato per contratti e abbonamenti) ----------
let activeCampiSection = null;

function openCampiModal(section){
  activeCampiSection = section;
  const cfg = SECTIONS[section];
  const list = document.getElementById("campi-list");
  const ordinati = [...cfg.campi].sort((a,b)=>a.ordine-b.ordine);
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
      <option value="periodicita"${campo.tipo==="periodicita"?" selected":""}>Periodicità (mensile/annuale)</option>
      <option value="password"${campo.tipo==="password"?" selected":""}>Password (mascherata)</option>
      <option value="rinnovo"${campo.tipo==="rinnovo"?" selected":""}>Rinnovo (giorno/mese ricorrente)</option>
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
  const cfg = SECTIONS[activeCampiSection];
  const rows = document.querySelectorAll("#campi-list .campo-row");
  const nuoviCampi = [];
  rows.forEach((row, idx)=>{
    const etichetta = row.querySelector(".campo-etichetta").value.trim();
    if(!etichetta) return;
    const existing = cfg.campi.find(c=>c.id===row.dataset.id);
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

  const idsAttuali = cfg.campi.map(c=>c.id);
  const idsRimasti = nuoviCampi.filter(c=>c.id).map(c=>c.id);
  const idsRimossi = idsAttuali.filter(id=>!idsRimasti.includes(id));
  if(idsRimossi.length){
    await sb.from(cfg.camposTable).delete().in("id", idsRimossi);
  }

  for(const c of nuoviCampi){
    if(c.id){
      await sb.from(cfg.camposTable).update({
        etichetta:c.etichetta, tipo:c.tipo, ordine:c.ordine, mostra_in_tabella:c.mostra_in_tabella
      }).eq("id", c.id);
    } else {
      delete c.id;
      await sb.from(cfg.camposTable).insert(c);
    }
  }

  const { data } = await sb.from(cfg.camposTable).select("*").order("ordine");
  cfg.campi = data;
  closeModal("modal-campi");
  renderTable(activeCampiSection);
}

// ---------- UTIL ----------
function closeModal(id){
  document.getElementById(id).classList.add("hidden");
  if(id === "modal-meteo") stopRadar();
  if(id === "modal-tempo") stopTempo();
}
