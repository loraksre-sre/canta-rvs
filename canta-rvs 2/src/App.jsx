import { useState, useEffect } from "react";
import {
  subscribeReservaciones,
  subscribeReportes,
  saveReservacion,
  deleteReservacion,
  saveReporte,
} from "./firebase.js";

const ROLES = [
  { id: "socio", label: "Socio", color: "#c9a84c" },
  { id: "rp", label: "RP", color: "#7c6fff" },
  { id: "team", label: "Team Canta", color: "#4fc9a8" },
];

const ROLE_COLORS = {
  socio: { bg: "#c9a84c22", border: "#c9a84c", text: "#c9a84c" },
  rp:    { bg: "#7c6fff22", border: "#7c6fff", text: "#7c6fff" },
  team:  { bg: "#4fc9a822", border: "#4fc9a8", text: "#4fc9a8" },
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function getTodayLocal() {
  return new Date().toISOString().split("T")[0];
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
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

function getWeekEnd(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + (6 - d.getDay()));
  return d.toISOString().split("T")[0];
}

function isSaturday() { return new Date().getDay() === 6; }

function weekLabel(s, e) { return `${formatDate(s)} – ${formatDate(e)}`; }

function StatCard({ val, label, color = "#c9a84c" }) {
  return (
    <div style={{ background: "#16161a", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid #1e1e22" }}>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{val}</div>
      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{label}</div>
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
              <span style={{ color: "#666" }}>{items.length} reservas · {personas} personas</span>
            </div>
            <div style={{ background: "#1e1e22", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, background: role.color, height: "100%", borderRadius: 4, transition: "width 0.6s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildWhatsAppText(rep) {
  const roleEmoji = { socio: "🥂", rp: "💜", team: "🟢" };
  const lines = [];
  lines.push(`📊 *CORTE SEMANAL — ${rep.label}*`);
  lines.push(`_Generado el ${new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}_`);
  lines.push("");
  lines.push(`📌 *Total: ${rep.totalReservas} reservas · ${rep.totalPersonas} personas*`);
  lines.push("");
  lines.push("*Por categoría:*");
  ROLES.forEach(role => {
    const d = rep.byRole[role.id];
    if (d && d.count > 0)
      lines.push(`${roleEmoji[role.id]} ${role.label}: ${d.count} reservas · ${d.personas} personas`);
  });
  lines.push("");
  lines.push("*Por día:*");
  Object.keys(rep.byDay).sort().forEach(fecha => {
    const d = rep.byDay[fecha];
    lines.push(`📅 ${formatDate(fecha)}: ${d.count} res · ${d.personas} p`);
  });
  lines.push("");
  lines.push("*Detalle:*");
  rep.reservaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)).forEach(r => {
    const roleLabel = ROLES.find(x => x.id === r.rol)?.label || r.rol;
    lines.push(`• ${formatDate(r.fecha)} | ${r.nombre} | 👤${r.personas} | ${r.iniciales} (${roleLabel})`);
  });
  lines.push("");
  lines.push("_Canta Corazón Gto · Rvs_");
  return lines.join("\n");
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

  const [form, setForm] = useState({ fecha: getTodayLocal(), nombre: "", personas: "", iniciales: "", rol: "" });
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
  async function toggleLlego(r) {
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
    if (!form.personas || isNaN(form.personas) || parseInt(form.personas) < 1) e.personas = "Número válido";
    if (!form.iniciales.trim()) e.iniciales = "Requerido";
    if (!form.rol) e.rol = "Selecciona una opción";
    return e;
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
      createdAt: new Date().toISOString(),
    };
    try {
      await saveReservacion(nueva);
      setForm({ fecha: getTodayLocal(), nombre: "", personas: "", iniciales: "", rol: "" });
      setErrors({});
      setView("list");
      showToast("Reservación guardada ✓");
    } catch {
      showToast("Error al guardar", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
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
    setGenerando(true);
    const hoy = getTodayLocal();
    const semanaStart = getWeekStart(hoy);
    const semanaEnd = getWeekEnd(hoy);

    const deEstaSemana = reservaciones.filter(r => r.fecha >= semanaStart && r.fecha <= semanaEnd);
    const llegaron = deEstaSemana.filter(r => r.llego);

    if (deEstaSemana.length === 0) {
      showToast("No hay reservaciones esta semana", "error");
      setGenerando(false);
      return;
    }

    if (llegaron.length === 0) {
      showToast("Ninguna reserva marcada como llegó", "error");
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
      reservaciones: llegaron,
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
  }

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

      ctx.fillStyle = "#0d0d0f"; ctx.fillRect(0, 0, W, totalH);
      ctx.fillStyle = "#c9a84c"; ctx.fillRect(0, 0, W, 5);

      let y = 36;
      ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
      ctx.fillText("CANTA CORAZÓN GTO · CORTE SEMANAL", 32, y); y += 24;
      ctx.fillStyle = "#f0ede8"; ctx.font = "bold 26px serif";
      ctx.fillText(rep.label, 32, y); y += 18;
      ctx.fillStyle = "#444"; ctx.font = "11px sans-serif";
      ctx.fillText("Generado el " + new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }), 32, y); y += 32;

      ctx.strokeStyle = "#1e1e22"; ctx.lineWidth = 1;
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
      const roleColors = { socio: "#c9a84c", rp: "#7c6fff", team: "#4fc9a8" };
      roleLines.forEach(role => {
        const d = rep.byRole[role.id];
        ctx.fillStyle = roleColors[role.id] || "#888"; ctx.font = "bold 13px sans-serif";
        ctx.fillText(role.label, 32, y);
        ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
        ctx.fillText(`${d.count} reservas · ${d.personas} personas`, 160, y);
        const barX = 32, barY = y + 5, barW = W - 64, barH = 5;
        ctx.fillStyle = "#1e1e22"; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
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
        ctx.fillStyle = "#1e1e22"; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
        ctx.fillStyle = "#c9a84c"; ctx.beginPath(); ctx.roundRect(barX, barY, barW * (d.count / maxCount), barH, 3); ctx.fill();
        ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
        ctx.fillText(`${d.count} res · ${d.personas} p`, barX + barW + 10, y);
        y += 28;
      });
      y += 8;

      ctx.strokeStyle = "#1e1e22"; ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(W - 32, y); ctx.stroke(); y += 18;
      ctx.fillStyle = "#555"; ctx.font = "10px sans-serif";
      ctx.fillText("DETALLE DE RESERVAS", 32, y); y += 20;
      detailLines.forEach(r => {
        ctx.fillStyle = "#888"; ctx.font = "11px sans-serif"; ctx.fillText(formatDate(r.fecha), 32, y);
        ctx.fillStyle = "#f0ede8"; ctx.font = "12px sans-serif";
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
  const esSabado = isSaturday();

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0ede8", paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid #1e1e22", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0d0d0f", zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", textTransform: "uppercase" }}>Canta Corazón Gto</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, fontWeight: 700, lineHeight: 1.2 }}>Rvs</div>
        </div>
        {tab === "lista" && view === "list" && (
          <button onClick={() => { setView("form"); setErrors({}); }} style={{ background: "#c9a84c", color: "#0d0d0f", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Nueva
          </button>
        )}
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
              {esSabado && (
                <div style={{ background: "linear-gradient(135deg, #c9a84c22, #7c6fff22)", border: "1px solid #c9a84c55", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 26 }}>📊</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#c9a84c" }}>¡Es sábado!</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Genera el corte con las reservas que llegaron</div>
                  </div>
                  <button onClick={generarCorte} disabled={generando} style={{ background: "#c9a84c", color: "#0d0d0f", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: generando ? "not-allowed" : "pointer" }}>
                    {generando ? "..." : "Corte"}
                  </button>
                </div>
              )}

              {/* Filtros */}
              <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                {[{ id: "all", label: "Todos", color: "#c9a84c" }, ...ROLES].map(r => (
                  <button key={r.id} onClick={() => setFilterRole(r.id === "all" ? "all" : (filterRole === r.id ? "all" : r.id))}
                    style={{ padding: "5px 13px", borderRadius: 20, border: "1px solid", borderColor: filterRole === r.id ? r.color : "#2a2a2e", background: filterRole === r.id ? r.color + "22" : "transparent", color: filterRole === r.id ? r.color : "#666", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                    {r.label}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 14 }}>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  style={{ background: "#16161a", border: "1px solid #2a2a2e", borderRadius: 10, padding: "8px 14px", color: filterDate ? "#f0ede8" : "#555", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                {filterDate && <button onClick={() => setFilterDate("")} style={{ marginTop: 5, fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ Limpiar fecha</button>}
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                <StatCard val={totalFiltered} label="Reservas" />
                <StatCard val={totalPersonas} label="Personas" />
                <StatCard val={llegaron} label="Llegaron" color="#4fc9a8" />
              </div>

              {loading ? (
                <div style={{ textAlign: "center", color: "#444", padding: 40, fontSize: 13 }}>Conectando...</div>
              ) : sortedDays.length === 0 ? (
                <div style={{ textAlign: "center", padding: "44px 20px", color: "#444", fontSize: 13, lineHeight: 1.8 }}>
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
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#f0ede8" }}>{formatDateFull(fecha)}</div>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
                              {items.length} reservas · {diaPersonas} personas
                              {diaLlegaron > 0 && <span style={{ color: "#4fc9a8", marginLeft: 6 }}>· {diaLlegaron} llegaron ✓</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "#333", fontWeight: 600, background: "#16161a", border: "1px solid #1e1e22", borderRadius: 20, padding: "3px 10px" }}>
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
                                <div style={{ minWidth: 20, fontSize: 11, color: "#333", textAlign: "right", fontWeight: 600 }}>{idx + 1}</div>

                                {/* Checkbox llegó */}
                                <button
                                  onClick={() => toggleLlego(r)}
                                  style={{
                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                    border: `2px solid ${r.llego ? "#4fc9a8" : "#2a2a2e"}`,
                                    background: r.llego ? "#4fc9a822" : "transparent",
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 14, transition: "all 0.15s",
                                  }}
                                >
                                  {r.llego ? "✓" : ""}
                                </button>

                                {/* Card */}
                                <div
                                  onClick={() => { setSelected(r); setView("detail"); }}
                                  style={{
                                    flex: 1, background: r.llego ? "#0f1f1a" : "#16161a",
                                    border: "1px solid #1e1e22",
                                    borderLeft: `3px solid ${r.llego ? "#4fc9a8" : rc.border}`,
                                    borderRadius: 12, padding: "11px 13px", cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 10,
                                    opacity: r.llego ? 1 : 0.85,
                                  }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.llego ? "#7efbaa" : "#f0ede8" }}>
                                      {r.nombre}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                      👤 {r.personas} · <span style={{ color: rc.text }}>{r.iniciales}</span>
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
                        <div style={{ height: 1, background: "#1a1a1e", marginTop: 18 }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {!esSabado && reservaciones.length > 0 && (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <button onClick={generarCorte} disabled={generando} style={{ background: "none", border: "1px solid #2a2a2e", color: "#555", borderRadius: 10, padding: "10px 20px", fontSize: 12, cursor: generando ? "not-allowed" : "pointer" }}>
                    {generando ? "Generando..." : "⚡ Generar corte semanal ahora"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FORM */}
          {view === "form" && (
            <div style={{ padding: "18px 16px" }}>
              <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20 }}>← Volver</button>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, marginBottom: 22 }}>Nueva Reservación</div>
              {[
                { label: "Fecha", key: "fecha", type: "date" },
                { label: "Nombre del cliente", key: "nombre", type: "text", placeholder: "Ej. Mesa Martínez" },
                { label: "Número de personas", key: "personas", type: "number", placeholder: "Ej. 4" },
                { label: "Iniciales (quien registra)", key: "iniciales", type: "text", placeholder: "Ej. KS" },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 10, letterSpacing: 1, color: "#777", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{field.label}</label>
                  <input type={field.type} value={form[field.key]} placeholder={field.placeholder}
                    onChange={e => { setForm(f => ({ ...f, [field.key]: e.target.value })); setErrors(err => ({ ...err, [field.key]: null })); }}
                    style={{ width: "100%", boxSizing: "border-box", background: "#16161a", border: `1px solid ${errors[field.key] ? "#c94c4c" : "#2a2a2e"}`, borderRadius: 10, padding: "12px 15px", color: "#f0ede8", fontSize: 15, outline: "none" }} />
                  {errors[field.key] && <div style={{ color: "#c94c4c", fontSize: 11, marginTop: 3 }}>{errors[field.key]}</div>}
                </div>
              ))}
              <div style={{ marginBottom: 26 }}>
                <label style={{ fontSize: 10, letterSpacing: 1, color: "#777", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Registrado por</label>
                <div style={{ display: "flex", gap: 9 }}>
                  {ROLES.map(r => {
                    const active = form.rol === r.id;
                    return (
                      <button key={r.id} onClick={() => { setForm(f => ({ ...f, rol: r.id })); setErrors(err => ({ ...err, rol: null })); }}
                        style={{ flex: 1, padding: "13px 6px", borderRadius: 12, border: `1.5px solid ${active ? r.color : "#2a2a2e"}`, background: active ? r.color + "22" : "#16161a", color: active ? r.color : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {errors.rol && <div style={{ color: "#c94c4c", fontSize: 11, marginTop: 5 }}>{errors.rol}</div>}
              </div>
              <button onClick={handleSubmit} disabled={saving} style={{ width: "100%", padding: "15px", background: saving ? "#5a4a1a" : "#c9a84c", color: "#0d0d0f", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
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
                <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 22 }}>← Volver</button>
                <div style={{ background: "#16161a", borderRadius: 16, border: `1px solid ${rc.border}44`, overflow: "hidden", marginBottom: 18 }}>
                  <div style={{ background: rc.bg, padding: "18px 20px 14px", borderBottom: `1px solid ${rc.border}33` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: rc.text, textTransform: "uppercase", marginBottom: 6 }}>{ROLES.find(x => x.id === r.rol)?.label}</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>{r.nombre}</div>
                  </div>
                  <div style={{ padding: "18px 20px" }}>
                    {[
                      { icon: "📅", label: "Fecha", val: formatDateFull(r.fecha) },
                      { icon: "👥", label: "Personas", val: r.personas },
                      { icon: "✍️", label: "Registrado por", val: r.iniciales },
                      { icon: r.llego ? "✅" : "⏳", label: "Asistencia", val: r.llego ? "Llegó" : "Pendiente" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #1e1e22", fontSize: 14 }}>
                        <span style={{ color: "#666" }}>{item.icon} {item.label}</span>
                        <span style={{ fontWeight: 600, color: item.label === "Asistencia" ? (r.llego ? "#4fc9a8" : "#888") : "#f0ede8" }}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => { if (window.confirm("¿Eliminar esta reservación?")) handleDelete(r.id); }}
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
              <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Solo incluye reservas marcadas como llegaron</div>
              <button onClick={generarCorte} disabled={generando} style={{ width: "100%", padding: "14px", background: esSabado ? "#c9a84c" : "#16161a", color: esSabado ? "#0d0d0f" : "#888", border: esSabado ? "none" : "1px solid #2a2a2e", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: generando ? "not-allowed" : "pointer", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span>{generando ? "Generando..." : "📊 Generar corte de esta semana"}</span>
                {esSabado && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>· Hoy es sábado ✓</span>}
              </button>
              {loading ? (
                <div style={{ textAlign: "center", color: "#444", padding: 30, fontSize: 13 }}>Cargando...</div>
              ) : reportes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#444", fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📁</div>
                  Aún no hay cortes generados.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {reportes.map((rep, i) => (
                    <div key={rep.id} onClick={() => { setSelectedReporte(rep); setView("reporte_detalle"); }}
                      style={{ background: "#16161a", borderRadius: 13, padding: "15px 16px", border: "1px solid #1e1e22", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ background: i === 0 ? "#c9a84c22" : "#111", borderRadius: 10, padding: "8px 10px", minWidth: 38, textAlign: "center" }}>
                        <div style={{ fontSize: 18 }}>📋</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{rep.label}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{rep.totalReservas} asistieron · {rep.totalPersonas} personas</div>
                      </div>
                      <div style={{ color: "#333", fontSize: 18 }}>›</div>
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
                <button onClick={() => { setView("list"); setTab("reportes"); }} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20 }}>← Reportes</button>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Corte semanal</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{rep.label}</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 18 }}>
                  Generado el {new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                  <button onClick={() => handleCopyText(rep)} style={{ flex: 1, padding: "12px 10px", background: copied ? "#1a3d2a" : "#16161a", border: `1px solid ${copied ? "#4cc97c" : "#2a2a2e"}`, borderRadius: 12, color: copied ? "#7efbaa" : "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.2s" }}>
                    <span style={{ fontSize: 16 }}>{copied ? "✓" : "💬"}</span>
                    {copied ? "¡Copiado!" : "Copiar para WhatsApp"}
                  </button>
                  <button onClick={() => handleShareImage(rep)} style={{ flex: 1, padding: "12px 10px", background: "#16161a", border: "1px solid #2a2a2e", borderRadius: 12, color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <span style={{ fontSize: 16 }}>🖼️</span>
                    Descargar imagen
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  <StatCard val={rep.totalReservas} label="Asistieron" color="#4fc9a8" />
                  <StatCard val={rep.totalPersonas} label="Personas" />
                </div>
                {rep.totalRegistradas && (
                  <div style={{ fontSize: 12, color: "#444", textAlign: "center", marginBottom: 16, marginTop: -10 }}>
                    De {rep.totalRegistradas} reservas registradas esa semana
                  </div>
                )}
                <div style={{ background: "#16161a", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #1e1e22" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#555", textTransform: "uppercase", marginBottom: 12 }}>Por categoría</div>
                  <RoleBar reservaciones={rep.reservaciones} />
                </div>
                <div style={{ background: "#16161a", borderRadius: 14, padding: "16px", marginBottom: 14, border: "1px solid #1e1e22" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#555", textTransform: "uppercase", marginBottom: 14 }}>Por día</div>
                  {diasOrdenados.map(fecha => {
                    const d = rep.byDay[fecha];
                    const maxCount = Math.max(...Object.values(rep.byDay).map(x => x.count));
                    return (
                      <div key={fecha} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ minWidth: 60, fontSize: 12, color: "#888" }}>{formatDate(fecha)}</div>
                        <div style={{ flex: 1, background: "#1e1e22", borderRadius: 4, height: 8, overflow: "hidden" }}>
                          <div style={{ width: `${(d.count / maxCount) * 100}%`, background: "#4fc9a8", height: "100%", borderRadius: 4 }} />
                        </div>
                        <div style={{ minWidth: 60, fontSize: 11, color: "#666", textAlign: "right" }}>{d.count} · {d.personas} p</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background: "#16161a", borderRadius: 14, padding: "16px", border: "1px solid #1e1e22" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: "#555", textTransform: "uppercase", marginBottom: 14 }}>Detalle de asistentes</div>
                  {rep.reservaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)).map(r => {
                    const rc = ROLE_COLORS[r.rol] || ROLE_COLORS.rp;
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1e1e22" }}>
                        <div style={{ fontSize: 12, color: "#555", minWidth: 52 }}>{formatDate(r.fecha)}</div>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>👤{r.personas}</div>
                        <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>{r.iniciales}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d0d0f", borderTop: "1px solid #1e1e22", display: "flex", padding: "10px 0 20px" }}>
        {[{ id: "lista", label: "Reservas", icon: "📋" }, { id: "reportes", label: "Cortes", icon: "📊" }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setView("list"); }}
            style={{ flex: 1, background: "none", border: "none", color: tab === t.id ? "#c9a84c" : "#444", fontSize: 11, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
