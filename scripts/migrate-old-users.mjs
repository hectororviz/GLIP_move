// Migra bienes users_id de usuarios *-old al homónimo vigente (solo dueño) y desactiva olds.
//   node scripts/migrate-old-users.mjs --dry-run
//   node scripts/migrate-old-users.mjs --apply
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, "..");
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const APPLY = process.argv.includes("--apply");
const TYPES = ["Computer", "Monitor", "Phone", "Printer", "Peripheral", "NetworkEquipment"];

const normKey = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
function key32() { return crypto.createHash("sha256").update(process.env.CONFIG_KEY || "cambia-esta-clave-de-32-caracteres-minimo-123456").digest(); }
function decrypt(p) { if (!p || !p.includes(":")) return p || ""; try { const [a,b,c]=p.split(":"); const d=crypto.createDecipheriv("aes-256-gcm",key32(),Buffer.from(a,"hex")); d.setAuthTag(Buffer.from(b,"hex")); return Buffer.concat([d.update(Buffer.from(c,"hex")),d.final()]).toString("utf8"); } catch { return ""; } }
async function glpiInit(base,at,ut){const r=await fetch(`${base}/initSession`,{headers:{"Content-Type":"application/json",Authorization:`user_token ${ut}`,"App-Token":at}});const j=await r.json().catch(()=>null);if(!r.ok||!j?.session_token)throw new Error("initSession");return j.session_token;}
async function gGet(base,at,tok,p){const r=await fetch(`${base}${p}`,{headers:{"Session-Token":tok,"App-Token":at}});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(`GET ${r.status} ${p}`);return j;}
async function gPut(base,at,tok,p,b){const r=await fetch(`${base}${p}`,{method:"PUT",headers:{"Content-Type":"application/json","Session-Token":tok,"App-Token":at},body:JSON.stringify(b)});const t=await r.text();let j=null;try{j=t?JSON.parse(t):null;}catch{j=t;}if(!r.ok)throw new Error(`PUT ${r.status} ${p}: ${String(t).slice(0,200)}`);return j;}

async function main(){
  const cfg=JSON.parse(fs.readFileSync(path.join(DATA,"config.json"),"utf8"));
  const base=cfg.glpiBaseUrl.replace(/\/$/,"")+"/apirest.php";
  const tok=await glpiInit(base,cfg.appToken,decrypt(cfg.userTokenEnc));
  const all=await gGet(base,cfg.appToken,tok,`/User/?range=0-1000`);
  const users=Array.isArray(all)?all:[];
  const olds=users.filter(u=>/-old$/i.test(u.name||""));
  console.log(`Usuarios: ${users.length} olds: ${olds.length}`);
  const byLogin=new Map(users.map(u=>[u.name,u]));
  const byFull=new Map();
  for(const u of users){const k=normKey(`${u.realname||""} ${u.firstname||""}`); if(!byFull.has(k)) byFull.set(k,u);}

  // mapeo auto: login base -> real exacto
  const maps=[], manuals=[];
  for(const o of olds){
    const baseLogin=String(o.name).replace(/-old$/i,"");
    let dest=byLogin.get(baseLogin)||null;
    let how=dest?"login-base":null;
    if(!dest){
      const k=normKey(`${o.realname||""} ${o.firstname||""}`);
      // buscar vigente con mismo real+first (sin -old)
      dest=users.find(u=>!/-old$/i.test(u.name||"")&&normKey(`${u.realname||""} ${u.firstname||""}`)===k)||null;
      if(dest)how="real-exacto";
    }
    if(!dest){
      // intentos parciales conocidos
      const lk=normKey(o.realname);
      if(lk==="yurrita") dest=users.find(u=>u.name==="mcyurrita")||null;
      else if(lk==="galarza") dest=users.find(u=>u.name==="jugalarza")||null;
      else if(lk==="scheffer") dest=users.find(u=>u.name==="Bscheffer")||null;
      else if(lk==="guruciaga") dest=users.find(u=>u.name==="CGURUCIAGA")||null;
      if(dest)how="real-parcial-conocido";
    }
    if(dest) maps.push({old:o,new:dest,how});
    else manuals.push({old:o});
  }
  console.log(`Auto: ${maps.length} manual-pendiente: ${manuals.length}`);
  manuals.forEach(m=>console.log(`  MANUAL ${m.old.id}:${m.old.name} ${m.old.realname}|${m.old.firstname}`));

  // bienes exactos
  const planes=[];
  for(const m of maps){
    const items=[];
    for(const t of TYPES){
      const j=await gGet(base,cfg.appToken,tok,`/${t}/?searchText[users_id]=${m.old.id}&range=0-200`).catch(()=>[]);
      if(Array.isArray(j)) for(const a of j){ if(Number(a.users_id)===Number(m.old.id)) items.push({type:t,id:Number(a.id),loc:a.locations_id}); }
    }
    planes.push({...m,items});
  }
  const conBienes=planes.filter(p=>p.items.length>0);
  const totalBienes=conBienes.reduce((a,p)=>a+p.items.length,0);
  console.log(`Con bienes exactos: ${conBienes.length} olds, ${totalBienes} bienes`);
  conBienes.slice(0,20).forEach(p=>console.log(`  ${p.old.name}(${p.old.id})->${p.new.name}(${p.new.id}) [${p.how}]: ${p.items.map(i=>i.type+':'+i.id).join(',')}`));
  const sinBienes=planes.filter(p=>!p.items.length);
  console.log(`Sin bienes (igual se desactiva si tiene contraparte): ${sinBienes.length}`);

  if(!APPLY){console.log("(dry-run)");return;}

  const bak={fecha:new Date().toISOString(),bienes:conBienes.flatMap(p=>p.items.map(i=>({...i,oldId:p.old.id,oldLogin:p.old.name,newId:p.new.id,newLogin:p.new.new||p.new.name}))),olds:olds.map(o=>({id:o.id,login:o.name,loc:o.locations_id,active:o.is_active}))};
  fs.writeFileSync(path.join(DATA,`old-users-bak-${Date.now()}.json`),JSON.stringify(bak,null,2));
  let ok=0;const errs=[];
  for(const p of conBienes){
    for(const it of p.items){
      try{await gPut(base,cfg.appToken,tok,`/${it.type}/${it.id}?session_write=true`,{input:{users_id:p.new.id}});ok++;}catch(e){errs.push({old:p.old.name,type:it.type,id:it.id,error:e.message});}
    }
    if(ok%10===0)console.log(` ...${ok}`);
  }
  // desactivar olds con contraparte (26) — incluye Ferro y aunque tengan 0 bienes
  let des=0;const desErr=[];
  for(const p of planes){
    try{await gPut(base,cfg.appToken,tok,`/User/${p.old.id}?session_write=true`,{input:{is_active:0}});des++;}catch(e){desErr.push({old:p.old.name,error:e.message});}
  }
  const ts=Date.now();
  fs.writeFileSync(path.join(DATA,`migrate-old-${ts}.json`),JSON.stringify({fecha:new Date().toISOString(),auto:maps.length,manual:manuals.map(m=>`${m.old.id}:${m.old.name}`),bienes:totalBienes,transferidos:ok,errores:errs,desactivados:des,desErr},null,2));
  fs.writeFileSync(path.join(DATA,`migrate-old-manual-${ts}.csv`),"oldId;oldLogin;real;firstname;bienes\n"+manuals.map(m=>{const c=conBienes.find(p=>p.old.id===m.old.id);return `${m.old.id};${m.old.name};${m.old.realname};${m.old.firstname};${c?c.items.length:0}`;}).join("\n")+"\n");
  console.log(`APLICADO bienes=${ok}/${totalBienes} err=${errs.length} desactivados=${des}/${planes.length} desErr=${desErr.length}`);
  errs.slice(0,10).forEach(e=>console.log("  ERR",JSON.stringify(e)));
  desErr.slice(0,10).forEach(e=>console.log("  DESERR",JSON.stringify(e)));
}
main().catch(e=>{console.error("FALLO:",e.message);process.exit(1);});
