import { useState, useEffect, useRef } from "react";
import {
  subscribeReservaciones,
  subscribeReportes,
  saveReservacion,
  deleteReservacion,
  saveReporte,
  saveMapa,
  subscribeMapa,
  loginConRol,
  logoutRol,
} from "./firebase.js";

const ROLES = [
  { id: "socio", label: "Socio", color: "#c9a84c" },
  { id: "rp", label: "Team Canta", color: "#7c6fff" },
  { id: "team", label: "Operativo", color: "#4a9e6a" },
  { id: "instagram", label: "Instagram", color: "#e1306c" },
];

const ROLE_COLORS = {
  socio:     { bg: "#c9a84c22", border: "#c9a84c", text: "#c9a84c" },
  rp:        { bg: "#7c6fff22", border: "#7c6fff", text: "#7c6fff" },
  team:      { bg: "#4fc9a822", border: "#4fc9a8", text: "#4fc9a8" },
  instagram: { bg: "#e1306c22", border: "#e1306c", text: "#e1306c" },
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function getTodayLocal() {
  // Usar zona horaria de México (America/Mexico_City) para evitar desfase UTC
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Dom
  // Si es domingo, retroceder 6 días (al lunes anterior)
  // Si es cualquier otro día, retroceder al lunes de esta semana
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getWeekEnd(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  // Si es domingo, ese mismo día es el fin de semana
  // Si no, avanzar al próximo domingo
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function isSunday() {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/Mexico_City", weekday: "short" });
  return day === "Sun";
}

function weekLabel(s, e) { return `${formatDate(s)} – ${formatDate(e)}`; }

function StatCard({ val, label, color = "#c9a84c" }) {
  return (
    <div style={{ background: "#1e1210", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid #2a1818" }}>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{val}</div>
      <div style={{ fontSize: 11, color: "#9a7878", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RoleBar({ reservaciones }) {
  const total = reservaciones.length || 1;
  return (
    <div style={{ marginTop: 16 }}>
      {ROLES.map(role => {
        const items = reservaciones.filter(r => r.rol === role.id);
        const pct = Math.round((items.length / total) * 100);
        const personas = items.reduce((s, r) => s + r.personas, 0);
        if (items.length === 0) return null;
        return (
          <div key={role.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: role.color, fontWeight: 600 }}>{role.label}</span>
              <span style={{ color: "#a07878" }}>{items.length} reservas · {personas} personas</span>
            </div>
            <div style={{ background: "#2a1818", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, background: role.color, height: "100%", borderRadius: 4, transition: "width 0.6s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Agrupa registradas + no llegadas por iniciales (con fallback para reportes viejos)
function getByIniciales(rep) {
  if (rep.byIniciales) return rep.byIniciales;
  const m = {};
  const add = (r, llego) => {
    const ini = (r.iniciales || "?").toUpperCase();
    if (!m[ini]) m[ini] = { registradas: 0, llegaron: 0, noLlegaron: 0, personas: 0 };
    m[ini].registradas++;
    if (llego) { m[ini].llegaron++; m[ini].personas += r.personas; }
    else m[ini].noLlegaron++;
  };
  (rep.reservaciones || []).forEach(r => add(r, true));
  (rep.noLlegaron || []).forEach(r => add(r, false));
  return m;
}

function buildWhatsAppText(rep) {
  const roleEmoji = { socio: "🥂", rp: "💜", team: "🟢", instagram: "📸" };
  const SEP = "━━━━━━━━━━━━━━";
  const noLleg = rep.noLlegaron || [];
  const registradas = rep.totalRegistradas || rep.totalReservas;
  const pct = registradas > 0 ? Math.round((rep.totalReservas / registradas) * 100) : 100;
  const byIni = getByIniciales(rep);
  const L = [];

  // ── Encabezado ──
  L.push(`📊 *CORTE SEMANAL*`);
  L.push(`*${rep.label}*`);
  L.push(`_Generado el ${new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}_`);
  L.push("");

  // ── Resumen ──
  L.push(SEP);
  L.push(`*RESUMEN*`);
  L.push(`📝 Registradas: *${registradas}*`);
  L.push(`✅ Llegaron: *${rep.totalReservas}*  (${pct}%)`);
  if (registradas - rep.totalReservas > 0)
    L.push(`❌ No llegaron: *${registradas - rep.totalReservas}*`);
  L.push(`👥 Personas atendidas: *${rep.totalPersonas}*`);
  L.push("");

  // ── Por día ──
  L.push(SEP);
  L.push(`*POR DÍA*`);
  Object.keys(rep.byDay).sort().forEach(fecha => {
    const d = rep.byDay[fecha];
    L.push(`📅 ${formatDate(fecha)} — ${d.count} res · ${d.personas} pers`);
  });
  L.push("");

  // ── Por categoría ──
  L.push(SEP);
  L.push(`*POR CATEGORÍA*`);
  ROLES.forEach(role => {
    const d = rep.byRole[role.id];
    if (d && d.count > 0)
      L.push(`${roleEmoji[role.id]} ${role.label} — ${d.count} res · ${d.personas} pers`);
  });
  L.push("");

  // ── Por iniciales (A-Z) ──
  const iniciales = Object.keys(byIni).sort((a, b) => a.localeCompare(b));
  if (iniciales.length > 0) {
    L.push(SEP);
    L.push(`*POR INICIALES (A-Z)*`);
    L.push(`_registradas → llegaron / no llegaron_`);
    iniciales.forEach(ini => {
      const d = byIni[ini];
      const p = d.registradas > 0 ? Math.round((d.llegaron / d.registradas) * 100) : 0;
      const alerta = d.registradas >= 3 && p < 50 ? " ⚠️" : "";
      L.push(`• *${ini}*: ${d.registradas} reg → ✅${d.llegaron} / ❌${d.noLlegaron}  (${p}%)${alerta}`);
    });
    L.push("");
  }

  // ── Detalle de asistentes, agrupado por día ──
  L.push(SEP);
  L.push(`*DETALLE — SÍ LLEGARON* ✅`);
  const asistentes = [...rep.reservaciones].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  let diaActual = null;
  asistentes.forEach(r => {
    if (r.fecha !== diaActual) {
      diaActual = r.fecha;
      L.push("");
      L.push(`📅 *${formatDate(r.fecha)}*`);
    }
    const roleLabel = ROLES.find(x => x.id === r.rol)?.label || r.rol;
    L.push(`   ✅ ${r.nombre}${r.vip ? " ⭐" : ""} · 👤${r.personas} · ${r.iniciales} (${roleLabel})`);
  });
  L.push("");

  // ── Detalle de no llegadas ──
  if (noLleg.length > 0) {
    L.push(SEP);
    L.push(`*DETALLE — NO LLEGARON* ❌`);
    const perdidas = [...noLleg].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
    diaActual = null;
    perdidas.forEach(r => {
      if (r.fecha !== diaActual) {
        diaActual = r.fecha;
        L.push("");
        L.push(`📅 *${formatDate(r.fecha)}*`);
      }
      const roleLabel = ROLES.find(x => x.id === r.rol)?.label || r.rol;
      L.push(`   ❌ ${r.nombre}${r.vip ? " ⭐" : ""} · 👤${r.personas} · ${r.iniciales} (${roleLabel})`);
    });
    L.push("");
  }

  L.push(SEP);
  L.push(`_Canta Corazón Gto · Rvs_`);
  return L.join("\n");
}

// ── Mapa de mesas ─────────────────────────────────────────────
const MESA_COLORS = {
  libre:    { bg: "#1e1210", border: "#3a2020", text: "#9a7878" },
  ocupada:  { bg: "#5a1e1e", border: "#c94c4c", text: "#ff9999" },
  reservada:{ bg: "#1a2a10", border: "#4a9e6a", text: "#7efbaa" },
};
const SIZES = {
  SM:  { w: 50, h: 50, round: false },
  MD:  { w: 60, h: 46, round: false },
  LG:  { w: 84, h: 46, round: false },
  XL:  { w: 68, h: 62, round: false },
  SEC: { w: 54, h: 78, round: false },
  PER: { w: 36, h: 36, round: true  },
  DIA: { w: 54, h: 54, round: false, diamond: true },
};

function Mesa({ id, status, onToggle, size = "MD", canEdit = true, piso = 1, nombre }) {
  const c = MESA_COLORS[status] || MESA_COLORS.libre;
  const s = SIZES[size];
  const isDiamond = s.diamond;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: s.w + (isDiamond ? 10 : 0), height: (s.round ? s.w : s.h) + (isDiamond ? 10 : 0), flexShrink: 0 }}>
      <div onClick={() => canEdit && onToggle(id, piso)} style={{
        width: s.w, height: s.round ? s.w : s.h,
        borderRadius: s.round ? "50%" : isDiamond ? 10 : 10,
        transform: isDiamond ? "rotate(45deg)" : "none",
        background: c.bg, border: `2px solid ${c.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: canEdit ? "pointer" : "default",
        userSelect: "none", transition: "all 0.18s", flexShrink: 0,
        boxShadow: status !== "libre" ? `0 0 10px ${c.border}55` : "none",
      }}>
        <div style={{ transform: isDiamond ? "rotate(-45deg)" : "none", display: "flex", flexDirection: "column", alignItems: "center", maxWidth: s.w - 6 }}>
          <span style={{
            fontSize: nombre ? (s.round ? 8 : 10) : (s.round ? 9 : 11),
            fontWeight: 700, color: c.text, textAlign: "center", lineHeight: 1.1,
            display: "block",
          }}>{id}</span>
          {nombre && (
            <span style={{ fontSize: s.round ? 6 : 7, fontWeight: 600, color: "#f5c04c", maxWidth: s.w - 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", lineHeight: 1.2 }}>
              {nombre}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CuartoCapacidad({ id, label, data, onUpdate, canEdit }) {
  const pct = Math.round((data.personas / data.capacidad) * 100);
  const color = pct >= 90 ? "#c94c4c" : pct >= 60 ? "#c9a84c" : "#4a9e6a";
  const disponible = data.capacidad - data.personas;
  return (
    <div style={{ background: "#1e1210", borderRadius: 14, padding: "14px", border: `1px solid ${color}44`, flex: 1 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {/* Barra */}
      <div style={{ background: "#2a1818", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.4s" }} />
      </div>
      {/* Números */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>{pct}%</span>
          <span style={{ fontSize: 10, color: "#9a7878", marginLeft: 6 }}>lleno</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: disponible > 0 ? "#4a9e6a" : "#c94c4c", fontWeight: 600 }}>
            {disponible > 0 ? `Espacio para ~${disponible}` : "Lleno"}
          </div>
          <div style={{ fontSize: 10, color: "#9a7878" }}>{data.personas}/{data.capacidad} personas</div>
        </div>
      </div>
      {/* Controles */}
      {canEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          {[-8,-4,-1,"+1","+4","+8"].map((d,i) => {
            const delta = typeof d === "string" ? parseInt(d) : d;
            const label = typeof d === "string" ? d : String(d);
            return (
              <button key={i} onClick={() => onUpdate(id, delta)} style={{
                flex: 1, padding: "5px 0",
                background: delta > 0 ? "#1a2a10" : "#2a1010",
                border: `1px solid ${delta > 0 ? "#4a9e6a44" : "#c94c4c44"}`,
                color: delta > 0 ? "#4a9e6a" : "#c94c4c",
                borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>{label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapaMesas({ mesaStatusP1, mesaStatusP2, mesaNombres, cuartos, onToggle, onAsignar, onUpdateCuarto, onResetCuartos, canEdit, canAsignar, reservasFuturas, pisoActivo, setPisoActivo }) {
  const statusP1 = mesaStatusP1 || {};
  const statusP2 = mesaStatusP2 || {};
  const nombres = mesaNombres || {};

  // Modo asignar reserva a mesa (solo admin)
  const [asignando, setAsignando] = useState(false);
  const [mesaSel, setMesaSel] = useState(null); // { id, piso }
  const [nombreCustom, setNombreCustom] = useState("");

  const handleMesaClick = (id, piso) => {
    if (asignando && canAsignar) {
      setMesaSel({ id, piso });
      setNombreCustom("");
    } else {
      onToggle(id, piso);
    }
  };

  const countStatus = (status, obj) => Object.values(obj).filter(s => s === status).length;
  const libre1 = countStatus("libre", statusP1);
  const ocupada1 = countStatus("ocupada", statusP1);
  const reservada1 = countStatus("reservada", statusP1);
  const libre2 = countStatus("libre", statusP2);
  const ocupada2 = countStatus("ocupada", statusP2);
  const reservada2 = countStatus("reservada", statusP2);

  const m1 = (id, size) => <Mesa key={id} id={id} status={statusP1[id]} onToggle={handleMesaClick} size={size} canEdit={canEdit || (asignando && canAsignar)} piso={1} nombre={nombres[`1-${id}`]} />;
  const m2 = (id, size) => <Mesa key={id} id={id} status={statusP2[id]} onToggle={handleMesaClick} size={size || "DIA"} canEdit={canEdit || (asignando && canAsignar)} piso={2} nombre={nombres[`2-${id}`]} />;

  return (
    <div style={{ padding: "16px", paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, fontStyle: "italic", color: "#f5e8e0" }}>Mapa de Mesas</div>
        <div style={{ fontSize: 10, color: asignando ? "#c9a84c" : "#9a7878", letterSpacing: 1, marginTop: 2 }}>
          {asignando ? "📌 Toca una mesa para asignarle una reserva" : canEdit ? "Toca una mesa para cambiar su estado" : "Solo lectura"}
        </div>
      </div>
      <div style={{ height: 1, background: "linear-gradient(90deg, #c9a84c66, transparent)", marginBottom: 14, marginTop: 8 }} />

      {/* Modo asignar (solo admin) */}
      {canAsignar && (
        <button onClick={() => { setAsignando(a => !a); setMesaSel(null); }} style={{
          width: "100%", marginBottom: 14, padding: "12px", borderRadius: 12,
          border: `1.5px solid ${asignando ? "#c9a84c" : "#3a2020"}`,
          background: asignando ? "#c9a84c22" : "#1e1210",
          color: asignando ? "#c9a84c" : "#9a7878",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          {asignando ? "✓ Modo asignar activo — toca la mesa que quieres apartar" : "📌 Asignar reservas a mesas"}
        </button>
      )}

      {/* Selector de piso */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[1,2].map(p => (
          <button key={p} onClick={() => setPisoActivo(p)} style={{
            flex: 1, padding: "10px", borderRadius: 12,
            border: `1.5px solid ${pisoActivo === p ? "#c9a84c" : "#2a1818"}`,
            background: pisoActivo === p ? "#c9a84c18" : "#1e1210",
            color: pisoActivo === p ? "#c9a84c" : "#9a7878",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {p === 1 ? "🏠 Planta Baja" : "🏢 Segundo Piso"}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { status: "libre",     label: "Libre",     count: pisoActivo===1 ? libre1    : libre2    },
          { status: "ocupada",   label: "Ocupada",   count: pisoActivo===1 ? ocupada1  : ocupada2  },
          { status: "reservada", label: "Reservada", count: pisoActivo===1 ? reservada1: reservada2},
        ].map(s => {
          const c = MESA_COLORS[s.status];
          return (
            <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 6, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: "5px 12px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.border }} />
              <span style={{ fontSize: 11, color: c.text, fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{s.count}</span>
            </div>
          );
        })}
      </div>

      {/* ══════════ PLANTA BAJA ══════════ */}
      {pisoActivo === 1 && (
        <>
          {/* Salón Principal */}
          <div style={{ background: "#120808", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid #2a1818" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#c9a84c", textTransform: "uppercase", marginBottom: 12 }}>Salón Principal</div>

            {/* Fila 80 81 82 | 83 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              {m1(80,"MD")}{m1(81,"MD")}{m1(82,"MD")}
              <div style={{ flex: 1 }} />
              {m1(83,"XL")}
            </div>
            <div style={{ height: 1, background: "#2a1818", margin: "4px 0 10px" }} />

            {/* Fila P1 | 77 76 75 | 74 + P10 P9 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                {m1("P1","PER")}
                <span style={{ fontSize: 7, color: "#7a5050", letterSpacing: 1 }}>BARRA</span>
              </div>
              {m1(77,"MD")}{m1(76,"MD")}{m1(75,"LG")}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {m1(74,"XL")}
                {m1("P10","PER")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {m1("P9","PER")}
              </div>
            </div>
            <div style={{ height: 1, background: "#2a1818", margin: "4px 0 10px" }} />

            {/* Fila 70 71 72 | 73 + P8 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <div style={{ width: 36 }} />
              {m1(70,"MD")}{m1(71,"MD")}{m1(72,"LG")}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {m1(73,"XL")}
                <span style={{ fontSize: 7, color: "#7a5050", letterSpacing: 1 }}>BARRA</span>
              </div>
              {m1("P8","PER")}
            </div>
            <div style={{ height: 1, background: "#2a1818", margin: "4px 0 10px" }} />

            {/* Fila P2 | 66 65 64 | 63 + P7 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                {m1("P2","PER")}
                <span style={{ fontSize: 7, color: "#7a5050", letterSpacing: 1 }}>BARRA</span>
              </div>
              {m1(66,"MD")}{m1(65,"MD")}{m1(64,"LG")}
              <div style={{ flex: 1 }} />
              {m1(63,"XL")}
              {m1("P7","PER")}
            </div>
            <div style={{ height: 1, background: "#2a1818", margin: "4px 0 10px" }} />

            {/* Fila 60 61 62 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 36 }} />
              {m1(60,"LG")}{m1(61,"SM")}{m1(62,"LG")}
            </div>
          </div>

          {/* Pasillo periqueras P3-P6 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
            {["P3","P4","P5","P6"].map(id => m1(id,"PER"))}
          </div>

          {/* Cuartos con capacidad */}
          <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 10 }}>Cuartos · Ocupación</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <CuartoCapacidad id="mezcaleria" label="Mezcalería" data={cuartos.mezcaleria} onUpdate={onUpdateCuarto} canEdit={canEdit} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <CuartoCapacidad id="30s" label="30s" data={cuartos["30s"]} onUpdate={onUpdateCuarto} canEdit={canEdit} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <CuartoCapacidad id="40s" label="40s" data={cuartos["40s"]} onUpdate={onUpdateCuarto} canEdit={canEdit} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <CuartoCapacidad id="50s" label="50s" data={cuartos["50s"]} onUpdate={onUpdateCuarto} canEdit={canEdit} />
          </div>

          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onToggle("__reset__", 1)} style={{ flex: 1, background: "none", border: "1px solid #3a2020", color: "#9a7878", borderRadius: 10, padding: "8px", fontSize: 11, cursor: "pointer" }}>
                ↺ Liberar mesas salón
              </button>
              <button onClick={onResetCuartos} style={{ flex: 1, background: "none", border: "1px solid #3a2020", color: "#9a7878", borderRadius: 10, padding: "8px", fontSize: 11, cursor: "pointer" }}>
                ↺ Resetear cuartos
              </button>
            </div>
          )}
        </>
      )}

      {/* ══════════ SEGUNDO PISO ══════════ */}
      {pisoActivo === 2 && (
        <div style={{ background: "#120808", borderRadius: 14, padding: "14px", border: "1px solid #2a1818" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "#c9a84c", textTransform: "uppercase", marginBottom: 14 }}>Segundo Piso</div>

          {/* Fila top: 15 | Cabina | 10 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, justifyContent: "space-between" }}>
            {m2(15)}
            <div style={{ flex: 1, background: "#2a1818", borderRadius: 10, padding: "10px", textAlign: "center", margin: "0 8px" }}>
              <span style={{ fontSize: 11, color: "#9a7878", fontStyle: "italic" }}>🎵 Cabina</span>
            </div>
            {m2(10)}
          </div>

          {/* Laterales: 16-19 izquierda, 11-14 derecha, salón centro */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {/* Columna izquierda */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[16,17,18,19].map(id => m2(id))}
            </div>

            {/* Salón principal */}
            <div style={{ flex: 1, background: "#1a1018", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, border: "1px solid #2a1818" }}>
              <span style={{ fontSize: 11, color: "#555", fontStyle: "italic", textAlign: "center", lineHeight: 1.6 }}>Salón<br/>Principal</span>
            </div>

            {/* Columna derecha */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[11,12,13,14].map(id => m2(id))}
            </div>
          </div>

          {/* Fila bottom: 20 21 22 23 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginBottom: 10 }}>
            {[20,21,22,23].map(id => m2(id))}
          </div>

          {/* Entrada */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ background: "#1a1018", border: "1px solid #2a1818", borderRadius: 8, padding: "6px 14px" }}>
              <span style={{ fontSize: 10, color: "#555" }}>↑ Entrada</span>
            </div>
          </div>

          {canEdit && (
            <button onClick={() => onToggle("__reset__", 2)} style={{ marginTop: 12, width: "100%", background: "none", border: "1px solid #3a2020", color: "#9a7878", borderRadius: 10, padding: "8px", fontSize: 11, cursor: "pointer" }}>
              ↺ Liberar todas las mesas
            </button>
          )}
        </div>
      )}

      {/* ══════════ MODAL: ASIGNAR RESERVA A MESA ══════════ */}
      {mesaSel && (() => {
        const key = `${mesaSel.piso}-${mesaSel.id}`;
        const nombreActual = nombres[key];
        const asignar = (nombre) => { onAsignar(mesaSel.piso, mesaSel.id, nombre); setMesaSel(null); };
        return (
          <div onClick={() => setMesaSel(null)} style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#1a0a0a", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "78vh", overflowY: "auto", padding: "22px 18px 34px", border: "1px solid #3a2020", borderBottom: "none" }}>
              {/* Header modal */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: "#f5e8e0" }}>
                  Mesa {mesaSel.id} · {mesaSel.piso === 1 ? "Planta Baja" : "2do Piso"}
                </div>
                <button onClick={() => setMesaSel(null)} style={{ background: "none", border: "none", color: "#9a7878", fontSize: 20, cursor: "pointer", padding: 4 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: "#9a7878", marginBottom: 16 }}>Elige la reserva a la que le guardas esta mesa</div>

              {/* Asignación actual */}
              {nombreActual && (
                <div style={{ background: "#2a2010", border: "1px solid #c9a84c55", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>📌</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "#9a7878", textTransform: "uppercase", letterSpacing: 1 }}>Apartada para</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f5c04c" }}>{nombreActual}</div>
                  </div>
                  <button onClick={() => asignar(null)} style={{ background: "#2a1010", border: "1px solid #c94c4c66", color: "#ff9999", borderRadius: 9, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Liberar
                  </button>
                </div>
              )}

              {/* Nombre libre */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <input value={nombreCustom} onChange={e => setNombreCustom(e.target.value)} placeholder="Escribir nombre..."
                  style={{ flex: 1, background: "#1e1210", border: "1px solid #3a2020", borderRadius: 10, padding: "11px 14px", color: "#f5e8e0", fontSize: 14, outline: "none", boxSizing: "border-box", minWidth: 0 }} />
                <button onClick={() => nombreCustom.trim() && asignar(nombreCustom.trim())} disabled={!nombreCustom.trim()}
                  style={{ background: nombreCustom.trim() ? "#c9a84c" : "#3a3020", color: "#1a0a0a", border: "none", borderRadius: 10, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: nombreCustom.trim() ? "pointer" : "not-allowed" }}>
                  Apartar
                </button>
              </div>

              {/* Lista de reservas próximas */}
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#9a7878", textTransform: "uppercase", marginBottom: 10 }}>O elige de las reservas registradas</div>
              {(reservasFuturas || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "#7a5050", fontStyle: "italic", padding: "10px 0" }}>No hay reservas próximas registradas</div>
              ) : (
                (reservasFuturas || []).map(r => {
                  const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                  return (
                    <div key={r.id} onClick={() => asignar(r.nombre)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", marginBottom: 7, background: r.vip ? "#241c0c" : "#1e1210", border: `1px solid ${r.vip ? "#c9a84c66" : "#2a1818"}`, borderRadius: 12, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: r.vip ? "#f5c04c" : "#f5e8e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.vip ? "⭐ " : ""}{r.nombre}
                        </div>
                        <div style={{ fontSize: 10, color: "#9a7878", marginTop: 2 }}>{formatDate(r.fecha)} · 👤{r.personas} · {r.iniciales}</div>
                      </div>
                      <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, whiteSpace: "nowrap" }}>
                        {ROLES.find(x => x.id === r.rol)?.label}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}


export default function App() {
  const [view, setView] = useState("list");
  const [reservaciones, setReservaciones] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [filterRole, setFilterRole] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedReporte, setSelectedReporte] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("lista");
  const [copied, setCopied] = useState(false);

  // ── Estado de mesas (Firebase tiempo real) ───────────────────
  const MESAS_P1_DEFAULT = [
    80,81,82,83,77,76,75,74,73,72,71,70,66,65,64,63,62,61,60,
    "P1","P2","P3","P4","P5","P6","P7","P8","P9","P10",
  ].reduce((acc, id) => ({ ...acc, [id]: "libre" }), {});

  const MESAS_P2_DEFAULT = [
    10,11,12,13,14,15,16,17,18,19,20,21,22,23
  ].reduce((acc, id) => ({ ...acc, [id]: "libre" }), {});

  const CUARTOS_DEFAULT = {
    mezcaleria: { personas: 0, capacidad: 20 },
    "30s":      { personas: 0, capacidad: 20 },
    "40s":      { personas: 0, capacidad: 24 },
    "50s":      { personas: 0, capacidad: 32 },
  };

  const [mesaStatusP1, setMesaStatusP1] = useState(MESAS_P1_DEFAULT);
  const [mesaStatusP2, setMesaStatusP2] = useState(MESAS_P2_DEFAULT);
  const [mesaNombres, setMesaNombres]   = useState({});
  const [cuartos, setCuartos]           = useState(CUARTOS_DEFAULT);
  const [pisoActivo, setPisoActivo]     = useState(1);

  // Debounce refs para no escribir en Firebase en cada render
  const debounceP1  = useRef(null);
  const debounceP2  = useRef(null);
  const debounceCu  = useRef(null);

  // Suscribir a cambios del mapa en tiempo real
  useEffect(() => {
    const u1 = subscribeMapa("p1", data => { if (data) setMesaStatusP1(data); });
    const u2 = subscribeMapa("p2", data => { if (data) setMesaStatusP2(data); });
    const u3 = subscribeMapa("cuartos", data => { if (data) setCuartos(data); });
    const u4 = subscribeMapa("nombres", data => { if (data) setMesaNombres(data); });
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // Asignar/liberar una mesa con el nombre de una reserva (admin)
  const asignarMesa = (piso, id, nombre) => {
    const key = `${piso}-${id}`;
    setMesaNombres(prev => {
      const updated = { ...prev };
      if (nombre) updated[key] = nombre;
      else delete updated[key];
      saveMapa("nombres", updated).catch(() => {});
      return updated;
    });
    // Al asignar pasa a "reservada"; al liberar vuelve a "libre"
    const setter = piso === 1 ? setMesaStatusP1 : setMesaStatusP2;
    const tipo   = piso === 1 ? "p1" : "p2";
    setter(prev => {
      const updated = { ...prev, [id]: nombre ? "reservada" : "libre" };
      saveMapa(tipo, updated).catch(() => {});
      return updated;
    });
    showToast(nombre ? `📌 Mesa ${id} apartada para ${nombre}` : `Mesa ${id} liberada`);
  };

  const toggleMesa = (id, piso = 1) => {
    if (id === "__reset__") {
      if (piso === 1) {
        setMesaStatusP1(MESAS_P1_DEFAULT);
        saveMapa("p1", MESAS_P1_DEFAULT).catch(() => {});
      } else {
        setMesaStatusP2(MESAS_P2_DEFAULT);
        saveMapa("p2", MESAS_P2_DEFAULT).catch(() => {});
      }
      // También limpia los nombres de ese piso
      setMesaNombres(prev => {
        const updated = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${piso}-`)));
        saveMapa("nombres", updated).catch(() => {});
        return updated;
      });
      return;
    }
    if (piso === 1) {
      setMesaStatusP1(prev => {
        const states = ["libre","ocupada","reservada"];
        const next = states[(states.indexOf(prev[id])+1) % states.length];
        const updated = { ...prev, [id]: next };
        clearTimeout(debounceP1.current);
        debounceP1.current = setTimeout(() => saveMapa("p1", updated).catch(()=>{}), 400);
        return updated;
      });
    } else {
      setMesaStatusP2(prev => {
        const states = ["libre","ocupada","reservada"];
        const next = states[(states.indexOf(prev[id])+1) % states.length];
        const updated = { ...prev, [id]: next };
        clearTimeout(debounceP2.current);
        debounceP2.current = setTimeout(() => saveMapa("p2", updated).catch(()=>{}), 400);
        return updated;
      });
    }
  };

  const updateCuarto = (id, delta) => {
    setCuartos(prev => {
      const c = prev[id];
      const newP = Math.max(0, Math.min(c.capacidad, c.personas + delta));
      const updated = { ...prev, [id]: { ...c, personas: newP } };
      clearTimeout(debounceCu.current);
      debounceCu.current = setTimeout(() => saveMapa("cuartos", updated).catch(()=>{}), 400);
      return updated;
    });
  };

  const resetCuartos = () => {
    setCuartos(CUARTOS_DEFAULT);
    saveMapa("cuartos", CUARTOS_DEFAULT).catch(() => {});
  };

  // ── Sistema de perfiles ───────────────────────────────────────
  const [perfil, setPerfil] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  const PERFILES = { "1029": "staff", "2938": "supervisor", "3847": "admin" };
  const puede = {
    agregarReserva:  perfil !== null,
    eliminarPropia:  perfil !== null,
    eliminarAjena:   perfil === "supervisor" || perfil === "admin",
    checkAsistencia: perfil === "supervisor" || perfil === "admin",
    verReportes:     perfil === "supervisor" || perfil === "admin",
    verDashboard:    perfil === "admin",
    generarCorte:    perfil === "admin",
    marcarVip:       perfil === "admin",
    asignarMesa:     perfil === "admin",
  };
  const PERFIL_LABEL = { staff: "👤 Staff", supervisor: "👥 Supervisor", admin: "👑 Admin" };
  const PERFIL_COLOR = { staff: "#c9a84c", supervisor: "#7c6fff", admin: "#e1306c" };

  const [form, setForm] = useState({ fecha: getTodayLocal(), nombre: "", personas: "", iniciales: "", rol: "", vip: false });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setLoading(true);
    let loaded = { r: false, rep: false };
    const check = () => { if (loaded.r && loaded.rep) setLoading(false); };
    const unsubR = subscribeReservaciones(data => { setReservaciones(data); loaded.r = true; check(); });
    const unsubRep = subscribeReportes(data => { setReportes(data); loaded.rep = true; check(); });
    return () => { unsubR(); unsubRep(); };
  }, []);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Toggle llegó ─────────────────────────────────────────────
  function isCheckBlocked(r) {
    return false;
  }

  async function toggleLlego(r) {
    if (!puede.checkAsistencia) {
      showToast("No tienes permiso para marcar asistencia", "error");
      return;
    }
    if (isCheckBlocked(r)) {
      showToast("No se puede modificar después de las 10am del día siguiente", "error");
      return;
    }
    const updated = { ...r, llego: !r.llego };
    try {
      await saveReservacion(updated);
    } catch {
      showToast("Error al actualizar", "error");
    }
  }

  // ── Form ─────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.fecha) e.fecha = "Requerido";
    if (!form.nombre.trim()) e.nombre = "Requerido";
    if (!form.personas || isNaN(form.personas) || parseInt(form.personas) < 1) e.personas = "Numero valido";
    if (!form.iniciales.trim()) e.iniciales = "Requerido";
    if (!form.rol) e.rol = "Selecciona una opcion";
    const nombreNorm = form.nombre.trim().toLowerCase();
    const duplicado = reservaciones.find(r => r.nombre.toLowerCase() === nombreNorm && r.fecha === form.fecha);
    if (duplicado) e.nombre = `"${duplicado.nombre}" ya esta en la lista para ese dia`;
    return e;
  }

  async function handlePinSubmit() {
    const p = PERFILES[pinInput];
    if (!p) {
      setPinError(true);
      setPinInput("");
      return;
    }
    setPinLoading(true);
    try {
      await loginConRol(p);
      setPerfil(p);
      setPinError(false);
    } catch {
      setPinError(true);
    } finally {
      setPinLoading(false);
      setPinInput("");
    }
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const nueva = {
      id: Date.now().toString(),
      fecha: form.fecha,
      nombre: form.nombre.trim(),
      personas: parseInt(form.personas),
      iniciales: form.iniciales.trim().toUpperCase(),
      rol: form.rol,
      llego: false,
      vip: puede.marcarVip && form.vip === true,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveReservacion(nueva);
      setForm({ fecha: getTodayLocal(), nombre: "", personas: "", iniciales: "", rol: "", vip: false });
      setErrors({});
      setView("list");
      showToast(nueva.vip ? "⭐ Reservación VIP guardada ✓" : "Reservación guardada ✓");
    } catch {
      showToast("Error al guardar", "error");
    }
    setSaving(false);
  }

  // ── Marcar/quitar VIP (solo admin) ───────────────────────────
  async function toggleVip(r) {
    if (!puede.marcarVip) {
      showToast("Solo el administrador puede marcar VIP", "error");
      return;
    }
    const updated = { ...r, vip: !r.vip };
    try {
      await saveReservacion(updated);
      setSelected(updated);
      showToast(updated.vip ? "⭐ Marcada como VIP" : "VIP quitado");
    } catch {
      showToast("Error al actualizar", "error");
    }
  }

  async function handleDelete(id, creadoPor) {
    const esPropia = creadoPor === form.iniciales.trim().toUpperCase() || creadoPor === undefined;
    if (!puede.eliminarAjena && !esPropia) {
      showToast("Solo puedes eliminar tus propias reservas", "error");
      return;
    }
    if (!puede.eliminarPropia) {
      showToast("No tienes permiso para eliminar reservas", "error");
      return;
    }
    try {
      await deleteReservacion(id);
      setSelected(null);
      setView("list");
      showToast("Eliminada", "error");
    } catch {
      showToast("Error al eliminar", "error");
    }
  }

  // ── Corte semanal — solo las que llegaron ────────────────────
  async function generarCorte() {
    if (!isSunday()) {
      showToast("El corte solo se puede generar los domingos", "error");
      return;
    }
    await ejecutarCorte(getTodayLocal());
  }

  // Genera corte para cualquier semana que tenga reservas sin corte
  async function generarCorteManual(semanaStart, semanaEnd) {
    setGenerando(true);
    await ejecutarCorte(semanaEnd);
    setGenerando(false);
  }

  async function ejecutarCorte(fechaRef) {
    setGenerando(true);
    const semanaStart = getWeekStart(fechaRef);
    const semanaEnd   = getWeekEnd(fechaRef);

    const deEstaSemana = reservaciones.filter(r => r.fecha >= semanaStart && r.fecha <= semanaEnd);
    const llegaron = deEstaSemana.filter(r => r.llego === true || r.llego === "true");

    if (deEstaSemana.length === 0) {
      showToast(`Sin reservas entre ${semanaStart} y ${semanaEnd}`, "error");
      setGenerando(false);
      return;
    }

    if (llegaron.length === 0) {
      showToast(`${deEstaSemana.length} reservas encontradas pero ninguna palomeada`, "error");
      setGenerando(false);
      return;
    }

    const yaExiste = reportes.find(rep => rep.semanaStart === semanaStart);
    if (yaExiste) {
      showToast("Ya existe un reporte para esta semana", "error");
      setGenerando(false);
      return;
    }

    const byRole = {};
    ROLES.forEach(r => {
      const items = llegaron.filter(res => res.rol === r.id);
      byRole[r.id] = { count: items.length, personas: items.reduce((s, x) => s + x.personas, 0), reservaciones: items };
    });

    const byDay = {};
    llegaron.forEach(r => {
      if (!byDay[r.fecha]) byDay[r.fecha] = { count: 0, personas: 0 };
      byDay[r.fecha].count++;
      byDay[r.fecha].personas += r.personas;
    });

    // Reservas que NO llegaron (para medir fantasmas)
    const noLlegaron = deEstaSemana.filter(r => !(r.llego === true || r.llego === "true"));

    // Desglose por iniciales: registradas vs llegaron vs no llegaron
    const byIniciales = {};
    deEstaSemana.forEach(r => {
      const ini = (r.iniciales || "?").toUpperCase();
      if (!byIniciales[ini]) byIniciales[ini] = { registradas: 0, llegaron: 0, noLlegaron: 0, personas: 0 };
      byIniciales[ini].registradas++;
      if (r.llego === true || r.llego === "true") {
        byIniciales[ini].llegaron++;
        byIniciales[ini].personas += r.personas;
      } else {
        byIniciales[ini].noLlegaron++;
      }
    });

    const reporte = {
      id: Date.now().toString(),
      semanaStart,
      semanaEnd,
      label: weekLabel(semanaStart, semanaEnd),
      totalReservas: llegaron.length,
      totalPersonas: llegaron.reduce((s, r) => s + r.personas, 0),
      totalRegistradas: deEstaSemana.length,
      byRole,
      byDay,
      byIniciales,
      reservaciones: llegaron,
      noLlegaron,
      generadoEl: new Date().toISOString(),
    };

    try {
      await saveReporte(reporte);
      await Promise.all(deEstaSemana.map(r => deleteReservacion(r.id)));
      setSelectedReporte(reporte);
      setTab("reportes");
      setView("reporte_detalle");
      showToast("Corte semanal generado ✓");
    } catch {
      showToast("Error al generar corte", "error");
    }
    setGenerando(false);
  } // fin ejecutarCorte

  // ── Export ────────────────────────────────────────────────────
  async function handleCopyText(rep) {
    const text = buildWhatsAppText(rep);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast("Texto copiado — pégalo en WhatsApp ✓");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copia este texto:", text);
    }
  }

  // ── Exportar reporte a Excel (.xlsx) ─────────────────────────
  async function handleDownloadExcel(rep) {
    try {
      showToast("Generando Excel...");
      const XLSX = await import(/* @vite-ignore */ "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");

      const registradas = rep.totalRegistradas || rep.totalReservas;
      const noLleg = rep.noLlegaron || [];
      const pct = registradas > 0 ? Math.round((rep.totalReservas / registradas) * 100) : 100;
      const roleName = id => ROLES.find(x => x.id === id)?.label || id;
      const wb = XLSX.utils.book_new();

      // ── Hoja 1: Resumen ──
      const resumen = [
        ["CANTA CORAZÓN GTO · CORTE SEMANAL"],
        ["Semana", rep.label],
        ["Generado", new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })],
        [],
        ["RESUMEN"],
        ["Reservas registradas", registradas],
        ["Llegaron", rep.totalReservas],
        ["No llegaron", registradas - rep.totalReservas],
        ["% Asistencia", pct + "%"],
        ["Personas atendidas", rep.totalPersonas],
        [],
        ["POR DÍA"],
        ["Fecha", "Reservas", "Personas"],
        ...Object.keys(rep.byDay).sort().map(f => [formatDate(f), rep.byDay[f].count, rep.byDay[f].personas]),
        [],
        ["POR CATEGORÍA"],
        ["Categoría", "Reservas", "Personas"],
        ...ROLES.filter(r => rep.byRole[r.id] && rep.byRole[r.id].count > 0)
          .map(r => [r.label, rep.byRole[r.id].count, rep.byRole[r.id].personas]),
      ];
      const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
      wsResumen["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      // ── Hoja 2: Por iniciales (A-Z) ──
      const byIni = getByIniciales(rep);
      const filasIni = Object.keys(byIni).sort((a, b) => a.localeCompare(b)).map(ini => {
        const d = byIni[ini];
        const p = d.registradas > 0 ? Math.round((d.llegaron / d.registradas) * 100) : 0;
        return [ini, d.registradas, d.llegaron, d.noLlegaron, p + "%", d.registradas >= 3 && p < 50 ? "⚠️ Revisar" : ""];
      });
      const wsIni = XLSX.utils.aoa_to_sheet([
        ["Iniciales", "Registradas", "Llegaron", "No llegaron", "% Asistencia", "Alerta"],
        ...filasIni,
      ]);
      wsIni["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsIni, "Por iniciales");

      // ── Hoja 3: Sí llegaron ──
      const llegaronRows = [...rep.reservaciones]
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))
        .map(r => [formatDate(r.fecha), r.nombre, r.personas, r.iniciales, roleName(r.rol), r.vip ? "⭐ VIP" : ""]);
      const wsLleg = XLSX.utils.aoa_to_sheet([
        ["Fecha", "Nombre", "Personas", "Registró", "Categoría", "VIP"],
        ...llegaronRows,
      ]);
      wsLleg["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 9 }, { wch: 9 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsLleg, "Sí llegaron");

      // ── Hoja 4: No llegaron ──
      if (noLleg.length > 0) {
        const noLlegRows = [...noLleg]
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))
          .map(r => [formatDate(r.fecha), r.nombre, r.personas, r.iniciales, roleName(r.rol), r.vip ? "⭐ VIP" : ""]);
        const wsNo = XLSX.utils.aoa_to_sheet([
          ["Fecha", "Nombre", "Personas", "Registró", "Categoría", "VIP"],
          ...noLlegRows,
        ]);
        wsNo["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 9 }, { wch: 9 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsNo, "No llegaron");
      }

      XLSX.writeFile(wb, `corte-${rep.semanaStart}.xlsx`);
      showToast("Excel descargado ✓");
    } catch (e) {
      console.error(e);
      showToast("Error al generar Excel — revisa tu conexión", "error");
    }
  }

  async function handleShareImage(rep) {
    try {
      const canvas = document.createElement("canvas");
      const dpr = 2;
      const W = 640;
      const roleLines = ROLES.filter(role => rep.byRole[role.id]?.count > 0);
      const dayLines = Object.keys(rep.byDay).sort();
      const detailLines = rep.reservaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
      const totalH = 420 + (roleLines.length * 32) + (dayLines.length * 28) + (detailLines.length * 26) + 80;
      canvas.width = W * dpr;
      canvas.height = totalH * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      ctx.fillStyle = "#1a0a0a"; ctx.fillRect(0, 0, W, totalH);
      ctx.fillStyle = "#c9a84c"; ctx.fillRect(0, 0, W, 5);

      let y = 36;
      ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
      ctx.fillText("CANTA CORAZÓN GTO · CORTE SEMANAL", 32, y); y += 24;
      ctx.fillStyle = "#f5e8e0"; ctx.font = "bold 26px serif";
      ctx.fillText(rep.label, 32, y); y += 18;
      ctx.fillStyle = "#444"; ctx.font = "11px sans-serif";
      ctx.fillText("Generado el " + new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }), 32, y); y += 32;

      ctx.strokeStyle = "#2a1818"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke(); y += 22;

      ctx.fillStyle = "#c9a84c"; ctx.font = "bold 32px sans-serif";
      ctx.fillText(rep.totalReservas, 32, y);
      ctx.fillText(rep.totalPersonas, 200, y);
      ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
      ctx.fillText("asistieron", 32, y + 16);
      ctx.fillText("personas", 200, y + 16);
      y += 46;

      ctx.fillStyle = "#555"; ctx.font = "10px sans-serif";
      ctx.fillText("POR CATEGORÍA", 32, y); y += 18;
      const roleColors = { socio: "#c9a84c", rp: "#7c6fff", team: "#4fc9a8", instagram: "#e1306c" };
      roleLines.forEach(role => {
        const d = rep.byRole[role.id];
        ctx.fillStyle = roleColors[role.id] || "#888"; ctx.font = "bold 13px sans-serif";
        ctx.fillText(role.label, 32, y);
        ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
        ctx.fillText(`${d.count} reservas · ${d.personas} personas`, 160, y);
        const barX = 32, barY = y + 5, barW = W - 64, barH = 5;
        ctx.fillStyle = "#2a1818"; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
        ctx.fillStyle = roleColors[role.id] || "#888"; ctx.beginPath(); ctx.roundRect(barX, barY, barW * (d.count / rep.totalReservas), barH, 3); ctx.fill();
        y += 32;
      });
      y += 8;

      ctx.fillStyle = "#555"; ctx.font = "10px sans-serif";
      ctx.fillText("POR DÍA", 32, y); y += 18;
      const maxCount = Math.max(...dayLines.map(f => rep.byDay[f].count));
      dayLines.forEach(fecha => {
        const d = rep.byDay[fecha];
        ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
        ctx.fillText(formatDate(fecha), 32, y);
        const barX = 100, barW = W - 230, barH = 6, barY = y - 10;
        ctx.fillStyle = "#2a1818"; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
        ctx.fillStyle = "#c9a84c"; ctx.beginPath(); ctx.roundRect(barX, barY, barW * (d.count / maxCount), barH, 3); ctx.fill();
        ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
        ctx.fillText(`${d.count} res · ${d.personas} p`, barX + barW + 10, y);
        y += 28;
      });
      y += 8;

      ctx.strokeStyle = "#2a1818"; ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke(); y += 18;
      ctx.fillStyle = "#555"; ctx.font = "10px sans-serif";
      ctx.fillText("DETALLE DE RESERVAS", 32, y); y += 20;
      detailLines.forEach(r => {
        ctx.fillStyle = "#888"; ctx.font = "11px sans-serif"; ctx.fillText(formatDate(r.fecha), 32, y);
        ctx.fillStyle = "#f5e8e0"; ctx.font = "12px sans-serif";
        ctx.fillText(r.nombre.length > 22 ? r.nombre.slice(0, 22) + "…" : r.nombre, 90, y);
        ctx.fillStyle = "#666"; ctx.font = "11px sans-serif"; ctx.fillText(`👤${r.personas}`, 340, y);
        ctx.fillStyle = roleColors[r.rol] || "#888"; ctx.font = "bold 11px sans-serif"; ctx.fillText(r.iniciales, 380, y);
        ctx.fillStyle = "#333"; ctx.font = "10px sans-serif"; ctx.fillText(ROLES.find(x => x.id === r.rol)?.label || "", 420, y);
        y += 26;
      });

      y += 10;
      ctx.strokeStyle = "#c9a84c44"; ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke(); y += 16;
      ctx.fillStyle = "#333"; ctx.font = "10px sans-serif"; ctx.fillText("Canta Corazón Gto · Rvs", 32, y);

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `corte-${rep.semanaStart}.png`; a.click();
        URL.revokeObjectURL(url);
        showToast("Imagen descargada ✓");
      }, "image/png");
    } catch { showToast("No se pudo generar la imagen", "error"); }
  }

  // ── Agrupar por día, orden alfa ───────────────────────────────
  const filteredBase = reservaciones
    .filter(r => filterRole === "all" || r.rol === filterRole)
    .filter(r => !filterDate || r.fecha === filterDate);

  const groupedByDay = filteredBase
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))
    .reduce((acc, r) => {
      if (!acc[r.fecha]) acc[r.fecha] = [];
      acc[r.fecha].push(r);
      return acc;
    }, {});

  const sortedDays = Object.keys(groupedByDay).sort();
  const totalFiltered = filteredBase.length;
  const totalPersonas = filteredBase.reduce((s, r) => s + r.personas, 0);
  const llegaron = filteredBase.filter(r => r.llego).length;
  const esSabado = isSunday();

  // ── Dashboard en tiempo real ──────────────────────────────────
  const hoy = getTodayLocal();
  const semanaStart = getWeekStart(hoy);
  const semanaEnd   = getWeekEnd(hoy);
  const semanaLabel = `${formatDate(semanaStart)} – ${formatDate(semanaEnd)}`;

  const semanaActual  = reservaciones.filter(r => r.fecha >= semanaStart && r.fecha <= semanaEnd);
  const semanaLlegaron = semanaActual.filter(r => r.llego === true);

  const dashByRole = ROLES.map(role => {
    const total   = semanaActual.filter(r => r.rol === role.id);
    const llegaron = total.filter(r => r.llego === true);
    return { ...role, total: total.length, llegaron: llegaron.length, personas: llegaron.reduce((s,r)=>s+r.personas,0) };
  });

  const dashByDay = (() => {
    const days = {};
    semanaActual.forEach(r => {
      if (!days[r.fecha]) days[r.fecha] = { total: 0, llegaron: 0, personas: 0 };
      days[r.fecha].total++;
      if (r.llego === true) { days[r.fecha].llegaron++; days[r.fecha].personas += r.personas; }
    });
    return days;
  })();

  // ── Login gate ───────────────────────────────────────────────
  if (!perfil) {
    return (
      <div style={{ minHeight: "100vh", background: "#d4a0a0", fontFamily: "'DM Sans', sans-serif", color: "#3d1010", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@1,700&display=swap" rel="stylesheet" />
        {/* Logo */}
        <div style={{ marginBottom: 32, width: "100%", maxWidth: 320, textAlign: "center" }}>
          <img src="https://cantacorazon.com/assets/images/logo-canta-corazn.png" alt="Canta Corazón" style={{ height: 64, objectFit: "contain" }} />
          <div style={{ fontSize: 9, letterSpacing: 3, color: "#5a1e1e", textTransform: "uppercase", marginTop: 8 }}>Guanajuato · Reservaciones</div>
        </div>

        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontStyle: "italic", color: "#3d1010", marginBottom: 6, textAlign: "center" }}>Bienvenidos</div>
        <div style={{ fontSize: 12, color: "#7a3030", marginBottom: 32, textAlign: "center" }}>Ingresa tu PIN para continuar</div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: pinInput.length > i ? "#7a3030" : "#b87878", border: `1px solid ${pinInput.length > i ? "#7a3030" : "#c08080"}`, transition: "background 0.15s" }} />
          ))}
        </div>

        <input
          type="password" inputMode="numeric" maxLength={4} value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g,"")); setPinError(false); }}
          onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
          placeholder="••••"
          style={{ width: "100%", maxWidth: 240, textAlign: "center", background: "#c98e8e", border: `1px solid ${pinError ? "#8b1a1a" : "#b87878"}`, borderRadius: 12, padding: "14px", color: "#3d1010", fontSize: 24, letterSpacing: 10, outline: "none", marginBottom: 8 }}
        />
        {pinError && <div style={{ color: "#5a1e1e", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>PIN incorrecto</div>}

        <button onClick={handlePinSubmit} disabled={pinLoading}
          style={{ marginTop: 8, width: "100%", maxWidth: 240, padding: "13px", background: "#7a3030", color: "#fdf0f0", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: pinLoading ? "default" : "pointer", boxShadow: "0 2px 10px #7a303044", opacity: pinLoading ? 0.7 : 1 }}>
          {pinLoading ? "Entrando..." : "Entrar"}
        </button>

        {/* Perfiles hint */}
        <div style={{ marginTop: 40, display: "flex", gap: 16, opacity: 0.5 }}>
          {["Staff","Supervisor","Admin"].map(p => (
            <div key={p} style={{ fontSize: 10, color: "#5a1e1e", letterSpacing: 1, textTransform: "uppercase" }}>{p}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1a0a0a", fontFamily: "'DM Sans', sans-serif", color: "#f5e8e0", paddingBottom: 88 }}>

      {/* ── Header con logo + botón nueva reserva ── */}
      <div style={{ background: "#d4a0a0", borderBottom: "1px solid #b87878" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 10px" }}>
          <img
            src="https://cantacorazon.com/assets/images/logo-canta-corazn.png"
            alt="Canta Corazón"
            style={{ height: 48, width: "auto", objectFit: "contain" }}
          />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#7a3030", textTransform: "uppercase", lineHeight: 1.6 }}>
              Guanajuato · Rvs
            </div>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: PERFIL_COLOR[perfil], background: PERFIL_COLOR[perfil] + "22", border: "1px solid " + PERFIL_COLOR[perfil] + "66", borderRadius: 20, padding: "2px 10px" }}>
                {PERFIL_LABEL[perfil]}
              </div>
              <button onClick={() => { logoutRol().catch(() => {}); setPerfil(null); setPinInput(""); }} style={{ background: "none", border: "none", fontSize: 10, color: "#9a7878", cursor: "pointer", padding: 0 }}>Salir</button>
            </div>
          </div>
        </div>

        {/* Botón nueva reserva — solo en tab lista, vista list */}
        {tab === "lista" && view === "list" && (
          <div style={{ padding: "10px 20px 16px" }}>
            <button
              onClick={() => { setView("form"); setErrors({}); }}
              style={{
                width: "100%", padding: "13px",
                background: "#7a3030", color: "#fdf0f0",
                border: "none", borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                letterSpacing: 0.5,
                boxShadow: "0 2px 8px #7a303044",
              }}>
              + Nueva Reservación
            </button>
          </div>
        )}

        {/* Línea decorativa inferior */}
        <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #b87878, transparent)" }} />
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 76, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#3d1a1a" : "#1a3d2a", border: `1px solid ${toast.type === "error" ? "#c94c4c" : "#4cc97c"}`, color: toast.type === "error" ? "#f88" : "#7efbaa", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 500, zIndex: 200, whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>
      )}

      {/* ── TAB LISTA ── */}
      {tab === "lista" && (
        <>
          {view === "list" && (
            <div style={{ padding: "18px 16px" }}>

              {/* Banner sábado */}
              {esSabado && puede.generarCorte && (
                <div style={{ background: "linear-gradient(135deg, #c9a84c22, #7c6fff22)", border: "1px solid #c9a84c55", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 26 }}>📊</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#c9a84c" }}>¡Es domingo!</div>
                    <div style={{ fontSize: 12, color: "#b08080", marginTop: 2 }}>Día de corte semanal</div>
                  </div>
                  <button onClick={generarCorte} disabled={generando} style={{ background: "#c9a84c", color: "#1a0a0a", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: generando ? "not-allowed" : "pointer" }}>
                    {generando ? "..." : "Corte"}
                  </button>
                </div>
              )}

              {/* Filtros por día */}
              {(() => {
                const todosLosDias = [...new Set(reservaciones.map(r => r.fecha))].sort();
                const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
                return todosLosDias.length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, color: "#8a6868", textTransform: "uppercase", marginBottom: 8 }}>Día</div>
                    <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
                      <button
                        onClick={() => setFilterDate("")}
                        style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 12, border: "1px solid", borderColor: !filterDate ? "#c9a84c" : "#3a2020", background: !filterDate ? "#c9a84c22" : "#1e1210", color: !filterDate ? "#c9a84c" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Todos
                      </button>
                      {todosLosDias.map(fecha => {
                        const d = new Date(fecha + "T12:00:00");
                        const count = reservaciones.filter(r => r.fecha === fecha).length;
                        const active = filterDate === fecha;
                        return (
                          <button key={fecha} onClick={() => setFilterDate(active ? "" : fecha)}
                            style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 12, border: "1px solid", borderColor: active ? "#c9a84c" : "#3a2020", background: active ? "#c9a84c22" : "#1e1210", color: active ? "#c9a84c" : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <span style={{ fontSize: 11, color: active ? "#c9a84c" : "#555" }}>{DIAS_CORTO[d.getDay()]}</span>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{d.getDate()}</span>
                            <span style={{ fontSize: 9, color: active ? "#c9a84c88" : "#333" }}>{count} res</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Filtros por categoría */}
              <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                {[{ id: "all", label: "Todos", color: "#c9a84c" }, ...ROLES].map(r => (
                  <button key={r.id} onClick={() => setFilterRole(r.id === "all" ? "all" : (filterRole === r.id ? "all" : r.id))}
                    style={{ padding: "5px 13px", borderRadius: 20, border: "1px solid", borderColor: filterRole === r.id ? r.color : "#3a2020", background: filterRole === r.id ? r.color + "22" : "transparent", color: filterRole === r.id ? r.color : "#666", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                <StatCard val={totalFiltered} label="Reservas" />
                <StatCard val={totalPersonas} label="Personas" />
                <StatCard val={llegaron} label="Llegaron" color="#4fc9a8" />
              </div>

              {loading ? (
                <div style={{ textAlign: "center", color: "#8a6868", padding: 40, fontSize: 13 }}>Conectando...</div>
              ) : sortedDays.length === 0 ? (
                <div style={{ textAlign: "center", padding: "44px 20px", color: "#8a6868", fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                  No hay reservaciones.<br />
                  Presiona <strong style={{ color: "#c9a84c" }}>+ Nueva</strong> para agregar una.
                </div>
              ) : (
                <div>
                  {sortedDays.map(fecha => {
                    const items = groupedByDay[fecha];
                    const diaPersonas = items.reduce((s, r) => s + r.personas, 0);
                    const diaLlegaron = items.filter(r => r.llego).length;
                    return (
                      <div key={fecha} style={{ marginBottom: 24 }}>
                        {/* Day header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#f5e8e0" }}>{formatDateFull(fecha)}</div>
                            <div style={{ fontSize: 11, color: "#9a7878", marginTop: 1 }}>
                              {items.length} reservas · {diaPersonas} personas
                              {diaLlegaron > 0 && <span style={{ color: "#4a9e6a", marginLeft: 6 }}>· {diaLlegaron} llegaron ✓</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "#7a5050", fontWeight: 600, background: "#1e1210", border: "1px solid #2a1818", borderRadius: 20, padding: "3px 10px" }}>
                            {diaLlegaron}/{items.length}
                          </div>
                        </div>

                        {/* Reservas del día */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {items.map((r, idx) => {
                            const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                            return (
                              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {/* Número */}
                                <div style={{ minWidth: 20, fontSize: 11, color: "#7a5050", textAlign: "right", fontWeight: 600 }}>{idx + 1}</div>

                                {/* Checkbox llegó */}
                                <button
                                  onClick={() => toggleLlego(r)}
                                  disabled={isCheckBlocked(r)}
                                  style={{
                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                    border: `2px solid ${r.llego ? "#4a9e6a" : isCheckBlocked(r) ? "#3a2020" : "#3a2020"}`,
                                    background: r.llego ? "#4a9e6a22" : isCheckBlocked(r) ? "#2a1818" : "transparent",
                                    cursor: isCheckBlocked(r) ? "not-allowed" : "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: isCheckBlocked(r) ? 11 : 14,
                                    color: "#4a9e6a", transition: "all 0.15s",
                                    opacity: isCheckBlocked(r) && !r.llego ? 0.4 : 1,
                                  }}
                                >
                                  {r.llego ? "✓" : isCheckBlocked(r) ? "🔒" : ""}
                                </button>

                                {/* Card */}
                                <div
                                  onClick={() => { setSelected(r); setView("detail"); }}
                                  style={{
                                    flex: 1, background: r.vip && !r.llego ? "#241a08" : r.llego ? "#0f1a12" : "#1e1210",
                                    border: r.vip ? "1px solid #f5c04c66" : "1px solid #2a1818",
                                    borderLeft: `3px solid ${r.vip ? "#f5c04c" : r.llego ? "#4fc9a8" : rc.border}`,
                                    borderRadius: 12, padding: "11px 13px", cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 10,
                                    opacity: r.llego ? 1 : r.vip ? 1 : 0.85,
                                    boxShadow: r.vip ? "0 0 12px #f5c04c22" : "none",
                                  }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.llego ? "#7efbaa" : r.vip ? "#f5c04c" : "#f5e8e0" }}>
                                      {r.vip ? "⭐ " : ""}{r.nombre}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#a07878", marginTop: 2 }}>
                                      👤 {r.personas} · <span style={{ color: rc.text }}>{r.iniciales}</span>
                                      {r.vip && <span style={{ color: "#f5c04c", marginLeft: 6, fontWeight: 700 }}>VIP</span>}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, whiteSpace: "nowrap" }}>
                                    {ROLES.find(x => x.id === r.rol)?.label}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: "#261414", marginTop: 18 }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {reservaciones.length > 0 && puede.generarCorte && !isSunday() && (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#9a7878", fontStyle: "italic" }}>
                    El corte semanal se genera los domingos
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FORM */}
          {view === "form" && (
            <div style={{ padding: "18px 16px" }}>
              <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#a07878", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20 }}>← Volver</button>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, marginBottom: 22 }}>Nueva Reservación</div>
              {[
                { label: "Fecha", key: "fecha", type: "date" },
                { label: "Nombre del cliente", key: "nombre", type: "text", placeholder: "Ej. Mesa Martínez" },
                { label: "Número de personas", key: "personas", type: "number", placeholder: "Ej. 4" },
                { label: "Iniciales (quien registra)", key: "iniciales", type: "text", placeholder: "Ej. KS" },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 10, letterSpacing: 1, color: "#a07878", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{field.label}</label>
                  <input type={field.type} value={form[field.key]} placeholder={field.placeholder}
                    onChange={e => { setForm(f => ({ ...f, [field.key]: e.target.value })); setErrors(err => ({ ...err, [field.key]: null })); }}
                    style={{ width: "100%", boxSizing: "border-box", background: "#1e1210", border: `1px solid ${errors[field.key] ? "#c94c4c" : "#3a2020"}`, borderRadius: 10, padding: "12px 15px", color: "#f5e8e0", fontSize: 15, outline: "none" }} />
                  {errors[field.key] && <div style={{ color: "#c94c4c", fontSize: 11, marginTop: 3 }}>{errors[field.key]}</div>}
                </div>
              ))}
              <div style={{ marginBottom: 26 }}>
                <label style={{ fontSize: 10, letterSpacing: 1, color: "#a07878", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Registrado por</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  {ROLES.map(r => {
                    const active = form.rol === r.id;
                    return (
                      <button key={r.id} onClick={() => { setForm(f => ({ ...f, rol: r.id })); setErrors(err => ({ ...err, rol: null })); }}
                        style={{ flex: "1 1 calc(50% - 5px)", padding: "13px 6px", borderRadius: 12, border: `1.5px solid ${active ? r.color : "#3a2020"}`, background: active ? r.color + "22" : "#1e1210", color: active ? r.color : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {errors.rol && <div style={{ color: "#c94c4c", fontSize: 11, marginTop: 5 }}>{errors.rol}</div>}
              </div>
              {puede.marcarVip && (
                <button onClick={() => setForm(f => ({ ...f, vip: !f.vip }))} style={{
                  width: "100%", marginBottom: 26, padding: "13px", borderRadius: 12,
                  border: `1.5px solid ${form.vip ? "#f5c04c" : "#3a2020"}`,
                  background: form.vip ? "#f5c04c22" : "#1e1210",
                  color: form.vip ? "#f5c04c" : "#666",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 16 }}>⭐</span>
                  {form.vip ? "Reserva VIP / Importante ✓" : "Marcar como VIP / Importante"}
                </button>
              )}
              <button onClick={handleSubmit} disabled={saving} style={{ width: "100%", padding: "15px", background: saving ? "#5a4a1a" : "#c9a84c", color: "#1a0a0a", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Guardando..." : "Guardar Reservación"}
              </button>
            </div>
          )}

          {/* DETAIL */}
          {view === "detail" && selected && (() => {
            const r = selected;
            const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
            return (
              <div style={{ padding: "18px 16px" }}>
                <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#a07878", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 22 }}>← Volver</button>
                <div style={{ background: "#1e1210", borderRadius: 16, border: `1px solid ${r.vip ? "#f5c04c66" : rc.border + "44"}`, overflow: "hidden", marginBottom: 18, boxShadow: r.vip ? "0 0 16px #f5c04c22" : "none" }}>
                  <div style={{ background: rc.bg, padding: "18px 20px 14px", borderBottom: `1px solid ${rc.border}33` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: rc.text, textTransform: "uppercase", marginBottom: 6 }}>
                      {ROLES.find(x => x.id === r.rol)?.label}
                      {r.vip && <span style={{ color: "#f5c04c", marginLeft: 8 }}>· ⭐ VIP</span>}
                    </div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: r.vip ? "#f5c04c" : undefined }}>{r.vip ? "⭐ " : ""}{r.nombre}</div>
                  </div>
                  <div style={{ padding: "18px 20px" }}>
                    {[
                      { icon: "📅", label: "Fecha", val: formatDateFull(r.fecha) },
                      { icon: "👥", label: "Personas", val: r.personas },
                      { icon: "✍️", label: "Registrado por", val: r.iniciales },
                      { icon: r.llego ? "✅" : "⏳", label: "Asistencia", val: r.llego ? "Llegó" : "Pendiente" },
                      ...(r.vip ? [{ icon: "⭐", label: "Prioridad", val: "VIP / Importante" }] : []),
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #2a1818", fontSize: 14 }}>
                        <span style={{ color: "#a07878" }}>{item.icon} {item.label}</span>
                        <span style={{ fontWeight: 600, color: item.label === "Asistencia" ? (r.llego ? "#4fc9a8" : "#888") : item.label === "Prioridad" ? "#f5c04c" : "#f5e8e0" }}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {puede.marcarVip && (
                  <button onClick={() => toggleVip(r)}
                    style={{ width: "100%", padding: "13px", marginBottom: 10, background: r.vip ? "#f5c04c18" : "transparent", color: "#f5c04c", border: "1px solid #f5c04c55", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    {r.vip ? "Quitar marca VIP" : "⭐ Marcar como VIP / Importante"}
                  </button>
                )}
                <button onClick={() => { if (window.confirm("¿Eliminar esta reservación?")) handleDelete(r.id, r.iniciales); }}
                  style={{ width: "100%", padding: "13px", background: "transparent", color: "#c94c4c", border: "1px solid #c94c4c44", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Eliminar reservación
                </button>
              </div>
            );
          })()}
        </>
      )}

      {/* ── TAB REPORTES ── */}
      {tab === "reportes" && (
        <>
          {view !== "reporte_detalle" && (
            <div style={{ padding: "18px 16px" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Cortes Semanales</div>
              <div style={{ fontSize: 12, color: "#9a7878", marginBottom: 20 }}>Solo incluye reservas marcadas como llegaron</div>

              {/* Semanas pendientes de corte — para Admin */}
              {puede.generarCorte && (() => {
                // Detectar semanas con reservas que no tienen corte generado
                const semanasSinCorte = {};
                reservaciones.forEach(r => {
                  const ss = getWeekStart(r.fecha);
                  const se = getWeekEnd(r.fecha);
                  const hoy = getTodayLocal();
                  // Solo mostrar semanas ya terminadas (el domingo ya pasó)
                  if (se < hoy && !reportes.find(rep => rep.semanaStart === ss)) {
                    if (!semanasSinCorte[ss]) semanasSinCorte[ss] = { ss, se, count: 0 };
                    semanasSinCorte[ss].count++;
                  }
                });
                const pendientes = Object.values(semanasSinCorte).sort((a,b) => b.ss.localeCompare(a.ss));
                if (pendientes.length === 0) return null;
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "#c94c4c", textTransform: "uppercase", marginBottom: 10 }}>⚠️ Semanas sin corte</div>
                    {pendientes.map(p => (
                      <div key={p.ss} style={{ background: "#2a1010", border: "1px solid #c94c4c44", borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#f5e8e0" }}>{weekLabel(p.ss, p.se)}</div>
                          <div style={{ fontSize: 11, color: "#9a7878", marginTop: 2 }}>{p.count} reservas pendientes</div>
                        </div>
                        <button onClick={() => generarCorteManual(p.ss, p.se)} disabled={generando}
                          style={{ background: "#c9a84c", color: "#1a0a0a", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: generando ? "not-allowed" : "pointer" }}>
                          {generando ? "..." : "Generar"}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {puede.generarCorte && isSunday() && (
                <button onClick={generarCorte} disabled={generando} style={{ width: "100%", padding: "14px", background: "#c9a84c", color: "#1a0a0a", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: generando ? "not-allowed" : "pointer", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span>{generando ? "Generando..." : "📊 Generar corte de esta semana"}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>· Hoy es domingo ✓</span>
                </button>
              )}
              {puede.generarCorte && !isSunday() && (
                <div style={{ background: "#1e1210", border: "1px solid #3a2020", borderRadius: 12, padding: "14px", marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#9a7878" }}>📅 El corte se genera los domingos</div>
                  <div style={{ fontSize: 11, color: "#7a5050", marginTop: 4 }}>Incluye todas las reservas de lunes a sábado</div>
                </div>
              )}
              {loading ? (
                <div style={{ textAlign: "center", color: "#8a6868", padding: 30, fontSize: 13 }}>Cargando...</div>
              ) : reportes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#8a6868", fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📁</div>
                  Aún no hay cortes generados.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {reportes.map((rep, i) => (
                    <div key={rep.id} onClick={() => { setSelectedReporte(rep); setView("reporte_detalle"); }}
                      style={{ background: "#1e1210", borderRadius: 13, padding: "15px 16px", border: "1px solid #2a1818", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ background: i === 0 ? "#c9a84c22" : "#1a0a0a", borderRadius: 10, padding: "8px 10px", minWidth: 38, textAlign: "center" }}>
                        <div style={{ fontSize: 18 }}>📋</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{rep.label}</div>
                        <div style={{ fontSize: 11, color: "#9a7878", marginTop: 3 }}>{rep.totalReservas} asistieron · {rep.totalPersonas} personas</div>
                      </div>
                      <div style={{ color: "#7a5050", fontSize: 18 }}>›</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REPORTE DETALLE */}
          {view === "reporte_detalle" && selectedReporte && (() => {
            const rep = selectedReporte;
            const diasOrdenados = Object.keys(rep.byDay).sort();
            return (
              <div style={{ padding: "18px 16px" }}>
                <button onClick={() => { setView("list"); setTab("reportes"); }} style={{ background: "none", border: "none", color: "#a07878", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20 }}>← Reportes</button>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 4 }}>Corte semanal</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{rep.label}</div>
                <div style={{ fontSize: 11, color: "#8a6868", marginBottom: 18 }}>
                  Generado el {new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <button onClick={() => handleCopyText(rep)} style={{ flex: 1, padding: "12px 10px", background: copied ? "#1a3d2a" : "#1e1210", border: `1px solid ${copied ? "#4a9e6a" : "#3a2020"}`, borderRadius: 12, color: copied ? "#a0e8b8" : "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.2s" }}>
                    <span style={{ fontSize: 16 }}>{copied ? "✓" : "💬"}</span>
                    {copied ? "¡Copiado!" : "Copiar para WhatsApp"}
                  </button>
                  <button onClick={() => handleShareImage(rep)} style={{ flex: 1, padding: "12px 10px", background: "#1e1210", border: "1px solid #3a2020", borderRadius: 12, color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <span style={{ fontSize: 16 }}>🖼️</span>
                    Descargar imagen
                  </button>
                </div>
                <button onClick={() => handleDownloadExcel(rep)} style={{ width: "100%", padding: "12px 10px", background: "#12241a", border: "1px solid #2a5a3a", borderRadius: 12, color: "#7ecfa0", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 22 }}>
                  <span style={{ fontSize: 16 }}>📗</span>
                  Descargar Excel (.xlsx)
                </button>
                {(() => {
                  const registradas = rep.totalRegistradas || rep.totalReservas;
                  const noLlegCount = registradas - rep.totalReservas;
                  const pctAsist = registradas > 0 ? Math.round((rep.totalReservas / registradas) * 100) : 100;
                  return (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <StatCard val={registradas} label="Registradas" color="#c9a84c" />
                        <StatCard val={rep.totalPersonas} label="Personas" />
                        <StatCard val={rep.totalReservas} label="Llegaron" color="#4fc9a8" />
                        <StatCard val={noLlegCount} label="No llegaron" color={noLlegCount > 0 ? "#c94c4c" : "#4fc9a8"} />
                      </div>
                      <div style={{ background: "#1e1210", borderRadius: 14, padding: "14px 16px", marginBottom: 20, border: "1px solid #2a1818" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1, background: "#2a1818", borderRadius: 4, height: 10, overflow: "hidden" }}>
                            <div style={{ width: `${pctAsist}%`, background: "linear-gradient(90deg, #4a9e6a, #7efbaa66)", height: "100%", borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#4a9e6a", minWidth: 42 }}>{pctAsist}%</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#7a5050", marginTop: 6 }}>Asistencia global de la semana</div>
                      </div>
                    </>
                  );
                })()}

                {/* ── Por iniciales A-Z ── */}
                {(() => {
                  const byIni = getByIniciales(rep);
                  const iniciales = Object.keys(byIni).sort((a, b) => a.localeCompare(b));
                  if (iniciales.length === 0) return null;
                  return (
                    <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ fontSize: 11, letterSpacing: 1, color: "#9a7878", textTransform: "uppercase" }}>Por iniciales · A-Z</div>
                        <div style={{ fontSize: 9, color: "#7a5050" }}>reg → ✓ llegaron / ✗ no</div>
                      </div>
                      <div style={{ fontSize: 10, color: "#7a5050", marginBottom: 14 }}>⚠️ = menos del 50% de sus reservas llegó</div>
                      {iniciales.map(ini => {
                        const d = byIni[ini];
                        const p = d.registradas > 0 ? Math.round((d.llegaron / d.registradas) * 100) : 0;
                        const sospechoso = d.registradas >= 3 && p < 50;
                        return (
                          <div key={ini} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ minWidth: 40, height: 32, borderRadius: 8, background: sospechoso ? "#c94c4c22" : "#c9a84c18", border: `1px solid ${sospechoso ? "#c94c4c66" : "#c9a84c44"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: sospechoso ? "#ff9999" : "#c9a84c" }}>
                              {ini}{sospechoso ? " ⚠️" : ""}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ background: "#2a1818", borderRadius: 3, height: 7, overflow: "hidden", position: "relative" }}>
                                <div style={{ position: "absolute", width: "100%", background: "#c94c4c33", height: "100%" }} />
                                <div style={{ position: "absolute", width: `${p}%`, background: "#4a9e6a", height: "100%", borderRadius: 3 }} />
                              </div>
                            </div>
                            <div style={{ minWidth: 108, fontSize: 11, color: "#9a7878", textAlign: "right" }}>
                              {d.registradas} reg → <span style={{ color: "#4a9e6a" }}>✓{d.llegaron}</span> / <span style={{ color: d.noLlegaron > 0 ? "#c94c4c" : "#5a3838" }}>✗{d.noLlegaron}</span> · {p}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#9a7878", textTransform: "uppercase", marginBottom: 12 }}>Por categoría</div>
                  <RoleBar reservaciones={rep.reservaciones} />
                </div>
                <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#9a7878", textTransform: "uppercase", marginBottom: 14 }}>Por día</div>
                  {diasOrdenados.map(fecha => {
                    const d = rep.byDay[fecha];
                    const maxCount = Math.max(...Object.values(rep.byDay).map(x => x.count));
                    return (
                      <div key={fecha} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ minWidth: 60, fontSize: 12, color: "#b08080" }}>{formatDate(fecha)}</div>
                        <div style={{ flex: 1, background: "#2a1818", borderRadius: 4, height: 8, overflow: "hidden" }}>
                          <div style={{ width: `${(d.count / maxCount) * 100}%`, background: "#4fc9a8", height: "100%", borderRadius: 4 }} />
                        </div>
                        <div style={{ minWidth: 60, fontSize: 11, color: "#a07878", textAlign: "right" }}>{d.count} · {d.personas} p</div>
                      </div>
                    );
                  })}
                </div>
                {/* ── Detalle de asistentes, agrupado por día ── */}
                <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#4a9e6a", textTransform: "uppercase", marginBottom: 14 }}>✓ Sí llegaron</div>
                  {(() => {
                    const orden = [...rep.reservaciones].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
                    const porDia = {};
                    orden.forEach(r => { if (!porDia[r.fecha]) porDia[r.fecha] = []; porDia[r.fecha].push(r); });
                    return Object.keys(porDia).sort().map(fecha => (
                      <div key={fecha} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#c9a84c", padding: "4px 0", borderBottom: "1px solid #c9a84c33", marginBottom: 4 }}>
                          📅 {formatDate(fecha)} · {porDia[fecha].length} res
                        </div>
                        {porDia[fecha].map(r => {
                          const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                          return (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #2a1818" }}>
                              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                              <div style={{ fontSize: 11, color: "#a07878" }}>👤{r.personas}</div>
                              <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{r.iniciales}</div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>

                {/* ── Detalle de no llegadas ── */}
                {rep.noLlegaron && rep.noLlegaron.length > 0 && (
                  <div style={{ background: "#241010", borderRadius: 14, padding: "16px", border: "1px solid #c94c4c44" }}>
                    <div style={{ fontSize: 11, letterSpacing: 1, color: "#c94c4c", textTransform: "uppercase", marginBottom: 4 }}>✗ No llegaron</div>
                    <div style={{ fontSize: 10, color: "#7a5050", marginBottom: 14 }}>Registradas que nunca se palomearon — posibles fantasma</div>
                    {(() => {
                      const orden = [...rep.noLlegaron].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
                      const porDia = {};
                      orden.forEach(r => { if (!porDia[r.fecha]) porDia[r.fecha] = []; porDia[r.fecha].push(r); });
                      return Object.keys(porDia).sort().map(fecha => (
                        <div key={fecha} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#c94c4c", padding: "4px 0", borderBottom: "1px solid #c94c4c33", marginBottom: 4 }}>
                            📅 {formatDate(fecha)} · {porDia[fecha].length} res
                          </div>
                          {porDia[fecha].map(r => {
                            const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                            return (
                              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #3a1818" }}>
                                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#d8b0b0" }}>{r.nombre}</div>
                                <div style={{ fontSize: 11, color: "#a07878" }}>👤{r.personas}</div>
                                <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{r.iniciales}</div>
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ══ TAB DASHBOARD ══════════════════════════════════════════ */}
      {tab === "dashboard" && (
        <div style={{ padding: "20px 16px" }}>
          {/* Header */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, fontStyle: "italic", color: "#f5e8e0" }}>Dashboard</div>
            <div style={{ fontSize: 10, color: "#9a7878", letterSpacing: 1, marginTop: 2 }}>Semana actual · {semanaLabel}</div>
          </div>
          <div style={{ height: 1, background: "linear-gradient(90deg, #c9a84c66, transparent)", marginBottom: 20, marginTop: 8 }} />

          {/* Totales */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { val: semanaActual.length,              label: "Registradas", color: "#c9a84c" },
              { val: semanaLlegaron.length,            label: "Llegaron",    color: "#4a9e6a" },
              { val: semanaLlegaron.reduce((s,r)=>s+r.personas,0), label: "Personas", color: "#f5e8e0" },
            ].map(s => (
              <div key={s.label} style={{ background: "#1e1210", borderRadius: 12, padding: "14px 8px", textAlign: "center", border: "1px solid #2a1818" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: s.color, fontStyle: "italic" }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "#9a7878", marginTop: 3, letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Asistencia global */}
          {semanaActual.length > 0 && (
            <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 12 }}>Asistencia global</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1, background: "#2a1818", borderRadius: 4, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round((semanaLlegaron.length / semanaActual.length) * 100)}%`, background: "linear-gradient(90deg, #4a9e6a, #7efbaa66)", height: "100%", borderRadius: 4, transition: "width 0.6s" }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#4a9e6a", minWidth: 40 }}>
                  {Math.round((semanaLlegaron.length / semanaActual.length) * 100)}%
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#7a5050" }}>{semanaLlegaron.length} de {semanaActual.length} reservas confirmaron asistencia</div>
            </div>
          )}

          {/* Por categoría */}
          <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 14 }}>Por categoría</div>
            {dashByRole.filter(r => r.total > 0).map(role => (
              <div key={role.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: role.color, fontWeight: 600 }}>{role.label}</span>
                  <span style={{ color: "#9a7878" }}>
                    {role.llegaron}/{role.total} llegaron · {role.personas}p
                  </span>
                </div>
                {/* Barra total (fondo) + llegaron (encima) */}
                <div style={{ background: "#2a1818", borderRadius: 4, height: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${(role.total / (semanaActual.length || 1)) * 100}%`, background: role.color + "33", height: "100%", borderRadius: 4, position: "absolute" }} />
                  <div style={{ width: `${(role.llegaron / (semanaActual.length || 1)) * 100}%`, background: role.color, height: "100%", borderRadius: 4, position: "absolute", transition: "width 0.6s" }} />
                </div>
              </div>
            ))}
            {dashByRole.every(r => r.total === 0) && (
              <div style={{ color: "#7a5050", fontSize: 12, fontStyle: "italic" }}>Sin reservas esta semana</div>
            )}
          </div>

          {/* Por día */}
          {Object.keys(dashByDay).length > 0 && (
            <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 14 }}>Por día</div>
              {Object.keys(dashByDay).sort().map(fecha => {
                const d = dashByDay[fecha];
                const maxTotal = Math.max(...Object.values(dashByDay).map(x => x.total));
                return (
                  <div key={fecha} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ minWidth: 60, fontSize: 11, color: "#b08080" }}>{formatDate(fecha)}</div>
                    <div style={{ flex: 1, background: "#2a1818", borderRadius: 4, height: 8, overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${(d.total / maxTotal) * 100}%`, background: "#c9a84c33", height: "100%", position: "absolute", borderRadius: 4 }} />
                      <div style={{ width: `${(d.llegaron / maxTotal) * 100}%`, background: "#c9a84c", height: "100%", position: "absolute", borderRadius: 4, transition: "width 0.6s" }} />
                    </div>
                    <div style={{ minWidth: 70, fontSize: 10, color: "#9a7878", textAlign: "right" }}>
                      <span style={{ color: "#4a9e6a" }}>{d.llegaron}</span>/{d.total} · {d.personas}p
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lista en vivo */}
          {semanaActual.length > 0 && (
            <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", border: "1px solid #2a1818" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 14 }}>Reservas de la semana</div>
              {semanaActual.sort((a,b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)).map(r => {
                const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #2a1818" }}>
                    <div style={{ fontSize: 14, color: r.llego === true ? "#4a9e6a" : "#3a2020" }}>{r.llego === true ? "✓" : "·"}</div>
                    <div style={{ minWidth: 48, fontSize: 11, color: "#9a7878" }}>{formatDate(r.fecha)}</div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: r.llego === true ? "#7efbaa" : r.vip ? "#f5c04c" : "#f5e8e0" }}>{r.vip ? "⭐ " : ""}{r.nombre}</div>
                    <div style={{ fontSize: 11, color: "#9a7878" }}>👤{r.personas}</div>
                    <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{r.iniciales}</div>
                  </div>
                );
              })}
            </div>
          )}

          {semanaActual.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#9a7878", fontStyle: "italic" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📊</div>
              Sin reservas esta semana aún
            </div>
          )}

          {/* Desglose por categoría e iniciales */}
          {semanaActual.length > 0 && (
            <div style={{ background: "#1e1210", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #2a1818", marginTop: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#9a7878", textTransform: "uppercase", marginBottom: 16 }}>Registros por categoría e iniciales</div>
              {ROLES.map(role => {
                const deRole = semanaActual.filter(r => r.rol === role.id);
                if (deRole.length === 0) return null;

                // Agrupar por iniciales
                const porIniciales = deRole.reduce((acc, r) => {
                  if (!acc[r.iniciales]) acc[r.iniciales] = { llegaron: 0, noLlegaron: 0 };
                  if (r.llego === true) acc[r.iniciales].llegaron++;
                  else acc[r.iniciales].noLlegaron++;
                  return acc;
                }, {});

                return (
                  <div key={role.id} style={{ marginBottom: 18 }}>
                    {/* Header categoría */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: role.color }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: role.color }}>{role.label}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "#9a7878" }}>
                        {deRole.length} reservas · <span style={{ color: "#4a9e6a" }}>{deRole.filter(r => r.llego === true).length} llegaron</span>
                      </span>
                    </div>

                    {/* Fila por cada inicial */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 16, borderLeft: `2px solid ${role.color}33` }}>
                      {Object.entries(porIniciales)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([inicial, datos]) => {
                          const total = datos.llegaron + datos.noLlegaron;
                          return (
                            <div key={inicial} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {/* Inicial badge */}
                              <div style={{ minWidth: 32, height: 32, borderRadius: 8, background: role.color + "22", border: `1px solid ${role.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: role.color }}>
                                {inicial}
                              </div>
                              {/* Barra */}
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9a7878", marginBottom: 3 }}>
                                  <span>{total} registrada{total !== 1 ? "s" : ""}</span>
                                  <span>
                                    <span style={{ color: "#4a9e6a" }}>✓ {datos.llegaron}</span>
                                    {datos.noLlegaron > 0 && <span style={{ color: "#7a5050", marginLeft: 6 }}>✗ {datos.noLlegaron}</span>}
                                  </span>
                                </div>
                                <div style={{ background: "#2a1818", borderRadius: 3, height: 6, overflow: "hidden", position: "relative" }}>
                                  {/* total fondo */}
                                  <div style={{ position: "absolute", width: "100%", background: role.color + "22", height: "100%" }} />
                                  {/* llegaron */}
                                  <div style={{ position: "absolute", width: `${(datos.llegaron / total) * 100}%`, background: "#4a9e6a", height: "100%", borderRadius: 3, transition: "width 0.5s" }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Divisor entre categorías */}
                    <div style={{ height: 1, background: "#2a1818", marginTop: 14 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB MAPA ══════════════════════════════════════════════ */}
      {tab === "mapa" && (
        <MapaMesas
          mesaStatusP1={mesaStatusP1} mesaStatusP2={mesaStatusP2}
          mesaNombres={mesaNombres}
          cuartos={cuartos} onToggle={toggleMesa}
          onAsignar={asignarMesa}
          onUpdateCuarto={updateCuarto} onResetCuartos={resetCuartos}
          canEdit={puede.checkAsistencia}
          canAsignar={puede.asignarMesa}
          reservasFuturas={reservaciones
            .filter(r => r.fecha >= getTodayLocal())
            .sort((a, b) => (b.vip ? 1 : 0) - (a.vip ? 1 : 0) || a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))}
          pisoActivo={pisoActivo} setPisoActivo={setPisoActivo}
        />
      )}

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a0a0a", borderTop: "1px solid #2a1818", display: "flex", padding: "10px 0 20px" }}>
        <button onClick={() => { setTab("lista"); setView("list"); }}
          style={{ flex: 1, background: "none", border: "none", color: tab === "lista" ? "#c9a84c" : "#9a7878", fontSize: 11, fontWeight: tab === "lista" ? 600 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          Reservas
        </button>
        <button onClick={() => setTab("mapa")}
          style={{ flex: 1, background: "none", border: "none", color: tab === "mapa" ? "#c9a84c" : "#9a7878", fontSize: 11, fontWeight: tab === "mapa" ? 600 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 20 }}>🗺️</span>
          Mapa
        </button>
        {puede.verReportes && (
          <button onClick={() => { setTab("reportes"); setView("list"); }}
            style={{ flex: 1, background: "none", border: "none", color: tab === "reportes" ? "#c9a84c" : "#9a7878", fontSize: 11, fontWeight: tab === "reportes" ? 600 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 20 }}>📁</span>
            Historial
          </button>
        )}
        {puede.verDashboard && (
          <button onClick={() => setTab("dashboard")}
            style={{ flex: 1, background: "none", border: "none", color: tab === "dashboard" ? "#c9a84c" : "#9a7878", fontSize: 11, fontWeight: tab === "dashboard" ? 600 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
