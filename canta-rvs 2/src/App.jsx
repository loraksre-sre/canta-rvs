import { useState, useEffect } from "react";
import {
  subscribeReservaciones, subscribeReportes,
  saveReservacion, deleteReservacion, saveReporte,
} from "./firebase.js";

// ── Canta Corazón brand tokens (light / rose / warm cream) ────
const C = {
  bg:       "#faf5f0",       // fondo crema cálido
  bgCard:   "#f5ede6",       // tarjetas ligeramente más oscuras
  bgInput:  "#fff8f4",       // inputs casi blanco
  border:   "#e2cfc6",       // bordes beige-rosa
  borderDk: "#c9b0a4",       // borde más marcado
  rose:     "#c4787a",       // rosa palo principal
  roseLt:   "#e8a8a8",       // rosa claro
  roseDk:   "#8f4a4c",       // rosa oscuro / vino
  wine:     "#6b2d2e",       // vino profundo
  cream:    "#3d2020",       // texto principal (café oscuro)
  muted:    "#9a7870",       // texto secundario
  faint:    "#ede0d8",       // fondo sutil
  gold:     "#b8905a",       // dorado cálido
  goldDim:  "#d4b08a",       // dorado claro
  green:    "#6b9e7a",       // verde suave
  red:      "#b84040",       // error
  white:    "#fffaf7",       // blanco cálido
};

const ROLES = [
  { id:"socio",     label:"Socio",      color:C.wine   },
  { id:"rp",        label:"RP",         color:"#7a5a8f" },
  { id:"team",      label:"Team Canta", color:C.green   },
  { id:"instagram", label:"Instagram",  color:C.rose    },
];

const RC = {
  socio:     { bg:C.wine+"18",    border:C.wine,    text:C.wine    },
  rp:        { bg:"#7a5a8f18",    border:"#7a5a8f", text:"#7a5a8f" },
  team:      { bg:C.green+"18",   border:C.green,   text:C.green   },
  instagram: { bg:C.rose+"22",    border:C.rose,    text:C.roseDk  },
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DAYS_S = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

const f = {
  today:    () => new Date().toISOString().split("T")[0],
  date:     s  => { if(!s) return ""; const[,m,d]=s.split("-"); return `${parseInt(d)} ${MONTHS[parseInt(m)-1]}`; },
  dateFull: s  => { if(!s) return ""; const d=new Date(s+"T12:00:00"); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; },
  wkStart:  s  => { const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split("T")[0]; },
  wkEnd:    s  => { const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+(6-d.getDay())); return d.toISOString().split("T")[0]; },
  wkLabel:  (s,e) => `${f.date(s)} – ${f.date(e)}`,
  isSat:    () => new Date().getDay()===6,
};

// ── Micro components ──────────────────────────────────────────
const RoseLine = () => (
  <div style={{ display:"flex", alignItems:"center", gap:8, margin:"6px 0" }}>
    <div style={{ flex:1, height:"1px", background:`linear-gradient(90deg,transparent,${C.roseLt})` }} />
    <span style={{ color:C.roseLt, fontSize:10 }}>✦</span>
    <div style={{ flex:1, height:"1px", background:`linear-gradient(90deg,${C.roseLt},transparent)` }} />
  </div>
);

const Lbl = ({children}) => (
  <div style={{ fontSize:9, letterSpacing:2.5, color:C.muted, textTransform:"uppercase", marginBottom:10 }}>{children}</div>
);

const StatCard = ({val, label, color=C.rose}) => (
  <div style={{ background:C.white, borderRadius:14, padding:"16px 10px", textAlign:"center", border:`1px solid ${C.border}`, boxShadow:"0 1px 4px #c4787a11" }}>
    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:700, color, fontStyle:"italic" }}>{val}</div>
    <div style={{ fontSize:9, color:C.muted, marginTop:4, letterSpacing:2, textTransform:"uppercase" }}>{label}</div>
  </div>
);

function RoleBar({reservaciones}) {
  const total = reservaciones.length||1;
  return (
    <div>
      {ROLES.map(role => {
        const items = reservaciones.filter(r=>r.rol===role.id);
        if (!items.length) return null;
        const pct = Math.round((items.length/total)*100);
        const personas = items.reduce((s,r)=>s+r.personas,0);
        return (
          <div key={role.id} style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5 }}>
              <span style={{ color:role.color, fontWeight:600 }}>{role.label}</span>
              <span style={{ color:C.muted }}>{items.length} · {personas}p</span>
            </div>
            <div style={{ background:C.faint, borderRadius:2, height:4, overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, background:`linear-gradient(90deg,${role.color},${role.color}88)`, height:"100%", borderRadius:2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildWA(rep) {
  const emoji = {socio:"🥂",rp:"💜",team:"🟢",instagram:"🌹"};
  const lines = [
    `🌹 *CANTA CORAZÓN GTO*`,
    `📊 *Corte Semanal — ${rep.label}*`,
    `_${new Date(rep.generadoEl).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}_`,
    ``,`📌 *${rep.totalReservas} asistieron · ${rep.totalPersonas} personas*`,``,`*Por categoría:*`,
  ];
  ROLES.forEach(role => { const d=rep.byRole[role.id]; if(d?.count>0) lines.push(`${emoji[role.id]} ${role.label}: ${d.count} · ${d.personas}p`); });
  lines.push(``,`*Por día:*`);
  Object.keys(rep.byDay).sort().forEach(fecha => { const d=rep.byDay[fecha]; lines.push(`📅 ${f.date(fecha)}: ${d.count} res · ${d.personas}p`); });
  lines.push(``,`*Detalle:*`);
  rep.reservaciones.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.nombre.localeCompare(b.nombre)).forEach(r => {
    lines.push(`• ${f.date(r.fecha)} | ${r.nombre} | 👤${r.personas} | ${r.iniciales} (${ROLES.find(x=>x.id===r.rol)?.label})`);
  });
  lines.push(``,`_Canta Corazón Gto · Rvs_`);
  return lines.join("\n");
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [view, setView]         = useState("list");
  const [tab, setTab]           = useState("lista");
  const [reservaciones, setRes] = useState([]);
  const [reportes, setRep]      = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [generando, setGen]     = useState(false);
  const [filterRole, setFRole]  = useState("all");
  const [filterDate, setFDate]  = useState("");
  const [selected, setSelected] = useState(null);
  const [selRep, setSelRep]     = useState(null);
  const [toast, setToast]       = useState(null);
  const [copied, setCopied]     = useState(false);
  const [pinOk, setPinOk]       = useState(false);
  const [pinVal, setPinVal]     = useState("");
  const [pinErr, setPinErr]     = useState(false);
  const PIN = "1209";

  const [form, setForm] = useState({fecha:f.today(),nombre:"",personas:"",iniciales:"",rol:""});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setLoading(true);
    let done={r:false,rep:false};
    const chk=()=>{if(done.r&&done.rep)setLoading(false);};
    const u1=subscribeReservaciones(d=>{setRes(d);done.r=true;chk();});
    const u2=subscribeReportes(d=>{setRep(d);done.rep=true;chk();});
    return ()=>{u1();u2();};
  },[]);

  const toast$ = (msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};

  const toggleLlego = async r => {
    try{await saveReservacion({...r,llego:!r.llego});}
    catch{toast$("Error al actualizar","err");}
  };

  const validate = () => {
    const e={};
    if(!form.fecha) e.fecha="Requerido";
    if(!form.nombre.trim()) e.nombre="Requerido";
    if(!form.personas||isNaN(form.personas)||parseInt(form.personas)<1) e.personas="Número válido";
    if(!form.iniciales.trim()) e.iniciales="Requerido";
    if(!form.rol) e.rol="Selecciona una opción";
    const norm=form.nombre.trim().toLowerCase();
    const dup=reservaciones.find(r=>r.nombre.toLowerCase()===norm&&r.fecha===form.fecha);
    if(dup) e.nombre=`"${dup.nombre}" ya está registrado ese día`;
    return e;
  };

  const pinSubmit = ()=>{
    if(pinVal===PIN){setPinOk(true);setPinErr(false);setPinVal("");}
    else{setPinErr(true);setPinVal("");}
  };

  const handleSubmit = async ()=>{
    const e=validate(); if(Object.keys(e).length){setErrors(e);return;}
    setSaving(true);
    const nueva={id:Date.now().toString(),fecha:form.fecha,nombre:form.nombre.trim(),personas:parseInt(form.personas),iniciales:form.iniciales.trim().toUpperCase(),rol:form.rol,llego:false,createdAt:new Date().toISOString()};
    try{await saveReservacion(nueva);setForm({fecha:f.today(),nombre:"",personas:"",iniciales:"",rol:""});setErrors({});setView("list");toast$("Reservación guardada ✓");}
    catch{toast$("Error al guardar","err");}
    setSaving(false);
  };

  const handleDelete = async id=>{
    try{await deleteReservacion(id);setSelected(null);setView("list");toast$("Eliminada","err");}
    catch{toast$("Error al eliminar","err");}
  };

  const generarCorte = async ()=>{
    setGen(true);
    const hoy=f.today(),ss=f.wkStart(hoy),se=f.wkEnd(hoy);
    const semana=reservaciones.filter(r=>r.fecha>=ss&&r.fecha<=se);
    const llegaron=semana.filter(r=>r.llego);
    if(!semana.length){toast$("No hay reservaciones esta semana","err");setGen(false);return;}
    if(!llegaron.length){toast$("Ninguna reserva marcada como llegó","err");setGen(false);return;}
    if(reportes.find(rep=>rep.semanaStart===ss)){toast$("Ya existe un reporte esta semana","err");setGen(false);return;}
    const byRole={};
    ROLES.forEach(r=>{const items=llegaron.filter(x=>x.rol===r.id);byRole[r.id]={count:items.length,personas:items.reduce((s,x)=>s+x.personas,0),reservaciones:items};});
    const byDay={};
    llegaron.forEach(r=>{if(!byDay[r.fecha])byDay[r.fecha]={count:0,personas:0};byDay[r.fecha].count++;byDay[r.fecha].personas+=r.personas;});
    const reporte={id:Date.now().toString(),semanaStart:ss,semanaEnd:se,label:f.wkLabel(ss,se),totalReservas:llegaron.length,totalPersonas:llegaron.reduce((s,r)=>s+r.personas,0),totalRegistradas:semana.length,byRole,byDay,reservaciones:llegaron,generadoEl:new Date().toISOString()};
    try{await saveReporte(reporte);await Promise.all(semana.map(r=>deleteReservacion(r.id)));setSelRep(reporte);setTab("reportes");setView("reporte_detalle");toast$("Corte generado ✓");}
    catch{toast$("Error al generar corte","err");}
    setGen(false);
  };

  const copyText = async rep=>{
    try{await navigator.clipboard.writeText(buildWA(rep));setCopied(true);toast$("Copiado para WhatsApp ✓");setTimeout(()=>setCopied(false),3000);}
    catch{window.prompt("Copia este texto:",buildWA(rep));}
  };

  const downloadImg = async rep=>{
    try{
      const canvas=document.createElement("canvas"),dpr=2,W=640;
      const rl=ROLES.filter(role=>rep.byRole[role.id]?.count>0);
      const dl=Object.keys(rep.byDay).sort();
      const xl=rep.reservaciones.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.nombre.localeCompare(b.nombre));
      const H=440+(rl.length*34)+(dl.length*30)+(xl.length*28)+80;
      canvas.width=W*dpr;canvas.height=H*dpr;
      const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
      // background
      ctx.fillStyle="#faf5f0";ctx.fillRect(0,0,W,H);
      // top rose bar
      ctx.fillStyle=C.rose;ctx.fillRect(0,0,W,5);
      let y=40;
      ctx.fillStyle=C.muted;ctx.font="10px sans-serif";ctx.textAlign="center";ctx.fillText("CANTA CORAZÓN GTO · CORTE SEMANAL",W/2,y);y+=22;
      ctx.fillStyle=C.wine;ctx.font="italic bold 26px serif";ctx.fillText(rep.label,W/2,y);y+=18;
      ctx.fillStyle=C.muted;ctx.font="10px sans-serif";ctx.fillText("Generado el "+new Date(rep.generadoEl).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"}),W/2,y);y+=28;
      ctx.strokeStyle=C.roseLt;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(W-40,y);ctx.stroke();y+=24;
      ctx.textAlign="left";
      ctx.fillStyle=C.rose;ctx.font="italic bold 30px serif";
      ctx.fillText(String(rep.totalReservas),40,y);
      ctx.fillText(String(rep.totalPersonas),220,y);
      ctx.fillStyle=C.muted;ctx.font="10px sans-serif";
      ctx.fillText("asistieron",40,y+14);ctx.fillText("personas",220,y+14);y+=46;
      const rc2={socio:C.wine,rp:"#7a5a8f",team:C.green,instagram:C.rose};
      ctx.fillStyle=C.muted;ctx.font="9px sans-serif";ctx.fillText("POR CATEGORÍA",40,y);y+=16;
      rl.forEach(role=>{
        const d=rep.byRole[role.id];
        ctx.fillStyle=rc2[role.id];ctx.font="bold 12px sans-serif";ctx.fillText(role.label,40,y);
        ctx.fillStyle=C.muted;ctx.font="11px sans-serif";ctx.fillText(`${d.count} reservas · ${d.personas} personas`,160,y);
        const bx=40,by=y+6,bw=W-80,bh=4;
        ctx.fillStyle=C.faint;ctx.fillRect(bx,by,bw,bh);
        ctx.fillStyle=rc2[role.id];ctx.fillRect(bx,by,bw*(d.count/rep.totalReservas),bh);
        y+=34;
      });
      y+=6;
      const mx=Math.max(...dl.map(fx=>rep.byDay[fx].count));
      ctx.fillStyle=C.muted;ctx.font="9px sans-serif";ctx.fillText("POR DÍA",40,y);y+=16;
      dl.forEach(fecha=>{
        const d=rep.byDay[fecha];
        ctx.fillStyle=C.muted;ctx.font="11px sans-serif";ctx.fillText(f.date(fecha),40,y);
        const bx=110,bw=W-240,bh=5,by=y-9;
        ctx.fillStyle=C.faint;ctx.fillRect(bx,by,bw,bh);
        ctx.fillStyle=C.rose;ctx.fillRect(bx,by,bw*(d.count/mx),bh);
        ctx.fillStyle=C.muted;ctx.font="10px sans-serif";ctx.fillText(`${d.count} · ${d.personas}p`,bx+bw+10,y);
        y+=30;
      });
      y+=8;ctx.strokeStyle=C.roseLt;ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(W-40,y);ctx.stroke();y+=18;
      ctx.fillStyle=C.muted;ctx.font="9px sans-serif";ctx.fillText("DETALLE",40,y);y+=18;
      xl.forEach(r=>{
        ctx.fillStyle=C.muted;ctx.font="10px sans-serif";ctx.fillText(f.date(r.fecha),40,y);
        ctx.fillStyle=C.cream;ctx.font="12px sans-serif";ctx.fillText(r.nombre.length>22?r.nombre.slice(0,22)+"…":r.nombre,100,y);
        ctx.fillStyle=C.muted;ctx.font="10px sans-serif";ctx.fillText(`👤${r.personas}`,360,y);
        ctx.fillStyle=rc2[r.rol];ctx.font="bold 10px sans-serif";ctx.fillText(r.iniciales,400,y);
        ctx.fillStyle=C.muted;ctx.font="9px sans-serif";ctx.fillText(ROLES.find(x=>x.id===r.rol)?.label||"",440,y);
        y+=28;
      });
      y+=10;ctx.strokeStyle=C.rose+"66";ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(W-40,y);ctx.stroke();y+=14;
      ctx.fillStyle=C.roseLt;ctx.font="9px sans-serif";ctx.textAlign="center";ctx.fillText("Canta Corazón Gto · Rvs",W/2,y);
      canvas.toBlob(blob=>{
        const url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=`corte-${rep.semanaStart}.png`;a.click();URL.revokeObjectURL(url);
        toast$("Imagen descargada ✓");
      },"image/png");
    }catch{toast$("No se pudo generar la imagen","err");}
  };

  // ── Derived ───────────────────────────────────────────────────
  const allDays     = [...new Set(reservaciones.map(r=>r.fecha))].sort();
  const filteredBase= reservaciones.filter(r=>filterRole==="all"||r.rol===filterRole).filter(r=>!filterDate||r.fecha===filterDate);
  const grouped     = filteredBase.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.nombre.localeCompare(b.nombre)).reduce((acc,r)=>{if(!acc[r.fecha])acc[r.fecha]=[];acc[r.fecha].push(r);return acc;},{});
  const sortedDays  = Object.keys(grouped).sort();
  const totalRes    = filteredBase.length;
  const totalPers   = filteredBase.reduce((s,r)=>s+r.personas,0);
  const totalLleg   = filteredBase.filter(r=>r.llego).length;
  const esSabado    = f.isSat();

  const inp = (err) => ({
    width:"100%", boxSizing:"border-box",
    background: err ? "#fff0f0" : C.bgInput,
    border:`1px solid ${err?C.red:C.border}`,
    borderRadius:10, padding:"13px 16px",
    color:C.cream, fontSize:15, outline:"none",
    fontFamily:"'DM Sans',sans-serif",
  });

  // ── Primary button style ──────────────────────────────────────
  const btnPrimary = {
    width:"100%", padding:"15px",
    background:`linear-gradient(135deg,${C.rose},${C.roseDk})`,
    color:C.white, border:"none", borderRadius:12,
    fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:0.5,
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", color:C.cream, paddingBottom:88 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10, boxShadow:"0 2px 12px #c4787a18" }}>
        <div style={{ padding:"16px 20px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:C.wine, lineHeight:1.1 }}>
              Canta Corazón
            </div>
            <div style={{ fontSize:9, letterSpacing:4, color:C.roseLt, textTransform:"uppercase", marginTop:2 }}>
              Guanajuato · Reservaciones
            </div>
          </div>
          {tab==="lista" && view==="list" && (
            <button onClick={()=>{setView("form");setErrors({});}}
              style={{ background:`linear-gradient(135deg,${C.rose},${C.roseDk})`, color:C.white, border:"none", borderRadius:10, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:"pointer", letterSpacing:0.5, boxShadow:`0 2px 8px ${C.rose}44` }}>
              + Nueva
            </button>
          )}
        </div>
        <div style={{ height:2, background:`linear-gradient(90deg,transparent,${C.roseLt},transparent)` }} />
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", top:82, left:"50%", transform:"translateX(-50%)", background:toast.type==="err"?"#fff0f0":C.white, border:`1px solid ${toast.type==="err"?C.red:C.green}`, color:toast.type==="err"?C.red:"#3a7a54", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:500, zIndex:200, whiteSpace:"nowrap", boxShadow:"0 4px 16px #00000018", fontStyle:"italic" }}>
          {toast.msg}
        </div>
      )}

      {/* ══ TAB LISTA ══════════════════════════════════════════════ */}
      {tab==="lista" && (
        <>
          {view==="list" && (
            <div style={{ padding:"20px 16px" }}>

              {/* Banner sábado */}
              {esSabado && (
                <div style={{ background:`linear-gradient(135deg,${C.rose}18,${C.roseDk}18)`, border:`1px solid ${C.roseLt}`, borderRadius:14, padding:"14px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:12, boxShadow:`0 2px 12px ${C.rose}18` }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:C.rose, fontStyle:"italic" }}>✦</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.wine }}>¡Es sábado!</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Genera el corte con las reservas que llegaron</div>
                  </div>
                  <button onClick={generarCorte} disabled={generando}
                    style={{ background:`linear-gradient(135deg,${C.rose},${C.roseDk})`, color:C.white, border:"none", borderRadius:9, padding:"9px 14px", fontSize:12, fontWeight:700, cursor:generando?"not-allowed":"pointer", boxShadow:`0 2px 8px ${C.rose}44` }}>
                    {generando?"...":"Corte"}
                  </button>
                </div>
              )}

              {/* Días */}
              {allDays.length>0 && (
                <div style={{ marginBottom:16 }}>
                  <Lbl>Día</Lbl>
                  <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
                    <button onClick={()=>setFDate("")}
                      style={{ flexShrink:0, padding:"8px 14px", borderRadius:10, border:`1px solid ${!filterDate?C.rose:C.border}`, background:!filterDate?C.rose+"18":C.white, color:!filterDate?C.roseDk:C.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                      Todos
                    </button>
                    {allDays.map(fecha=>{
                      const d=new Date(fecha+"T12:00:00");
                      const cnt=reservaciones.filter(r=>r.fecha===fecha).length;
                      const active=filterDate===fecha;
                      return (
                        <button key={fecha} onClick={()=>setFDate(active?"":fecha)}
                          style={{ flexShrink:0, minWidth:54, padding:"8px 10px", borderRadius:10, border:`1.5px solid ${active?C.rose:C.border}`, background:active?C.rose+"18":C.white, color:active?C.roseDk:C.muted, fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:1, boxShadow:active?`0 2px 8px ${C.rose}22`:"none" }}>
                          <span style={{ fontSize:9, letterSpacing:1, color:active?C.rose:C.muted }}>{DAYS_S[d.getDay()]}</span>
                          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontStyle:"italic", lineHeight:1.1, color:active?C.wine:C.cream }}>{d.getDate()}</span>
                          <span style={{ fontSize:9, color:active?C.rose:C.borderDk }}>{cnt}r</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Categorías */}
              <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
                {[{id:"all",label:"Todos",color:C.rose},...ROLES].map(r=>(
                  <button key={r.id} onClick={()=>setFRole(r.id==="all"?"all":(filterRole===r.id?"all":r.id))}
                    style={{ padding:"5px 13px", borderRadius:20, border:`1px solid ${filterRole===r.id?r.color:C.border}`, background:filterRole===r.id?r.color+"18":C.white, color:filterRole===r.id?r.color:C.muted, fontSize:11, cursor:"pointer", fontWeight:500 }}>
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:22 }}>
                <StatCard val={totalRes} label="Reservas" color={C.rose} />
                <StatCard val={totalPers} label="Personas" color={C.wine} />
                <StatCard val={totalLleg} label="Llegaron" color={C.green} />
              </div>

              {loading ? (
                <div style={{ textAlign:"center", color:C.muted, padding:40, fontStyle:"italic" }}>Conectando...</div>
              ) : sortedDays.length===0 ? (
                <div style={{ textAlign:"center", padding:"48px 20px", color:C.muted, lineHeight:1.9 }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:42, color:C.roseLt, fontStyle:"italic", marginBottom:8 }}>♪</div>
                  <div style={{ fontSize:13 }}>No hay reservaciones.<br/>Presiona <span style={{ color:C.rose, fontWeight:600 }}>+ Nueva</span> para agregar una.</div>
                </div>
              ) : (
                <div>
                  {sortedDays.map(fecha=>{
                    const items=grouped[fecha];
                    const dP=items.reduce((s,r)=>s+r.personas,0);
                    const dL=items.filter(r=>r.llego).length;
                    return (
                      <div key={fecha} style={{ marginBottom:26 }}>
                        {/* Day header */}
                        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:8 }}>
                          <div>
                            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:17, fontStyle:"italic", color:C.wine }}>{f.dateFull(fecha)}</div>
                            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                              {items.length} reservas · {dP} personas
                              {dL>0 && <span style={{ color:C.green, marginLeft:6 }}>· {dL} llegaron ✓</span>}
                            </div>
                          </div>
                          <div style={{ fontSize:12, color:dL===items.length?C.green:C.muted, fontFamily:"'Playfair Display',serif", fontStyle:"italic", background:C.white, border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 12px" }}>
                            {dL}/{items.length}
                          </div>
                        </div>
                        <div style={{ height:1, background:`linear-gradient(90deg,${C.roseLt}88,transparent)`, marginBottom:10 }} />

                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {items.map((r,idx)=>{
                            const rc=RC[r.rol]||RC.rp;
                            return (
                              <div key={r.id} style={{ display:"flex", alignItems:"center", gap:9 }}>
                                <div style={{ minWidth:18, fontSize:10, color:C.borderDk, textAlign:"right", fontFamily:"'Playfair Display',serif", fontStyle:"italic" }}>{idx+1}</div>

                                {/* Check llegó */}
                                <button onClick={()=>toggleLlego(r)}
                                  style={{ width:28, height:28, borderRadius:8, flexShrink:0, border:`1.5px solid ${r.llego?C.green:C.border}`, background:r.llego?C.green+"18":C.white, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:C.green, transition:"all 0.15s", boxShadow:r.llego?`0 1px 4px ${C.green}33`:"none" }}>
                                  {r.llego?"✓":""}
                                </button>

                                {/* Card */}
                                <div onClick={()=>{setSelected(r);setView("detail");}}
                                  style={{ flex:1, background:r.llego?"#f0f9f4":C.white, border:`1px solid ${r.llego?C.green+"44":C.border}`, borderLeft:`2.5px solid ${r.llego?C.green:rc.border}`, borderRadius:12, padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 4px #c4787a0a" }}>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontWeight:600, fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:r.llego?"#3a7a54":C.cream }}>{r.nombre}</div>
                                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>👤 {r.personas} · <span style={{ color:rc.text }}>{r.iniciales}</span></div>
                                  </div>
                                  <div style={{ fontSize:10, fontWeight:600, padding:"3px 10px", borderRadius:20, background:rc.bg, color:rc.text, border:`1px solid ${rc.border}`, whiteSpace:"nowrap" }}>
                                    {ROLES.find(x=>x.id===r.rol)?.label}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ height:1, background:C.faint, marginTop:18 }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {!esSabado && reservaciones.length>0 && (
                <div style={{ marginTop:12, textAlign:"center" }}>
                  <button onClick={generarCorte} disabled={generando}
                    style={{ background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:"10px 20px", fontSize:11, cursor:generando?"not-allowed":"pointer", letterSpacing:1, textTransform:"uppercase" }}>
                    {generando?"Generando...":"✦ Generar corte semanal"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FORM */}
          {view==="form" && (
            <div style={{ padding:"20px 16px" }}>
              <button onClick={()=>setView("list")} style={{ background:"none", border:"none", color:C.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:20, fontStyle:"italic" }}>← Volver</button>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:C.wine, marginBottom:6 }}>Nueva Reservación</div>
              <RoseLine />
              <div style={{ marginTop:20 }}>
                {[
                  {label:"Fecha",         key:"fecha",     type:"date"},
                  {label:"Nombre",        key:"nombre",    type:"text",   placeholder:"Nombre del cliente"},
                  {label:"Personas",      key:"personas",  type:"number", placeholder:"Núm. de personas"},
                  {label:"Tus iniciales", key:"iniciales", type:"text",   placeholder:"Ej. KS"},
                ].map(field=>(
                  <div key={field.key} style={{ marginBottom:18 }}>
                    <Lbl>{field.label}</Lbl>
                    <input type={field.type} value={form[field.key]} placeholder={field.placeholder}
                      onChange={e=>{setForm(p=>({...p,[field.key]:e.target.value}));setErrors(p=>({...p,[field.key]:null}));}}
                      style={inp(errors[field.key])} />
                    {errors[field.key] && <div style={{ color:C.red, fontSize:11, marginTop:4, fontStyle:"italic" }}>{errors[field.key]}</div>}
                  </div>
                ))}
                <div style={{ marginBottom:28 }}>
                  <Lbl>Registrado por</Lbl>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {ROLES.map(r=>{
                      const active=form.rol===r.id;
                      return (
                        <button key={r.id} onClick={()=>{setForm(p=>({...p,rol:r.id}));setErrors(p=>({...p,rol:null}));}}
                          style={{ flex:"1 1 calc(50% - 4px)", padding:"13px 8px", borderRadius:12, border:`1.5px solid ${active?r.color:C.border}`, background:active?r.color+"18":C.white, color:active?r.color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer", boxShadow:active?`0 2px 8px ${r.color}22`:"none" }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  {errors.rol && <div style={{ color:C.red, fontSize:11, marginTop:5, fontStyle:"italic" }}>{errors.rol}</div>}
                </div>
                <button onClick={handleSubmit} disabled={saving}
                  style={{ ...btnPrimary, opacity:saving?0.6:1, cursor:saving?"not-allowed":"pointer" }}>
                  {saving?"Guardando...":"Guardar Reservación"}
                </button>
              </div>
            </div>
          )}

          {/* DETAIL */}
          {view==="detail" && selected && (()=>{
            const r=selected; const rc=RC[r.rol]||RC.rp;
            return (
              <div style={{ padding:"20px 16px" }}>
                <button onClick={()=>setView("list")} style={{ background:"none", border:"none", color:C.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:22, fontStyle:"italic" }}>← Volver</button>
                <div style={{ background:C.white, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:20, boxShadow:"0 2px 12px #c4787a14" }}>
                  <div style={{ background:`linear-gradient(135deg,${rc.bg},${C.faint})`, padding:"20px 20px 16px", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:9, fontWeight:600, letterSpacing:2.5, color:rc.text, textTransform:"uppercase", marginBottom:8 }}>{ROLES.find(x=>x.id===r.rol)?.label}</div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.wine }}>{r.nombre}</div>
                  </div>
                  <div style={{ padding:"18px 20px" }}>
                    {[
                      {icon:"📅",label:"Fecha",val:f.dateFull(r.fecha)},
                      {icon:"👥",label:"Personas",val:r.personas},
                      {icon:"✍️",label:"Registrado por",val:r.iniciales},
                      {icon:r.llego?"✅":"⏳",label:"Asistencia",val:r.llego?"Llegó":"Pendiente",color:r.llego?C.green:C.muted},
                    ].map(item=>(
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"11px 0", borderBottom:`1px solid ${C.faint}`, fontSize:14 }}>
                        <span style={{ color:C.muted }}>{item.icon} {item.label}</span>
                        <span style={{ fontWeight:600, color:item.color||C.cream }}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={()=>{if(window.confirm("¿Eliminar esta reservación?"))handleDelete(r.id);}}
                  style={{ width:"100%", padding:"13px", background:"transparent", color:C.red, border:`1px solid ${C.red}44`, borderRadius:12, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Eliminar reservación
                </button>
              </div>
            );
          })()}
        </>
      )}

      {/* ══ TAB REPORTES ══════════════════════════════════════════ */}
      {tab==="reportes" && (
        <>
          {!pinOk ? (
            <div style={{ padding:"60px 32px 32px", display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:36, color:C.roseLt, fontStyle:"italic", marginBottom:16 }}>✦</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:C.wine, marginBottom:6, textAlign:"center" }}>Acceso restringido</div>
              <RoseLine />
              <div style={{ fontSize:12, color:C.muted, margin:"16px 0 28px", textAlign:"center", fontStyle:"italic" }}>Ingresa el PIN para ver los cortes semanales</div>
              <div style={{ display:"flex", gap:12, marginBottom:20 }}>
                {[0,1,2,3].map(i=>(
                  <div key={i} style={{ width:14, height:14, borderRadius:"50%", background:pinVal.length>i?C.rose:C.border, border:`1px solid ${pinVal.length>i?C.rose:C.borderDk}`, transition:"background 0.15s" }} />
                ))}
              </div>
              <input type="password" inputMode="numeric" maxLength={4} value={pinVal}
                onChange={e=>{setPinVal(e.target.value.replace(/\D/g,""));setPinErr(false);}}
                onKeyDown={e=>e.key==="Enter"&&pinSubmit()}
                placeholder="••••"
                style={{ width:"100%", maxWidth:200, textAlign:"center", background:C.bgInput, border:`1px solid ${pinErr?C.red:C.border}`, borderRadius:12, padding:"14px", color:C.cream, fontSize:24, letterSpacing:10, outline:"none", marginBottom:8 }} />
              {pinErr && <div style={{ color:C.red, fontSize:12, marginBottom:12, fontStyle:"italic" }}>PIN incorrecto</div>}
              <button onClick={pinSubmit}
                style={{ marginTop:8, width:"100%", maxWidth:200, padding:"13px", background:`linear-gradient(135deg,${C.rose},${C.roseDk})`, color:C.white, border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:`0 2px 10px ${C.rose}44` }}>
                Entrar
              </button>
            </div>
          ) : (
          <>
            {view!=="reporte_detalle" && (
              <div style={{ padding:"20px 16px" }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:C.wine, marginBottom:4 }}>Cortes Semanales</div>
                <RoseLine />
                <div style={{ fontSize:11, color:C.muted, margin:"12px 0 20px", fontStyle:"italic" }}>Solo incluye reservas marcadas como llegaron</div>
                <button onClick={generarCorte} disabled={generando}
                  style={{ width:"100%", padding:"14px", background:esSabado?`linear-gradient(135deg,${C.rose},${C.roseDk})`:C.white, color:esSabado?C.white:C.muted, border:esSabado?"none":`1px solid ${C.border}`, borderRadius:12, fontSize:14, fontWeight:700, cursor:generando?"not-allowed":"pointer", marginBottom:24, boxShadow:esSabado?`0 2px 10px ${C.rose}44`:"none" }}>
                  {generando?"Generando...":"✦ Generar corte de esta semana"}
                  {esSabado && <span style={{ fontSize:11, fontWeight:400, opacity:0.85, marginLeft:8 }}>· Hoy es sábado</span>}
                </button>
                {reportes.length===0 ? (
                  <div style={{ textAlign:"center", padding:"40px 20px", color:C.muted, fontStyle:"italic" }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:32, color:C.roseLt, marginBottom:8 }}>♪</div>
                    Aún no hay cortes generados.
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {reportes.map((rep,i)=>(
                      <div key={rep.id} onClick={()=>{setSelRep(rep);setView("reporte_detalle");}}
                        style={{ background:C.white, borderRadius:13, padding:"16px", border:`1px solid ${C.border}`, borderLeft:`2.5px solid ${i===0?C.rose:C.border}`, cursor:"pointer", display:"flex", alignItems:"center", gap:14, boxShadow:"0 1px 6px #c4787a0a" }}>
                        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:i===0?C.rose:C.borderDk, fontStyle:"italic", minWidth:28, textAlign:"center" }}>✦</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14, color:C.cream }}>{rep.label}</div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{rep.totalReservas} asistieron · {rep.totalPersonas} personas</div>
                        </div>
                        <div style={{ color:C.border, fontSize:18 }}>›</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view==="reporte_detalle" && selRep && (()=>{
              const rep=selRep;
              const dias=Object.keys(rep.byDay).sort();
              return (
                <div style={{ padding:"20px 16px" }}>
                  <button onClick={()=>{setView("list");setTab("reportes");}} style={{ background:"none", border:"none", color:C.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:20, fontStyle:"italic" }}>← Reportes</button>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:C.roseLt, textTransform:"uppercase", marginBottom:6 }}>Corte semanal</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.wine, marginBottom:4 }}>{rep.label}</div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>Generado el {new Date(rep.generadoEl).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</div>
                  <RoseLine />

                  <div style={{ display:"flex", gap:8, margin:"18px 0" }}>
                    <button onClick={()=>copyText(rep)}
                      style={{ flex:1, padding:"12px 8px", background:copied?"#f0f9f4":C.white, border:`1px solid ${copied?C.green:C.border}`, borderRadius:12, color:copied?"#3a7a54":C.muted, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <span>{copied?"✓":"💬"}</span>{copied?"¡Copiado!":"WhatsApp"}
                    </button>
                    <button onClick={()=>downloadImg(rep)}
                      style={{ flex:1, padding:"12px 8px", background:C.white, border:`1px solid ${C.border}`, borderRadius:12, color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      🖼️ Imagen
                    </button>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:6 }}>
                    <StatCard val={rep.totalReservas} label="Asistieron" color={C.green} />
                    <StatCard val={rep.totalPersonas} label="Personas" color={C.wine} />
                  </div>
                  {rep.totalRegistradas && <div style={{ fontSize:10, color:C.muted, textAlign:"center", marginBottom:16, fontStyle:"italic" }}>De {rep.totalRegistradas} registradas esa semana</div>}

                  {[
                    {title:"Por categoría", content:<RoleBar reservaciones={rep.reservaciones}/>},
                    {title:"Por día", content:(
                      <div>{dias.map(fecha=>{
                        const d=rep.byDay[fecha],mx=Math.max(...Object.values(rep.byDay).map(x=>x.count));
                        return (
                          <div key={fecha} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                            <div style={{ minWidth:58, fontSize:11, color:C.muted }}>{f.date(fecha)}</div>
                            <div style={{ flex:1, background:C.faint, borderRadius:2, height:4, overflow:"hidden" }}>
                              <div style={{ width:`${(d.count/mx)*100}%`, background:`linear-gradient(90deg,${C.rose},${C.roseLt})`, height:"100%", borderRadius:2 }} />
                            </div>
                            <div style={{ minWidth:52, fontSize:10, color:C.muted, textAlign:"right" }}>{d.count}r · {d.personas}p</div>
                          </div>
                        );
                      })}</div>
                    )},
                    {title:"Detalle de asistentes", content:(
                      <div>{rep.reservaciones.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.nombre.localeCompare(b.nombre)).map(r=>{
                        const rc=RC[r.rol]||RC.rp;
                        return (
                          <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.faint}` }}>
                            <div style={{ fontSize:11, color:C.muted, minWidth:48 }}>{f.date(r.fecha)}</div>
                            <div style={{ flex:1, fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:C.cream }}>{r.nombre}</div>
                            <div style={{ fontSize:11, color:C.muted }}>👤{r.personas}</div>
                            <div style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:rc.bg, color:rc.text, border:`1px solid ${rc.border}` }}>{r.iniciales}</div>
                          </div>
                        );
                      })}</div>
                    )},
                  ].map(sec=>(
                    <div key={sec.title} style={{ background:C.white, borderRadius:14, padding:"16px", marginBottom:10, border:`1px solid ${C.border}`, boxShadow:"0 1px 4px #c4787a08" }}>
                      <Lbl>{sec.title}</Lbl>
                      {sec.content}
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
          )}
        </>
      )}

      {/* ── Bottom Nav ── */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.white, borderTop:`1px solid ${C.border}`, display:"flex", padding:"10px 0 22px", boxShadow:"0 -2px 12px #c4787a14" }}>
        {[{id:"lista",label:"Reservas",icon:"♪"},{id:"reportes",label:"Cortes",icon:"✦"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setView("list");if(t.id==="lista")setPinOk(false);}}
            style={{ flex:1, background:"none", border:"none", color:tab===t.id?C.rose:C.muted, fontSize:10, fontWeight:tab===t.id?700:400, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, letterSpacing:1.5, textTransform:"uppercase" }}>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontStyle:"italic" }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
