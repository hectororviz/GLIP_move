// Asigna User.locations_id = puesto glpi_id para las 119 personas seguras (incluye libres).
//   node scripts/import-personas-ubicacion.mjs --dry-run
//   node scripts/import-personas-ubicacion.mjs --apply
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, "..");
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const XLSX_PATH = "/home/horviz/Documentos/puestos.xlsx";
const APPLY = process.argv.includes("--apply");

const PISO_MAP = { "1": 344, "2": 341, "3": 339, "4": 4 };
const FERRO = "ferro mauro";
const norm = (s) => String(s ?? "").trim();
const normKey = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
function numOfGLPI(name) {
  let m = String(name).match(/puesto\s*0*(\d+)/i); if (m) return parseInt(m[1], 10);
  m = String(name).match(/oficina\s*0*(\d+)/i); if (m) return parseInt(m[1], 10);
  if (/201\/202/.test(String(name))) return 201;
  return null;
}
function key32() { return crypto.createHash("sha256").update(process.env.CONFIG_KEY || "cambia-esta-clave-de-32-caracteres-minimo-123456").digest(); }
function decrypt(p) { if (!p || !p.includes(":")) return p || ""; try { const [a,b,c]=p.split(":"); const d=crypto.createDecipheriv("aes-256-gcm",key32(),Buffer.from(a,"hex")); d.setAuthTag(Buffer.from(b,"hex")); return Buffer.concat([d.update(Buffer.from(c,"hex")),d.final()]).toString("utf8"); } catch { return ""; } }
async function glpiInit(base,at,ut){const r=await fetch(`${base}/initSession`,{headers:{"Content-Type":"application/json",Authorization:`user_token ${ut}`,"App-Token":at}});const j=await r.json().catch(()=>null);if(!r.ok||!j?.session_token)throw new Error("initSession");return j.session_token;}
async function gGet(base,at,tok,p){const r=await fetch(`${base}${p}`,{headers:{"Session-Token":tok,"App-Token":at}});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(`GET ${r.status} ${p}`);return j;}
async function gPut(base,at,tok,p,b){const r=await fetch(`${base}${p}`,{method:"PUT",headers:{"Content-Type":"application/json","Session-Token":tok,"App-Token":at},body:JSON.stringify(b)});const t=await r.text();let j=null;try{j=t?JSON.parse(t):null;}catch{j=t;}if(!r.ok)throw new Error(`PUT ${r.status} ${p}: ${String(t).slice(0,200)}`);return j;}

const OVERRIDES_FULL = { "sosa paola":86,"sosa veronica":195,"magenetto maia":116,"magnetto maia":116,"constanzo brenda":192,"costanzo brenda":192,"eran salamendi cesar":186,"pera reanual enrique":176,"albarracin frnazone martin":133,"calistro melina anabel":216,"villa santiago":217 };
async function resolveFull(base,at,tok,persona,candsByFirst){
  const full=normKey(persona);
  if(OVERRIDES_FULL[full]!==undefined){
    const u=await gGet(base,at,tok,`/User/${OVERRIDES_FULL[full]}`).catch(()=>null);
    if(u&&u.id) return u;
  }
  return null;
}

async function main(){
  const cfg=JSON.parse(fs.readFileSync(path.join(DATA,"config.json"),"utf8"));
  const base=cfg.glpiBaseUrl.replace(/\/$/,"")+"/apirest.php";
  const tok=await glpiInit(base,cfg.appToken,decrypt(cfg.userTokenEnc));
  const wb=XLSX.readFile(XLSX_PATH);
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  const data=rows.slice(1).map(r=>({persona:norm(r[0]),piso:norm(r[3]),puesto:norm(r[4]),interno:norm(r[5])})).filter(d=>d.persona||d.piso);
  let locs=[]; for(let s=0;;s+=200){const l=await gGet(base,cfg.appToken,tok,`/Location/?range=${s}-${s+199}`); if(!Array.isArray(l)||!l.length)break; locs.push(...l); if(l.length<200)break;}
  const floors=JSON.parse(fs.readFileSync(path.join(DATA,"floors.json"),"utf8"));
  const drawn=new Set(floors.flatMap(f=>f.puestos.map(p=>Number(p.glpi_id))));
  const byPidNum=new Map(); for(const l of locs){const n=numOfGLPI(l.name); if(n==null)continue; byPidNum.set(`${Number(l.locations_id)}|${n}`,l);}
  const counts={}; for(const d of data){if(!d.interno||d.persona.toLowerCase()===FERRO)continue; counts[d.interno]=(counts[d.interno]||0)+1;}
  const seguros=[];
  for(const d of data){
    if(d.persona.toLowerCase()===FERRO)continue;
    if(!["1","2","3","4"].includes(d.piso)||!d.persona||!d.interno||counts[d.interno]>1)continue;
    if(!/^\d+$/.test(d.puesto)||+d.puesto<1||+d.puesto>61){ if(!(d.piso==="4"&&d.puesto==="401"))continue; }
    const gl=byPidNum.get(`${PISO_MAP[d.piso]}|${Number(d.puesto)}`);
    if(!gl||!drawn.has(Number(gl.id)))continue;
    seguros.push({...d,glpi_id:Number(gl.id),glpi_name:gl.name});
  }
  console.log(`Seguros: ${seguros.length}`);
  // resolver usuarios por match exacto realname+firstname
  const allUsers=await gGet(base,cfg.appToken,tok,`/User/?range=0-1000`);
  const byFull=new Map();
  for(const u of (Array.isArray(allUsers)?allUsers:[])){
    byFull.set(normKey(`${u.realname||""} ${u.firstname||""}`),u);
  }
  const planes=[],sinUser=[];
  for(const s of seguros){
    let u=byFull.get(normKey(s.persona));
    if(!u && OVERRIDES_FULL[normKey(s.persona)]!==undefined){
      u=(Array.isArray(allUsers)?allUsers:[]).find(x=>Number(x.id)===OVERRIDES_FULL[normKey(s.persona)])||null;
    }
    // ARBIZU, Matías con coma
    if(!u) u=byFull.get(normKey(s.persona.replace(/,/g,"")));
    if(!u){sinUser.push(s);continue;}
    planes.push({...s,userId:Number(u.id),userLogin:u.name,userLoc:u.locations_id==null?null:Number(u.locations_id)});
  }
  console.log(`Resueltos: ${planes.length} sinUser: ${sinUser.length}`);
  sinUser.forEach(s=>console.log("  SIN USER",s.persona));
  const aPoner=planes.filter(p=>p.userLoc!==p.glpi_id);
  console.log(`A actualizar locations_id: ${aPoner.length} (ya iguales ${planes.length-aPoner.length})`);
  if(!APPLY){console.log("(dry-run)");return;}
  const bak={fecha:new Date().toISOString(),items:planes.map(p=>({userId:p.userId,persona:p.persona,locAntes:p.userLoc,locNuevo:p.glpi_id}))};
  fs.writeFileSync(path.join(DATA,`personas-ubicacion-bak-${Date.now()}.json`),JSON.stringify(bak,null,2));
  let ok=0;const errs=[];
  for(const p of aPoner){
    try{await gPut(base,cfg.appToken,tok,`/User/${p.userId}?session_write=true`,{input:{locations_id:p.glpi_id}});ok++;if(ok%20===0)console.log(` ...${ok}/${aPoner.length}`);}catch(e){errs.push({...p,error:e.message});}
  }
  const ts=Date.now();
  fs.writeFileSync(path.join(DATA,`import-personas-ubicacion-${ts}.json`),JSON.stringify({fecha:new Date().toISOString(),total:planes.length,actualizar:aPoner.length,ok,errores:errs.length,sinUser:sinUser.map(s=>s.persona),errs},null,2));
  console.log(`APLICADO personas-ubicacion ok=${ok} err=${errs.length}`);
}
main().catch(e=>{console.error("FALLO:",e.message);process.exit(1);});
