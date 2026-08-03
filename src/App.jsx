import React, { useState, useEffect, useMemo, useRef } from "react";

/* ------------------------------------------------------------------ */
/* Categorías — colores inspirados en los billetes colombianos         */
/* ------------------------------------------------------------------ */
const CATEGORIAS = [
  { id: "mercado", nombre: "Mercado", color: "#2A7A86" },
  { id: "restaurantes", nombre: "Restaurantes y domicilios", color: "#C4544F" },
  { id: "transporte", nombre: "Transporte", color: "#6B4E9E" },
  { id: "vivienda", nombre: "Vivienda y servicios", color: "#3B5C8F" },
  { id: "salud", nombre: "Salud", color: "#4E8C5A" },
  { id: "ocio", nombre: "Ocio", color: "#C08A2E" },
  { id: "compras", nombre: "Compras", color: "#A8557E" },
  { id: "suscripciones", nombre: "Suscripciones", color: "#7A6A55" },
  { id: "otros", nombre: "Otros", color: "#6B6F76" },
];
const catById = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[8];

const STORE_KEY = "gastos-v1";
const BACKUP_KEY = "gastos-v1-prev";

/* ------------------------------- fechas ---------------------------- */

const pad = (n) => String(n).padStart(2, "0");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const mesDe = (iso) => iso.slice(0, 7);
const diaDe = (iso) => parseInt(iso.slice(8, 10), 10);

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

const diasEnMes = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const desplazarMes = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const aDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dias = (isoA, isoB) => Math.round((aDate(isoB) - aDate(isoA)) / 86400000);
const etiquetaDia = (iso) => {
  if (iso === hoyISO()) return "Hoy";
  const f = aDate(iso);
  return `${DIAS[f.getDay()]} ${diaDe(iso)} ${CORTOS[f.getMonth()]}`;
};

/* --------- ciclo de tarjeta: del 16 al 15, se paga el 30 ----------- */
/* El ciclo se identifica por el mes en que cierra y se paga.          */
/* Ciclo "2026-08" = 16 jul – 15 ago, se paga el 30 de agosto.         */

const cicloDe = (iso) => (diaDe(iso) <= 15 ? mesDe(iso) : desplazarMes(mesDe(iso), 1));
const cicloInicio = (c) => `${desplazarMes(c, -1)}-16`;
const cicloFin = (c) => `${c}-15`;
const cicloPago = (c) => `${c}-${pad(Math.min(30, diasEnMes(c)))}`;
const mitadDe = (iso) => (diaDe(iso) >= 16 ? 1 : 2);
const mesNum = (c) => Number(c.slice(5, 7));

const etiquetaCiclo = (c) =>
  `16 ${CORTOS[aDate(cicloInicio(c)).getMonth()]} – 15 ${CORTOS[mesNum(c) - 1]}`;
const etiquetaPago = (c) => `${diaDe(cicloPago(c))} de ${MESES[mesNum(c) - 1]}`;
const etiquetaCorta = (c) => `${CORTOS[mesNum(c) - 1]} ${c.slice(2, 4)}`;

/* ------------------------------- plata ----------------------------- */

const pesos = (n) => "$" + Math.round(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
const pesosCorto = (n) => {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
  return pesos(n);
};

/* ---------------- parser local (respaldo sin conexión) ------------- */

const PALABRAS_CAT = {
  mercado: ["mercado","supermercado","exito","éxito","d1","ara","jumbo","olimpica","olímpica","carulla","plaza","verduras","fruta"],
  restaurantes: ["comida","almuerzo","desayuno","cena","restaurante","domicilio","rappi","pizza","hamburguesa","café","cafe","tinto","corrientazo","bar","cerveza","trago"],
  transporte: ["transporte","uber","didi","taxi","bus","transmilenio","gasolina","peaje","parqueadero","sitp","moto"],
  vivienda: ["arriendo","administracion","administración","luz","agua","gas","internet","servicios","recibo","aseo"],
  salud: ["salud","eps","medico","médico","droga","farmacia","gimnasio","gym","odontologo","odontólogo","examenes","exámenes"],
  ocio: ["cine","viaje","paseo","concierto","fiesta","hotel","salida","libro","juego"],
  compras: ["ropa","zapatos","compra","regalo","tecnologia","tecnología","celular","mercadolibre","amazon"],
  suscripciones: ["netflix","spotify","suscripcion","suscripción","plan","icloud","chatgpt","claude","youtube"],
};

function parsearLocal(texto) {
  const t = texto.toLowerCase();
  const regex = /(\d+(?:[.,]\d+)?)\s*(millones|millon|millón|palos|palo|k|mil|m)?/g;
  let match, monto = 0;
  while ((match = regex.exec(t)) !== null) {
    let valor = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    const suf = match[2];
    if (suf === "k" || suf === "mil") valor *= 1000;
    else if (["millones","millon","millón","palos","palo","m"].includes(suf)) valor *= 1000000;
    else if (valor < 1000) valor *= 1000;
    if (valor > monto) monto = valor;
  }
  let categoria = "otros";
  for (const [id, palabras] of Object.entries(PALABRAS_CAT)) {
    if (palabras.some((p) => t.includes(p))) { categoria = id; break; }
  }
  let fecha = hoyISO();
  const d = new Date();
  if (t.includes("anteayer")) { d.setDate(d.getDate() - 2); fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  else if (t.includes("ayer")) { d.setDate(d.getDate() - 1); fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return monto > 0 ? [{ monto, categoria, nota: texto.trim().replace(/\s+/g, " ").slice(0, 60), fecha }] : [];
}

/* -------------------- parser con Claude (principal) ---------------- */

async function parsearConClaude(texto) {
  const lista = CATEGORIAS.map((c) => `${c.id} (${c.nombre})`).join(", ");
  const prompt = `Hoy es ${hoyISO()}. Extrae los gastos del siguiente texto en español colombiano.

Texto: "${texto}"

Reglas:
- Montos en pesos colombianos. "200 mil", "200k", o "200" suelto (si es menor a 1000 asume miles) = 200000. "1 palo" o "1 millón" = 1000000.
- Si hay varios gastos en la frase, devuelve uno por cada uno.
- categoria debe ser uno de estos ids: ${lista}
- fecha en formato YYYY-MM-DD. Si dice "ayer" resta un día. Si no dice nada, usa hoy.
- nota: descripción corta y limpia, máximo 5 palabras, sin el monto.

Responde SOLO un array JSON, sin markdown ni explicación:
[{"monto": 200000, "categoria": "restaurantes", "nota": "almuerzo", "fecha": "${hoyISO()}"}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const raw = data.content.map((i) => i.text || "").join("\n");
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return parsed
    .filter((g) => g && Number(g.monto) > 0)
    .map((g) => ({
      monto: Number(g.monto),
      categoria: catById(g.categoria).id,
      nota: String(g.nota || "").slice(0, 60),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) ? g.fecha : hoyISO(),
    }));
}

/* ------------------------------ estilos ---------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.gx { --bg:#EFECF4; --surface:#FFFFFF; --ink:#211D2B; --muted:#6E6879; --line:#DED9E6;
  --alerta:#C4544F; --ok:#4E8C5A;
  background:var(--bg); color:var(--ink); min-height:100vh;
  font-family:'IBM Plex Sans',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
.gx * { box-sizing:border-box; }
.gx-wrap { max-width:560px; margin:0 auto; padding:16px 16px 96px; }
.gx h1,.gx h3 { font-family:'Bricolage Grotesque','IBM Plex Sans',sans-serif; margin:0; letter-spacing:-0.02em; }
.gx-num { font-family:'IBM Plex Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }

.gx-pantallas { display:flex; gap:4px; background:#E4DFEC; padding:3px; border-radius:11px; margin-bottom:18px; }
.gx-pantallas button { flex:1; padding:8px; border:none; border-radius:8px; background:none;
  font-family:inherit; font-size:13px; color:var(--muted); cursor:pointer; }
.gx-pantallas button[data-on="1"] { background:var(--surface); color:var(--ink); font-weight:600;
  box-shadow:0 1px 2px rgba(33,29,43,0.08); }

.gx-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }
.gx-eyebrow { font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.gx-ciclo { font-size:24px; font-weight:800; }
.gx-pago { font-size:12px; color:var(--muted); margin-top:3px; }
.gx-navmes { display:flex; gap:4px; flex-shrink:0; }
.gx-navmes button { width:32px; height:32px; border-radius:9px; border:1px solid var(--line);
  background:var(--surface); color:var(--ink); font-size:15px; cursor:pointer; line-height:1; }
.gx-navmes button:hover:not(:disabled) { border-color:var(--ink); }
.gx-navmes button:disabled { opacity:0.35; cursor:default; }

.gx-cinta { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:14px; }
.gx-cinta-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px; gap:10px; }
.gx-gastado { font-size:32px; font-weight:600; line-height:1; }
.gx-tope-btn { background:none; border:none; padding:0; cursor:pointer; text-align:right; color:var(--muted); font-size:12px; font-family:inherit; }
.gx-tope-btn u { text-decoration-style:dotted; text-underline-offset:3px; }
.gx-bandas { display:flex; gap:2px; height:26px; border-radius:6px; overflow:hidden; background:#E4DFEC; }
.gx-banda { flex:1; position:relative; overflow:hidden; }
.gx-banda-fill { position:absolute; inset:0;
  background-image:repeating-linear-gradient(115deg,rgba(255,255,255,0.22) 0 2px,transparent 2px 6px); }
.gx-cinta-pie { display:flex; justify-content:space-between; margin-top:9px; font-size:12px; color:var(--muted); }
.gx-aviso { margin-top:11px; padding:9px 11px; border-radius:9px; font-size:13px; line-height:1.45; }

.gx-tabs { display:flex; gap:6px; margin:18px 0 12px; }
.gx-tab { flex:1; padding:9px 6px; border-radius:10px; border:1px solid var(--line);
  background:var(--surface); cursor:pointer; font-family:inherit; font-size:12px; color:var(--muted); }
.gx-tab b { display:block; font-size:15px; color:var(--ink); font-weight:600;
  font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums; margin-top:2px; }
.gx-tab[data-on="1"] { border-color:var(--ink); background:var(--ink); color:#C9C2D6; }
.gx-tab[data-on="1"] b { color:#fff; }

.gx-entrada { position:relative; margin-bottom:6px; }
.gx-entrada textarea { width:100%; resize:none; border:1.5px solid var(--ink); border-radius:13px;
  background:var(--surface); padding:14px 52px 14px 14px; font-family:inherit; font-size:15px;
  color:var(--ink); line-height:1.4; min-height:52px; }
.gx-entrada textarea::placeholder { color:#9A93A8; }
.gx-entrada textarea:focus { outline:2px solid #6B4E9E; outline-offset:2px; }
.gx-enviar { position:absolute; right:8px; bottom:8px; width:36px; height:36px; border-radius:9px;
  border:none; background:var(--ink); color:#fff; cursor:pointer; font-size:16px; line-height:1; }
.gx-enviar:disabled { opacity:0.4; cursor:default; }
.gx-hint { font-size:12px; color:var(--muted); margin:0 0 4px 2px; }
.gx-error { color:var(--alerta); font-size:13px; margin:6px 0 4px 2px; }

.gx-quincena { margin:0 0 4px; }
.gx-quincena-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px;
  font-size:12px; color:var(--muted); margin-bottom:6px; }

.gx-seccion { display:flex; justify-content:space-between; align-items:baseline; gap:10px;
  font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted);
  font-weight:600; margin:26px 0 10px; }
.gx-dia-head { display:flex; justify-content:space-between; font-size:12px; color:var(--muted);
  padding:10px 2px 5px; text-transform:capitalize; }
.gx-item { display:flex; align-items:center; gap:11px; background:var(--surface);
  border:1px solid var(--line); border-radius:11px; padding:11px 12px; margin-bottom:5px; }
.gx-chip { width:9px; height:26px; border-radius:3px; flex-shrink:0; }
.gx-item-txt { flex:1; min-width:0; }
.gx-item-editar { flex:1; min-width:0; background:none; border:none; padding:0; margin:0;
  text-align:left; cursor:pointer; font-family:inherit; color:var(--ink); }
.gx-item-editar:hover .gx-item-nota { text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px; }
.gx-banner { display:flex; align-items:center; gap:10px; background:#FBEEED; color:#8E3733;
  border-radius:11px; padding:11px 12px; font-size:13px; line-height:1.4; margin-bottom:14px; }
.gx-banner button { flex-shrink:0; border:1px solid #E0BDBA; background:#fff; color:#8E3733;
  border-radius:8px; padding:6px 10px; font-family:inherit; font-size:12px; cursor:pointer; }
.gx-select { width:100%; border:1.5px solid var(--line); border-radius:10px; padding:12px;
  font-family:inherit; font-size:15px; margin:6px 0 0; color:var(--ink); background:var(--surface); }
.gx-fecha { width:100%; border:1.5px solid var(--line); border-radius:10px; padding:11px;
  font-family:inherit; font-size:15px; margin:6px 0 0; color:var(--ink); background:var(--surface); }
.gx-eliminar { width:100%; margin-top:10px; border:none; background:none; color:var(--alerta);
  font-family:inherit; font-size:13px; cursor:pointer; padding:8px; }
.gx-item-nota { display:block; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gx-item-cat { display:block; font-size:11px; color:var(--muted); margin-top:1px; }
.gx-item-monto { font-size:15px; font-weight:500; }
.gx-borrar { border:none; background:none; color:#B9B2C6; cursor:pointer; font-size:17px; padding:2px 3px; line-height:1; }
.gx-borrar:hover { color:var(--alerta); }

.gx-corte { display:flex; align-items:center; gap:10px; margin:22px 0; color:var(--muted);
  font-size:11px; letter-spacing:0.14em; text-transform:uppercase; font-weight:600; }
.gx-corte::before,.gx-corte::after { content:""; flex:1; height:0; border-top:2px dashed #CFC8DC; }

.gx-cat { display:flex; align-items:center; gap:10px; margin-bottom:9px; }
.gx-cat-nom { font-size:13px; width:34%; flex-shrink:0; }
.gx-cat-barra { flex:1; height:8px; background:#E4DFEC; border-radius:4px; overflow:hidden; }
.gx-cat-barra span { display:block; height:100%; border-radius:4px; }
.gx-cat-val { font-size:13px; width:74px; text-align:right; }

.gx-vacio { background:var(--surface); border:1px dashed var(--line); border-radius:13px;
  padding:26px 18px; text-align:center; color:var(--muted); font-size:14px; line-height:1.5; }

/* ---------------------------- historial --------------------------- */
.gx-rango { display:flex; gap:5px; }
.gx-rango button { border:1px solid var(--line); background:var(--surface); color:var(--muted);
  border-radius:8px; padding:5px 9px; font-family:inherit; font-size:12px; cursor:pointer; }
.gx-rango button[data-on="1"] { background:var(--ink); border-color:var(--ink); color:#fff; }

.gx-grafico { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 14px 10px; }
.gx-plot { position:relative; display:flex; align-items:flex-end; gap:7px; height:140px; }
.gx-col { flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
  height:100%; background:none; border:none; padding:0; cursor:pointer; font-family:inherit; }
.gx-col-val { font-size:10px; color:var(--muted); margin-bottom:4px; font-family:'IBM Plex Mono',monospace; }
.gx-col-barra { width:100%; border-radius:5px 5px 2px 2px; min-height:3px;
  background-image:repeating-linear-gradient(115deg,rgba(255,255,255,0.2) 0 2px,transparent 2px 6px); }
.gx-col:hover .gx-col-barra { filter:brightness(1.12); }
.gx-topeline { position:absolute; left:0; right:0; border-top:2px dashed #211D2B; opacity:0.35; }
.gx-topelabel { position:absolute; right:0; font-size:10px; color:var(--muted); transform:translateY(-14px);
  background:var(--surface); padding-left:4px; }
.gx-ejex { display:flex; gap:7px; margin-top:8px; }
.gx-ejex span { flex:1; text-align:center; font-size:10px; color:var(--muted); }

.gx-fila { display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--line);
  border-radius:11px; padding:11px 12px; margin-bottom:5px; width:100%; cursor:pointer;
  font-family:inherit; text-align:left; color:var(--ink); }
.gx-fila-txt { flex:1; min-width:0; }
.gx-fila-tit { display:block; font-size:14px; }
.gx-fila-sub { display:block; font-size:11px; color:var(--muted); margin-top:1px; }
.gx-marca { font-size:11px; padding:3px 7px; border-radius:20px; font-weight:600; white-space:nowrap; }

.gx-rubro { display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--line);
  border-radius:11px; padding:11px 12px; margin-bottom:5px; }
.gx-rubro-txt { flex:1; min-width:0; }
.gx-rubro-nom { display:block; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gx-rubro-sub { display:block; font-size:11px; color:var(--muted); margin-top:2px; }
.gx-spark { width:56px; height:20px; flex-shrink:0; }
.gx-delta { font-size:11px; font-weight:600; }

.gx-export { display:flex; gap:8px; margin-top:10px; }
.gx-copia { width:100%; height:150px; border:1px solid var(--line); border-radius:10px; padding:10px;
  font-family:'IBM Plex Mono',monospace; font-size:11px; margin-top:12px; color:var(--ink); resize:none; }

.gx-cargando { display:inline-block; width:13px; height:13px; border:2px solid #fff;
  border-top-color:transparent; border-radius:50%; animation:gx-spin 0.7s linear infinite; }
@keyframes gx-spin { to { transform:rotate(360deg); } }

.gx-modal { position:fixed; inset:0; background:rgba(33,29,43,0.45); display:flex;
  align-items:center; justify-content:center; padding:20px; z-index:50; }
.gx-modal-card { background:var(--surface); border-radius:15px; padding:20px; width:100%; max-width:400px; }
.gx-modal-card input { width:100%; border:1.5px solid var(--line); border-radius:10px; padding:12px;
  font-family:'IBM Plex Mono',monospace; font-size:17px; margin:6px 0 0; color:var(--ink); }
.gx-modal-card input:focus { outline:2px solid #6B4E9E; outline-offset:1px; border-color:var(--ink); }
.gx-label { display:block; font-size:11px; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--muted); font-weight:600; margin-top:14px; }
.gx-botones { display:flex; gap:8px; margin-top:18px; }
.gx-btn { flex:1; padding:11px; border-radius:10px; font-family:inherit; font-size:14px; cursor:pointer;
  border:1px solid var(--line); background:var(--surface); color:var(--ink); }
.gx-btn:disabled { opacity:0.4; cursor:default; }
.gx-btn-primario { background:var(--ink); color:#fff; border-color:var(--ink); font-weight:500; }

.gx-toast { position:fixed; left:50%; bottom:26px; transform:translateX(-50%); background:var(--ink);
  color:#fff; padding:10px 16px; border-radius:10px; font-size:13px; z-index:60; }

@media (prefers-reduced-motion:reduce) { .gx *,.gx *::before { animation:none!important; transition:none!important; } }
`;

/* -------------------------------- app ------------------------------ */

export default function RegistroDeGastos() {
  const [gastos, setGastos] = useState([]);
  const [tope, setTope] = useState(4000000);
  const [topeQ, setTopeQ] = useState(2000000);
  const [listo, setListo] = useState(false);
  const [texto, setTexto] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [pantalla, setPantalla] = useState("registro");
  const [ciclo, setCiclo] = useState(cicloDe(hoyISO()));
  const [vista, setVista] = useState(mitadDe(hoyISO()) === 1 ? "m1" : "m2");
  const [rango, setRango] = useState(6);
  const [editandoTope, setEditandoTope] = useState(false);
  const [topeBorrador, setTopeBorrador] = useState("");
  const [topeQBorrador, setTopeQBorrador] = useState("");
  const [exportando, setExportando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardadoError, setGuardadoError] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [restaurando, setRestaurando] = useState(null);
  const [importando, setImportando] = useState(null);
  const ultimoBueno = useRef(null);
  const [toast, setToast] = useState("");

  const cargarDatos = async () => {
    setListo(false);
    for (let i = 0; i < 3; i++) {
      try {
        const r = await window.storage.get(STORE_KEY);
        const d = JSON.parse(r.value);
        setGastos(d.gastos || []);
        if (d.tope) setTope(d.tope);
        if (d.topeQ) setTopeQ(d.topeQ);
        ultimoBueno.current = r.value;
        setBloqueado(false);
        setListo(true);
        return;
      } catch {
        // ¿la llave de verdad no existe, o falló la lectura?
        try {
          const l = await window.storage.list("gastos");
          const llaves = (l && l.keys ? l.keys : []).map((k) => (typeof k === "string" ? k : k && k.key));
          if (!llaves.includes(STORE_KEY)) {
            setBloqueado(false);
            setListo(true);
            return; // primera vez de verdad: base vacía
          }
        } catch { /* ni siquiera pudimos listar: reintentamos */ }
        await new Promise((res) => setTimeout(res, 300 * (i + 1)));
      }
    }
    // hay datos guardados pero no los pudimos leer: no escribimos nada
    setBloqueado(true);
    setListo(true);
  };

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const guardar = async (g, t, tq) => {
    if (bloqueado) return false; // nunca sobrescribir datos que no pudimos leer
    const payload = JSON.stringify({ gastos: g, tope: t, topeQ: tq });
    for (let intento = 0; intento < 3; intento++) {
      try {
        if (ultimoBueno.current && ultimoBueno.current !== payload) {
          try { await window.storage.set(BACKUP_KEY, ultimoBueno.current, false); } catch { /* el respaldo es opcional */ }
        }
        await window.storage.set(STORE_KEY, payload, false);
        const check = await window.storage.get(STORE_KEY);
        if (check && check.value === payload) {
          ultimoBueno.current = payload;
          setGuardadoError(false);
          return true;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 250 * (intento + 1)));
      }
    }
    setGuardadoError(true);
    return false;
  };

  const analizarImport = (txt) => {
    setImportando((prev) => ({ ...prev, texto: txt }));
    if (!txt.trim()) return setImportando({ texto: txt, datos: null, error: "" });
    try {
      const d = JSON.parse(txt);
      const lista = Array.isArray(d) ? d : d.gastos;
      if (!Array.isArray(lista)) throw new Error("sin gastos");
      const limpios = lista
        .filter((g) => g && Number(g.monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha))
        .map((g, i) => ({
          id: g.id || `imp-${Date.now()}-${i}`,
          monto: Number(g.monto),
          categoria: catById(g.categoria).id,
          nota: String(g.nota || ""),
          fecha: g.fecha,
        }));
      if (limpios.length === 0) throw new Error("vacío");
      setImportando({
        texto: txt,
        datos: { gastos: limpios, tope: Number(d.tope) || null, topeQ: Number(d.topeQ) || null },
        error: "",
      });
    } catch {
      setImportando({ texto: txt, datos: null, error: "Ese texto no tiene un registro válido. Pega el JSON completo." });
    }
  };

  const aplicarImport = (modo) => {
    const d = importando.datos;
    const nuevos =
      modo === "combinar"
        ? [...gastos, ...d.gastos.filter((n) => !gastos.some((g) => g.id === n.id))]
        : d.gastos;
    const nt = d.tope || tope;
    const ntq = d.topeQ || topeQ;
    setGastos(nuevos);
    setTope(nt);
    setTopeQ(ntq);
    setBloqueado(false);
    setImportando(null);
    setToast(`${nuevos.length} consumos cargados`);
    guardar(nuevos, nt, ntq);
  };

  const abrirRespaldo = async () => {
    try {
      const r = await window.storage.get(BACKUP_KEY);
      const d = JSON.parse(r.value);
      setRestaurando({ valor: r.value, datos: d, n: (d.gastos || []).length });
    } catch {
      setToast("No hay respaldo disponible");
    }
  };

  const restaurar = async () => {
    const d = restaurando.datos;
    setGastos(d.gastos || []);
    if (d.tope) setTope(d.tope);
    if (d.topeQ) setTopeQ(d.topeQ);
    setBloqueado(false);
    ultimoBueno.current = restaurando.valor;
    try { await window.storage.set(STORE_KEY, restaurando.valor, false); } catch { setGuardadoError(true); }
    setRestaurando(null);
    setToast("Respaldo restaurado");
  };

  const registrar = async () => {
    const t = texto.trim();
    if (!t || procesando) return;
    setProcesando(true);
    setError("");
    let nuevos = [];
    try { nuevos = await parsearConClaude(t); } catch { nuevos = parsearLocal(t); }
    if (nuevos.length === 0) {
      setError('No encontré un monto ahí. Prueba con algo como "200k en almuerzo".');
      setProcesando(false);
      return;
    }
    const conId = nuevos.map((g, i) => ({ ...g, id: Date.now() + "-" + i }));
    const todos = [...gastos, ...conId];
    setGastos(todos);
    setTexto("");
    setCiclo(cicloDe(conId[0].fecha));
    setVista(mitadDe(conId[0].fecha) === 1 ? "m1" : "m2");
    setProcesando(false);
    guardar(todos, tope, topeQ);
  };

  const borrar = (id) => {
    const todos = gastos.filter((g) => g.id !== id);
    setGastos(todos);
    setEditando(null);
    guardar(todos, tope, topeQ);
  };

  const aplicarEdicion = () => {
    const monto = parseInt(String(editando.monto).replace(/\D/g, ""), 10);
    if (!(monto > 0)) return;
    const todos = gastos.map((g) =>
      g.id === editando.id
        ? { ...g, monto, categoria: editando.categoria, nota: editando.nota.trim(), fecha: editando.fecha }
        : g
    );
    setGastos(todos);
    setEditando(null);
    guardar(todos, tope, topeQ);
  };

  const aplicarTope = () => {
    const v = parseInt(String(topeBorrador).replace(/\D/g, ""), 10);
    const vq = parseInt(String(topeQBorrador).replace(/\D/g, ""), 10);
    const nt = v > 0 ? v : tope;
    const ntq = vq > 0 ? vq : topeQ;
    setTope(nt); setTopeQ(ntq);
    guardar(gastos, nt, ntq);
    setEditandoTope(false);
  };

  /* ------------------------- ciclo en curso ------------------------- */

  const delCiclo = useMemo(
    () => gastos.filter((g) => cicloDe(g.fecha) === ciclo).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [gastos, ciclo]
  );
  const total = delCiclo.reduce((s, g) => s + g.monto, 0);
  const m1 = delCiclo.filter((g) => mitadDe(g.fecha) === 1);
  const m2 = delCiclo.filter((g) => mitadDe(g.fecha) === 2);
  const totalM1 = m1.reduce((s, g) => s + g.monto, 0);
  const totalM2 = m2.reduce((s, g) => s + g.monto, 0);

  const visibles = vista === "ciclo" ? delCiclo : vista === "m1" ? m1 : m2;
  const totalVisible = vista === "ciclo" ? total : vista === "m1" ? totalM1 : totalM2;

  const hoy = hoyISO();
  const cicloHoy = cicloDe(hoy);
  const esCicloActual = cicloHoy === ciclo;
  const largo = dias(cicloInicio(ciclo), cicloFin(ciclo)) + 1;
  const corridos = esCicloActual ? dias(cicloInicio(ciclo), hoy) + 1 : largo;
  const restantes = Math.max(0, largo - corridos);
  const proyeccion = corridos > 0 ? (total / corridos) * largo : 0;

  const pct = Math.min(100, (total / tope) * 100);
  const colorCinta = pct >= 100 ? "#C4544F" : pct >= 80 ? "#C08A2E" : "#4E8C5A";
  const pctQ = topeQ > 0 ? (totalVisible / topeQ) * 100 : 0;
  const colorQ = pctQ >= 100 ? "#C4544F" : pctQ >= 80 ? "#C08A2E" : "#4E8C5A";

  const porDia = useMemo(() => {
    const mapa = {};
    visibles.forEach((g) => { (mapa[g.fecha] = mapa[g.fecha] || []).push(g); });
    return Object.entries(mapa).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibles]);

  const porCategoria = useMemo(() => {
    const mapa = {};
    visibles.forEach((g) => { mapa[g.categoria] = (mapa[g.categoria] || 0) + g.monto; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [visibles]);

  /* --------------------------- historial ---------------------------- */

  const resumen = useMemo(() => {
    if (gastos.length === 0) return [];
    const cs = gastos.map((g) => cicloDe(g.fecha)).sort();
    let c = cs[0];
    const salida = [];
    while (c <= cicloHoy) {
      const items = gastos.filter((g) => cicloDe(g.fecha) === c);
      const porCat = {};
      items.forEach((g) => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
      const top = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0];
      salida.push({
        ciclo: c,
        total: items.reduce((s, g) => s + g.monto, 0),
        m1: items.filter((g) => mitadDe(g.fecha) === 1).reduce((s, g) => s + g.monto, 0),
        m2: items.filter((g) => mitadDe(g.fecha) === 2).reduce((s, g) => s + g.monto, 0),
        porCat,
        top: top ? top[0] : null,
        enCurso: c === cicloHoy,
      });
      c = desplazarMes(c, 1);
    }
    return salida;
  }, [gastos, cicloHoy]);

  const ventana = useMemo(() => resumen.slice(-rango), [resumen, rango]);
  const ventanaPrevia = useMemo(
    () => resumen.slice(Math.max(0, resumen.length - rango * 2), Math.max(0, resumen.length - rango)),
    [resumen, rango]
  );

  const maxPlot = Math.max(tope, ...ventana.map((r) => r.total), 1) * 1.12;

  const cerrados = ventana.filter((r) => !r.enCurso);
  const promedio = cerrados.length ? cerrados.reduce((s, r) => s + r.total, 0) / cerrados.length : 0;

  const rubros = useMemo(() => {
    const acum = {}, previo = {};
    ventana.forEach((r) => Object.entries(r.porCat).forEach(([k, v]) => { acum[k] = (acum[k] || 0) + v; }));
    ventanaPrevia.forEach((r) => Object.entries(r.porCat).forEach(([k, v]) => { previo[k] = (previo[k] || 0) + v; }));
    const totalAcum = Object.values(acum).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(acum)
      .sort((a, b) => b[1] - a[1])
      .map(([id, monto]) => ({
        id, monto,
        share: (monto / totalAcum) * 100,
        serie: ventana.map((r) => r.porCat[id] || 0),
        delta: previo[id] ? ((monto - previo[id]) / previo[id]) * 100 : null,
      }));
  }, [ventana, ventanaPrevia]);

  /* --------------------------- exportar ----------------------------- */

  const armarJSON = () => JSON.stringify({ tope, topeQ, gastos }, null, 2);
  const armarCSV = () => {
    const filas = [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) =>
      [g.fecha, cicloDe(g.fecha), mitadDe(g.fecha) === 1 ? "16-fin" : "1-15",
       catById(g.categoria).nombre, `"${(g.nota || "").replace(/"/g, "'")}"`, g.monto].join(",")
    );
    return ["fecha,ciclo,quincena,categoria,nota,monto", ...filas].join("\n");
  };

  const exportar = async (tipo) => {
    const contenido = tipo === "csv" ? armarCSV() : armarJSON();
    try {
      await navigator.clipboard.writeText(contenido);
      setToast(tipo === "csv" ? "CSV copiado" : "JSON copiado");
    } catch {
      setExportando({ tipo, contenido });
    }
  };

  const haySiguiente = ciclo < cicloHoy;
  const mesPrev = desplazarMes(ciclo, -1);

  if (!listo) {
    return (
      <div className="gx"><style>{CSS}</style>
        <div className="gx-wrap"><p style={{ color: "#6E6879" }}>Abriendo tus cuentas…</p></div>
      </div>
    );
  }

  return (
    <div className="gx">
      <style>{CSS}</style>
      <div className="gx-wrap">

        <div className="gx-pantallas">
          <button data-on={pantalla === "registro" ? 1 : 0} onClick={() => setPantalla("registro")}>Registro</button>
          <button data-on={pantalla === "historial" ? 1 : 0} onClick={() => setPantalla("historial")}>Historial</button>
        </div>

        {bloqueado && (
          <div className="gx-banner">
            <span>No pude leer tus datos guardados. No voy a escribir nada para no borrarlos por encima.</span>
            <button onClick={cargarDatos}>Reintentar</button>
          </div>
        )}

        {guardadoError && (
          <div className="gx-banner">
            <span>No se pudo guardar en el dispositivo. Lo que ves sigue acá, pero podría perderse al recargar.</span>
            <button onClick={() => guardar(gastos, tope, topeQ)}>Reintentar</button>
          </div>
        )}

        {pantalla === "registro" ? (
          <>
            <div className="gx-top">
              <div>
                <div className="gx-eyebrow">Ciclo de la tarjeta</div>
                <h1 className="gx-ciclo">{etiquetaCiclo(ciclo)}</h1>
                <div className="gx-pago">Se paga el {etiquetaPago(ciclo)}</div>
              </div>
              <div className="gx-navmes">
                <button onClick={() => setCiclo(desplazarMes(ciclo, -1))} aria-label="Ciclo anterior">←</button>
                <button onClick={() => setCiclo(desplazarMes(ciclo, 1))} disabled={!haySiguiente} aria-label="Ciclo siguiente">→</button>
              </div>
            </div>

            <div className="gx-cinta">
              <div className="gx-cinta-head">
                <div>
                  <div className="gx-eyebrow" style={{ marginBottom: 4 }}>Va del ciclo</div>
                  <div className="gx-gastado gx-num">{pesos(total)}</div>
                </div>
                <button className="gx-tope-btn"
                  onClick={() => { setTopeBorrador(String(tope)); setTopeQBorrador(String(topeQ)); setEditandoTope(true); }}>
                  topes <u>{pesosCorto(tope)} · {pesosCorto(topeQ)}</u>
                </button>
              </div>

              <div className="gx-bandas" role="img" aria-label={`${Math.round(pct)} por ciento del tope del ciclo`}>
                {Array.from({ length: 10 }).map((_, i) => {
                  const llenado = Math.max(0, Math.min(1, (pct - i * 10) / 10));
                  return (
                    <div className="gx-banda" key={i}>
                      {llenado > 0 && (
                        <div className="gx-banda-fill" style={{ right: `${(1 - llenado) * 100}%`, backgroundColor: colorCinta }} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="gx-cinta-pie">
                <span>{Math.round(pct)}% del tope</span>
                <span className="gx-num">
                  {total <= tope ? `quedan ${pesos(tope - total)}` : `excedido ${pesos(total - tope)}`}
                </span>
              </div>

              {esCicloActual && total > 0 && (
                <div className="gx-aviso" style={{
                  background: proyeccion > tope ? "#FBEEED" : "#EEF4EF",
                  color: proyeccion > tope ? "#8E3733" : "#3A6644",
                }}>
                  {proyeccion > tope
                    ? `A este ritmo el corte cierra en ${pesos(proyeccion)} — ${pesos(proyeccion - tope)} por encima. Faltan ${restantes} días y quedan ${pesos(Math.max(0, tope - total))}.`
                    : `A este ritmo el corte cierra en ${pesos(proyeccion)}. Faltan ${restantes} días: puedes gastar ${pesos((tope - total) / Math.max(1, restantes))} por día.`}
                </div>
              )}
            </div>

            <div className="gx-entrada">
              <textarea rows={2} value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); registrar(); } }}
                placeholder="hoy 200k en almuerzo y 15 en bus"
                aria-label="Escribe tu gasto" />
              <button className="gx-enviar" onClick={registrar} disabled={!texto.trim() || procesando || bloqueado} aria-label="Registrar gasto">
                {procesando ? <span className="gx-cargando" /> : "↑"}
              </button>
            </div>
            {error ? <p className="gx-error">{error}</p> : <p className="gx-hint">Solo consumos de la tarjeta. Entiende montos, categoría y si dice "ayer".</p>}

            <div className="gx-tabs">
              <button className="gx-tab" data-on={vista === "m1" ? 1 : 0} onClick={() => setVista("m1")}>
                16–{diasEnMes(mesPrev)} {CORTOS[mesNum(mesPrev) - 1]} <b>{pesosCorto(totalM1)}</b>
              </button>
              <button className="gx-tab" data-on={vista === "m2" ? 1 : 0} onClick={() => setVista("m2")}>
                1–15 {CORTOS[mesNum(ciclo) - 1]} <b>{pesosCorto(totalM2)}</b>
              </button>
              <button className="gx-tab" data-on={vista === "ciclo" ? 1 : 0} onClick={() => setVista("ciclo")}>
                Ciclo <b>{pesosCorto(total)}</b>
              </button>
            </div>

            {vista !== "ciclo" && (
              <div className="gx-quincena">
                <div className="gx-quincena-head">
                  <span>Tope de la quincena · {pesosCorto(topeQ)}</span>
                  <span className="gx-num">
                    {totalVisible <= topeQ ? `quedan ${pesos(topeQ - totalVisible)}` : `excedido ${pesos(totalVisible - topeQ)}`}
                  </span>
                </div>
                <div className="gx-cat-barra">
                  <span style={{ width: `${Math.min(100, pctQ)}%`, backgroundColor: colorQ }} />
                </div>
              </div>
            )}

            {visibles.length === 0 ? (
              <div className="gx-vacio">Nada registrado en este corte.<br />Escribe arriba tu primer consumo.</div>
            ) : (
              <>
                <div className="gx-seccion"><span>Desglose</span><span className="gx-num">{pesos(totalVisible)}</span></div>
                {porCategoria.map(([id, monto]) => (
                  <div className="gx-cat" key={id}>
                    <span className="gx-cat-nom">{catById(id).nombre}</span>
                    <span className="gx-cat-barra">
                      <span style={{ width: `${(monto / totalVisible) * 100}%`, backgroundColor: catById(id).color }} />
                    </span>
                    <span className="gx-cat-val gx-num">{pesosCorto(monto)}</span>
                  </div>
                ))}

                <div className="gx-seccion"><span>Movimientos</span></div>
                {porDia.map(([fecha, items], idx) => {
                  const anterior = porDia[idx - 1];
                  const cambioDeMes = vista === "ciclo" && anterior && mesDe(anterior[0]) !== mesDe(fecha);
                  return (
                    <div key={fecha}>
                      {cambioDeMes && <div className="gx-corte">cambio de mes</div>}
                      <div className="gx-dia-head">
                        <span>{etiquetaDia(fecha)}</span>
                        <span className="gx-num">{pesos(items.reduce((s, g) => s + g.monto, 0))}</span>
                      </div>
                      {items.map((g) => (
                        <div className="gx-item" key={g.id}>
                          <span className="gx-chip" style={{ backgroundColor: catById(g.categoria).color }} />
                          <button className="gx-item-editar"
                            onClick={() => setEditando({ ...g, monto: String(g.monto), nota: g.nota || "" })}
                            aria-label={`Editar ${g.nota || catById(g.categoria).nombre}`}>
                            <span className="gx-item-nota">{g.nota || catById(g.categoria).nombre}</span>
                            <span className="gx-item-cat">{catById(g.categoria).nombre}</span>
                          </button>
                          <span className="gx-item-monto gx-num">{pesos(g.monto)}</span>
                          <button className="gx-borrar" onClick={() => borrar(g.id)} aria-label="Eliminar consumo">×</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </>
        ) : (
          /* ---------------------- pantalla historial ------------------ */
          <>
            <div className="gx-top">
              <div>
                <div className="gx-eyebrow">Historial</div>
                <h1 className="gx-ciclo">{resumen.length} {resumen.length === 1 ? "ciclo" : "ciclos"}</h1>
                <div className="gx-pago">
                  {cerrados.length > 0 ? `Promedio de los cerrados: ${pesos(promedio)}` : "Aún sin ciclos cerrados"}
                </div>
              </div>
              <div className="gx-rango">
                {[3, 6, 12].map((r) => (
                  <button key={r} data-on={rango === r ? 1 : 0} onClick={() => setRango(r)}>{r}</button>
                ))}
              </div>
            </div>

            {resumen.length === 0 ? (
              <>
                <div className="gx-vacio">
                  Todavía no hay nada que graficar.<br />
                  Si vienes de una versión anterior, pega acá tu respaldo.
                </div>
                <div className="gx-export">
                  <button className="gx-btn gx-btn-primario" onClick={() => setImportando({ texto: "", datos: null, error: "" })}>
                    Importar JSON
                  </button>
                  <button className="gx-btn" onClick={abrirRespaldo}>Restaurar copia anterior</button>
                </div>
              </>
            ) : (
              <>
                <div className="gx-grafico">
                  <div className="gx-plot">
                    <div className="gx-topeline" style={{ bottom: `${(tope / maxPlot) * 100}%` }} />
                    <span className="gx-topelabel" style={{ bottom: `${(tope / maxPlot) * 100}%` }}>
                      tope {pesosCorto(tope)}
                    </span>
                    {ventana.map((r) => {
                      const color = r.total > tope ? "#C4544F" : r.total > tope * 0.8 ? "#C08A2E" : "#4E8C5A";
                      return (
                        <button key={r.ciclo} className="gx-col"
                          onClick={() => { setCiclo(r.ciclo); setVista("ciclo"); setPantalla("registro"); }}
                          aria-label={`Ciclo ${etiquetaCiclo(r.ciclo)}: ${pesos(r.total)}`}>
                          {ventana.length <= 6 && <span className="gx-col-val">{pesosCorto(r.total)}</span>}
                          <span className="gx-col-barra" style={{
                            height: `${Math.max(2, (r.total / maxPlot) * 100)}%`,
                            backgroundColor: color,
                            opacity: r.enCurso ? 0.55 : 1,
                          }} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="gx-ejex">
                    {ventana.map((r) => <span key={r.ciclo}>{etiquetaCorta(r.ciclo)}</span>)}
                  </div>
                </div>

                <div className="gx-seccion"><span>Por rubro · últimos {ventana.length}</span>
                  <span>{ventanaPrevia.length > 0 ? "vs. período anterior" : ""}</span></div>
                {rubros.map((r) => {
                  const max = Math.max(...r.serie, 1);
                  const puntos = r.serie.map((v, i) =>
                    `${(i / Math.max(1, r.serie.length - 1)) * 56},${18 - (v / max) * 16}`).join(" ");
                  return (
                    <div className="gx-rubro" key={r.id}>
                      <span className="gx-chip" style={{ backgroundColor: catById(r.id).color }} />
                      <span className="gx-rubro-txt">
                        <span className="gx-rubro-nom">{catById(r.id).nombre}</span>
                        <span className="gx-rubro-sub">
                          <span className="gx-num">{pesos(r.monto)}</span> · {Math.round(r.share)}% del gasto
                          {r.delta !== null && (
                            <span className="gx-delta" style={{ color: r.delta > 0 ? "#C4544F" : "#4E8C5A", marginLeft: 6 }}>
                              {r.delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(r.delta))}%
                            </span>
                          )}
                        </span>
                      </span>
                      {r.serie.length > 1 && (
                        <svg className="gx-spark" viewBox="0 0 56 20" preserveAspectRatio="none" aria-hidden="true">
                          <polyline points={puntos} fill="none" stroke={catById(r.id).color}
                            strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  );
                })}

                <div className="gx-seccion"><span>Ciclos</span></div>
                {[...resumen].reverse().map((r) => {
                  const excedido = r.total > tope;
                  return (
                    <button className="gx-fila" key={r.ciclo}
                      onClick={() => { setCiclo(r.ciclo); setVista("ciclo"); setPantalla("registro"); }}>
                      <span className="gx-fila-txt">
                        <span className="gx-fila-tit">{etiquetaCiclo(r.ciclo)}</span>
                        <span className="gx-fila-sub">
                          {r.enCurso ? "en curso" : `pagado el ${etiquetaPago(r.ciclo)}`}
                          {r.top ? ` · más en ${catById(r.top).nombre.toLowerCase()}` : ""}
                        </span>
                      </span>
                      <span className="gx-num" style={{ fontSize: 15 }}>{pesos(r.total)}</span>
                      {!r.enCurso && (
                        <span className="gx-marca" style={{
                          background: excedido ? "#FBEEED" : "#EEF4EF",
                          color: excedido ? "#8E3733" : "#3A6644",
                        }}>
                          {excedido ? `+${pesosCorto(r.total - tope)}` : "en tope"}
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="gx-seccion"><span>Respaldo</span></div>
                <p style={{ fontSize: 13, color: "#6E6879", margin: "0 0 10px", lineHeight: 1.45 }}>
                  Copia tu JSON antes de pedir cualquier cambio al artefacto: una versión nueva arranca
                  con la memoria vacía y se recupera pegando ese texto acá.
                </p>
                <div className="gx-export">
                  <button className="gx-btn" onClick={() => exportar("json")}>Copiar JSON</button>
                  <button className="gx-btn gx-btn-primario" onClick={() => setImportando({ texto: "", datos: null, error: "" })}>
                    Importar JSON
                  </button>
                </div>
                <div className="gx-export">
                  <button className="gx-btn" onClick={() => exportar("csv")}>Copiar CSV para Excel</button>
                </div>
                <button className="gx-btn" style={{ width: "100%", marginTop: 8 }} onClick={abrirRespaldo}>
                  Restaurar copia anterior
                </button>
              </>
            )}
          </>
        )}
      </div>

      {editandoTope && (
        <div className="gx-modal" onClick={(e) => { if (e.target === e.currentTarget) setEditandoTope(false); }}>
          <div className="gx-modal-card">
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Topes</h3>
            <p style={{ fontSize: 13, color: "#6E6879", margin: "6px 0 0" }}>
              Te aviso al llegar al 80% y cuando los pases.
            </p>
            <label className="gx-label" htmlFor="tope-ciclo">Por ciclo (lo que se paga)</label>
            <input id="tope-ciclo" autoFocus inputMode="numeric" value={topeBorrador}
              onChange={(e) => setTopeBorrador(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && aplicarTope()} />
            <label className="gx-label" htmlFor="tope-q">Por quincena</label>
            <input id="tope-q" inputMode="numeric" value={topeQBorrador}
              onChange={(e) => setTopeQBorrador(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && aplicarTope()} />
            <div className="gx-botones">
              <button className="gx-btn" onClick={() => setEditandoTope(false)}>Cancelar</button>
              <button className="gx-btn gx-btn-primario" onClick={aplicarTope}>Guardar topes</button>
            </div>
          </div>
        </div>
      )}

      {exportando && (
        <div className="gx-modal" onClick={(e) => { if (e.target === e.currentTarget) setExportando(null); }}>
          <div className="gx-modal-card">
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Tu registro en {exportando.tipo.toUpperCase()}</h3>
            <p style={{ fontSize: 13, color: "#6E6879", margin: "6px 0 0" }}>
              Selecciona el texto y cópialo a mano.
            </p>
            <textarea className="gx-copia" readOnly value={exportando.contenido}
              onFocus={(e) => e.target.select()} />
            <div className="gx-botones">
              <button className="gx-btn gx-btn-primario" onClick={() => setExportando(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="gx-modal" onClick={(e) => { if (e.target === e.currentTarget) setEditando(null); }}>
          <div className="gx-modal-card">
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Editar consumo</h3>

            <label className="gx-label" htmlFor="ed-monto">Monto</label>
            <input id="ed-monto" autoFocus inputMode="numeric" value={editando.monto}
              onChange={(e) => setEditando({ ...editando, monto: e.target.value.replace(/\D/g, "") })}
              onKeyDown={(e) => e.key === "Enter" && aplicarEdicion()} />

            <label className="gx-label" htmlFor="ed-nota">Descripción</label>
            <input id="ed-nota" style={{ fontFamily: "inherit", fontSize: 15 }} value={editando.nota}
              onChange={(e) => setEditando({ ...editando, nota: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && aplicarEdicion()} />

            <label className="gx-label" htmlFor="ed-cat">Categoría</label>
            <select id="ed-cat" className="gx-select" value={editando.categoria}
              onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            <label className="gx-label" htmlFor="ed-fecha">Fecha</label>
            <input id="ed-fecha" type="date" className="gx-fecha" value={editando.fecha}
              onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />

            <div className="gx-botones">
              <button className="gx-btn" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="gx-btn gx-btn-primario" onClick={aplicarEdicion}>Guardar cambios</button>
            </div>
            <button className="gx-eliminar" onClick={() => borrar(editando.id)}>Eliminar este consumo</button>
          </div>
        </div>
      )}

      {restaurando && (
        <div className="gx-modal" onClick={(e) => { if (e.target === e.currentTarget) setRestaurando(null); }}>
          <div className="gx-modal-card">
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Restaurar copia anterior</h3>
            <p style={{ fontSize: 13, color: "#6E6879", margin: "8px 0 0", lineHeight: 1.45 }}>
              La copia guarda {restaurando.n} {restaurando.n === 1 ? "consumo" : "consumos"} por{" "}
              {pesos((restaurando.datos.gastos || []).reduce((s, g) => s + g.monto, 0))}.
              Ahora mismo tienes {gastos.length}. Restaurar reemplaza lo que hay.
            </p>
            <div className="gx-botones">
              <button className="gx-btn" onClick={() => setRestaurando(null)}>Cancelar</button>
              <button className="gx-btn gx-btn-primario" onClick={restaurar}>Restaurar</button>
            </div>
          </div>
        </div>
      )}

      {importando && (
        <div className="gx-modal" onClick={(e) => { if (e.target === e.currentTarget) setImportando(null); }}>
          <div className="gx-modal-card">
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Importar registro</h3>
            <p style={{ fontSize: 13, color: "#6E6879", margin: "8px 0 0", lineHeight: 1.45 }}>
              Pega el JSON que copiaste de la versión anterior.
            </p>
            <textarea className="gx-copia" value={importando.texto} autoFocus
              placeholder='{"tope": 4000000, "gastos": [...]}'
              onChange={(e) => analizarImport(e.target.value)} />
            {importando.error && <p className="gx-error" style={{ margin: "4px 0 0" }}>{importando.error}</p>}
            {importando.datos && (
              <p style={{ fontSize: 13, color: "#3A6644", margin: "6px 0 0" }}>
                Encontré {importando.datos.gastos.length} consumos por{" "}
                {pesos(importando.datos.gastos.reduce((s, g) => s + g.monto, 0))}.
              </p>
            )}
            <div className="gx-botones">
              <button className="gx-btn" onClick={() => setImportando(null)}>Cancelar</button>
              <button className="gx-btn" disabled={!importando.datos} onClick={() => aplicarImport("combinar")}>
                Combinar
              </button>
              <button className="gx-btn gx-btn-primario" disabled={!importando.datos} onClick={() => aplicarImport("reemplazar")}>
                Reemplazar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="gx-toast">{toast}</div>}
    </div>
  );
}
