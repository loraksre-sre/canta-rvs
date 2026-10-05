
// ─────────────────────────────────────────────────────────────
//  rankingRP.js — Gráfica "Reservas por RP" del corte semanal
//  Canta Corazón Gto · Rvs
//
//  · Nombre completo del RP (si se registró con PIN individual o si
//    sus iniciales coinciden con un RP dado de alta). Si no, muestra
//    iniciales + categoría (ej. "KS · Socio").
//  · Por día: llegaron / registradas.
//  · Total, llegaron, no llegaron y % de asistencia por persona.
//  · Totales por día, día con más y con menos, mejor asistencia,
//    más no-shows, personas atendidas y total general.
// ─────────────────────────────────────────────────────────────

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const DIAS_LARGO = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const ROLE_LABEL = { socio: "Socio", rp: "Team Canta", team: "Operativo", instagram: "Instagram" };

function diaInfo(fecha) {
  const d = new Date(fecha + "T12:00:00");
  return {
    corto: DIAS[d.getDay()],
    largo: DIAS_LARGO[d.getDay()],
    fecha: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
  };
}

// ── 1. Datos ─────────────────────────────────────────────────
export function buildRankingRP(rep, rps = []) {
  const porId = {};
  const porIni = {};
  (rps || []).forEach(x => {
    if (x?.id) porId[x.id] = x;
    if (x?.iniciales) porIni[String(x.iniciales).toUpperCase()] = x;
  });

  const todas = [
    ...(rep.reservaciones || []).map(r => ({ ...r, _llego: true })),
    ...(rep.noLlegaron || []).map(r => ({ ...r, _llego: false })),
  ];
  const dias = [...new Set(todas.map(r => r.fecha))].sort();

  const personas = {};
  todas.forEach(r => {
    const ini = (r.iniciales || "?").toUpperCase();
    const rp = (r.rpId && porId[r.rpId]) || (r.rol === "rp" ? porIni[ini] : null);
    const key = rp ? `rp-${rp.id}` : `${r.rol}-${ini}`;
    if (!personas[key]) {
      personas[key] = {
        nombre: rp ? rp.nombre : `${ini} · ${ROLE_LABEL[r.rol] || r.rol || "?"}`,
        rol: r.rol, registradas: 0, llegaron: 0, noLlegaron: 0, personas: 0, porDia: {},
      };
    }
    const p = personas[key];
    if (!p.porDia[r.fecha]) p.porDia[r.fecha] = { reg: 0, lleg: 0 };
    p.registradas++;
    p.porDia[r.fecha].reg++;
    if (r._llego) { p.llegaron++; p.personas += Number(r.personas) || 0; p.porDia[r.fecha].lleg++; }
    else p.noLlegaron++;
  });

  const pctDe = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const filas = Object.values(personas)
    .map(p => ({ ...p, pct: pctDe(p.llegaron, p.registradas) }))
    .sort((a, b) => b.registradas - a.registradas || b.llegaron - a.llegaron || a.nombre.localeCompare(b.nombre));

  const totDia = dias.map(f => {
    const del = todas.filter(r => r.fecha === f);
    const lleg = del.filter(r => r._llego);
    return {
      fecha: f, ...diaInfo(f), reg: del.length, lleg: lleg.length,
      pct: pctDe(lleg.length, del.length),
      personas: lleg.reduce((s, r) => s + (Number(r.personas) || 0), 0),
    };
  });

  const totalReg = todas.length;
  const totalLleg = todas.filter(r => r._llego).length;
  const totalPersonas = todas.filter(r => r._llego).reduce((s, r) => s + (Number(r.personas) || 0), 0);

  const porReg = [...totDia].sort((a, b) => b.reg - a.reg || b.lleg - a.lleg);
  const mejorDia = porReg[0] || null;
  const peorDia = totDia.length > 1 ? porReg[porReg.length - 1] : null;

  const mejorAsistencia = filas
    .filter(p => p.registradas >= 3)
    .sort((a, b) => b.pct - a.pct || b.llegaron - a.llegaron)[0] || null;
  const masNoShows = filas
    .filter(p => p.noLlegaron > 0)
    .sort((a, b) => b.noLlegaron - a.noLlegaron || a.pct - b.pct)[0] || null;

  return {
    dias, filas, totDia, totalReg, totalLleg, totalNo: totalReg - totalLleg,
    pct: pctDe(totalLleg, totalReg), totalPersonas,
    mejorDia, peorDia, top: filas[0] || null, mejorAsistencia, masNoShows,
  };
}

// ── 2. Dibujo (canvas) ───────────────────────────────────────
export function dibujarRankingRP(rep, data, canvas) {
  const W = 1080, M = 40, TW = W - M * 2;
  const { dias, filas, totDia } = data;
  const nDias = Math.max(dias.length, 1);
  const ROW = 48, HEAD = 80;

  const C = {
    bg: "#faf6f1", ink: "#2a1414", soft: "#8a6a6a", line: "#ecdfd9",
    rosa: "#c48a8a", rosaBg: "#f6e4e4", rosaFila: "#fbf0f0", card: "#ffffff",
    verde: "#3f8a5a", rojo: "#c0504d", ambar: "#b8862e",
  };
  const PASTEL = ["#f3d6d6", "#d9e8d4", "#dcdaf0", "#f5e6c8", "#d4e4ee", "#f0d9e8", "#e6e0d0"];
  const PASTEL_TXT = ["#8a3a3a", "#3f6a3a", "#4a4590", "#8a6420", "#2f5a78", "#86406a", "#6a5a3a"];
  const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const SANS = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
  const pctColor = p => (p >= 70 ? C.verde : p >= 50 ? C.ambar : C.rojo);

  // Destacados (líneas dinámicas)
  const destacados = [];
  if (data.top) destacados.push({ dot: "#c9a84c", label: "Quien registró más", val: `${data.top.nombre} · ${data.top.registradas} res · ${data.top.pct}%` });
  if (data.mejorAsistencia) destacados.push({ dot: C.verde, label: "Mejor asistencia (3+ reservas)", val: `${data.mejorAsistencia.nombre} · ${data.mejorAsistencia.pct}%` });
  if (data.masNoShows) destacados.push({ dot: C.rojo, label: "Más reservas que no llegaron", val: `${data.masNoShows.nombre} · ${data.masNoShows.noLlegaron}` });
  if (data.mejorDia) destacados.push({ dot: C.verde, label: "Día con más reservas", val: `${data.mejorDia.largo} ${data.mejorDia.fecha} · ${data.mejorDia.reg}` });
  if (data.peorDia) destacados.push({ dot: C.rojo, label: "Día con menos reservas", val: `${data.peorDia.largo} ${data.peorDia.fecha} · ${data.peorDia.reg}` });
  destacados.push({ dot: C.rosa, label: "Personas atendidas", val: String(data.totalPersonas) });

  const tablaH = HEAD + filas.length * ROW;
  const yTabla = 440;
  const yLeyenda = yTabla + tablaH + 34;
  const yDias = yLeyenda + 56;
  const diasH = 214;
  const yDest = yDias + diasH + 24;
  const destH = 70 + destacados.length * 46;
  const yTotal = yDest + destH + 24;
  const totalH = 150;
  const H = yTotal + totalH + 70;

  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const setSpacing = px => { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; };
  const txt = (s, x, y, { font, color = C.ink, align = "left", spacing = 0 } = {}) => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    setSpacing(spacing); ctx.fillText(String(s), x, y); setSpacing(0);
  };
  const rrect = (x, y, w, h, r, fill, stroke) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  };
  const fit = (s, maxW, font) => {
    ctx.font = font; s = String(s);
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  };
  const hline = (x1, x2, y, color = C.line) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  };
  const vline = (x, y1, y2, color = C.line) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  };

  // Fondo
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.rosa; ctx.fillRect(0, 0, W, 8);

  // ── Encabezado ──
  txt("RESERVAS POR RP", W / 2, 112, { font: `italic 700 60px ${SERIF}`, align: "center" });
  txt("DESGLOSE POR DÍA Y ASISTENCIA", W / 2, 156, { font: `600 19px ${SANS}`, color: C.soft, align: "center", spacing: 6 });
  hline(W / 2 - 60, W / 2 + 60, 182, C.rosa);
  txt(`Semana ${rep.label || ""} · Canta Corazón Gto`, W / 2, 222, { font: `500 21px ${SANS}`, color: C.soft, align: "center" });

  // ── Tarjetas resumen ──
  const cards = [
    { val: data.totalReg, label: "REGISTRADAS", color: C.ink },
    { val: data.totalLleg, label: "LLEGARON", color: C.verde },
    { val: data.totalNo, label: "NO LLEGARON", color: data.totalNo > 0 ? C.rojo : C.verde },
    { val: `${data.pct}%`, label: "ASISTENCIA", color: pctColor(data.pct) },
  ];
  const cw = (TW - 3 * 16) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cw + 16), y = 268;
    rrect(x, y, cw, 128, 18, C.card, C.line);
    txt(c.val, x + cw / 2, y + 74, { font: `italic 700 48px ${SERIF}`, color: c.color, align: "center" });
    txt(c.label, x + cw / 2, y + 106, { font: `600 14px ${SANS}`, color: C.soft, align: "center", spacing: 3 });
  });

  // ── Tabla ──
  const wName = 250, wTot = 80, wSi = 90, wNo = 90, wPct = 110;
  const wDia = (TW - wName - wTot - wSi - wNo - wPct) / nDias;
  const xDias = M + wName;
  const xTot = xDias + wDia * nDias;
  const xSi = xTot + wTot, xNo = xSi + wSi, xPct = xNo + wNo;

  rrect(M, yTabla, TW, tablaH, 18, C.card, null);
  ctx.save();
  rrect(M, yTabla, TW, tablaH, 18, null, null);
  ctx.clip();

  // Fondos de encabezado
  ctx.fillStyle = C.rosaBg; ctx.fillRect(M, yTabla, wName, HEAD);
  dias.forEach((_, i) => { ctx.fillStyle = PASTEL[i % PASTEL.length]; ctx.fillRect(xDias + i * wDia, yTabla, wDia, HEAD); });
  ctx.fillStyle = C.rosaBg; ctx.fillRect(xTot, yTabla, wTot, HEAD);
  ctx.fillStyle = "#e3efe0"; ctx.fillRect(xSi, yTabla, wSi, HEAD);
  ctx.fillStyle = "#f6dede"; ctx.fillRect(xNo, yTabla, wNo, HEAD);
  ctx.fillStyle = "#efe9f3"; ctx.fillRect(xPct, yTabla, wPct, HEAD);

  // Filas: cebra + columna total
  filas.forEach((_, i) => {
    const ry = yTabla + HEAD + i * ROW;
    if (i % 2 === 1) { ctx.fillStyle = "#fcf9f7"; ctx.fillRect(M, ry, TW, ROW); }
    ctx.fillStyle = C.rosaFila; ctx.fillRect(xTot, ry, wTot, ROW);
  });
  ctx.restore();

  // Textos de encabezado
  const hy = yTabla + HEAD / 2;
  txt("RP", M + wName / 2, hy + 7, { font: `700 18px ${SANS}`, align: "center", spacing: 3 });
  dias.forEach((f, i) => {
    const info = diaInfo(f);
    const cx = xDias + i * wDia + wDia / 2;
    const col = PASTEL_TXT[i % PASTEL_TXT.length];
    txt(info.corto.toUpperCase(), cx, hy - 2, { font: `700 ${nDias > 5 ? 15 : 18}px ${SANS}`, color: col, align: "center", spacing: 2 });
    txt(info.fecha, cx, hy + 20, { font: `500 ${nDias > 5 ? 12 : 14}px ${SANS}`, color: col, align: "center" });
  });
  txt("TOTAL", xTot + wTot / 2, hy + 6, { font: `700 15px ${SANS}`, align: "center", spacing: 1 });
  txt("LLEGÓ", xSi + wSi / 2, hy + 6, { font: `700 15px ${SANS}`, color: C.verde, align: "center", spacing: 1 });
  txt("NO", xNo + wNo / 2, hy + 6, { font: `700 15px ${SANS}`, color: C.rojo, align: "center", spacing: 1 });
  txt("% ASIST.", xPct + wPct / 2, hy + 6, { font: `700 15px ${SANS}`, align: "center", spacing: 1 });

  // Filas
  const MEDALLA = ["#d9b04c", "#b8b8c4", "#c48a5a"];
  filas.forEach((p, i) => {
    const ry = yTabla + HEAD + i * ROW;
    const cy = ry + ROW / 2 + 7;

    // Lugar
    const bx = M + 26, by = ry + ROW / 2;
    ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fillStyle = i < 3 ? MEDALLA[i] : "#efe6e2"; ctx.fill();
    txt(i + 1, bx, by + 5, { font: `700 13px ${SANS}`, color: i < 3 ? "#ffffff" : C.soft, align: "center" });

    // Nombre
    const fName = `${i < 3 ? 600 : 500} 18px ${SANS}`;
    txt(fit(p.nombre, wName - 60, fName), M + 50, cy, { font: fName });

    // Días: llegaron / registradas
    dias.forEach((f, j) => {
      const d = p.porDia[f];
      const cx = xDias + j * wDia + wDia / 2;
      if (!d) { txt("–", cx, cy, { font: `400 18px ${SANS}`, color: "#c8b8b4", align: "center" }); return; }
      const col = d.lleg === d.reg ? C.verde : d.lleg === 0 ? C.rojo : C.ink;
      txt(`${d.lleg}/${d.reg}`, cx, cy, { font: `500 ${nDias > 5 ? 16 : 18}px ${SANS}`, color: col, align: "center" });
    });

    txt(p.registradas, xTot + wTot / 2, cy, { font: `700 20px ${SANS}`, align: "center" });
    txt(p.llegaron, xSi + wSi / 2, cy, { font: `600 18px ${SANS}`, color: C.verde, align: "center" });
    txt(p.noLlegaron, xNo + wNo / 2, cy, { font: `600 18px ${SANS}`, color: p.noLlegaron > 0 ? C.rojo : "#c8b8b4", align: "center" });

    const pc = pctColor(p.pct);
    const alerta = p.registradas >= 3 && p.pct < 50;
    rrect(xPct + 14, ry + 10, wPct - 28, ROW - 20, 14, pc + "22", null);
    txt(`${p.pct}%${alerta ? " !" : ""}`, xPct + wPct / 2, cy - 1, { font: `700 17px ${SANS}`, color: pc, align: "center" });

    if (i < filas.length - 1) hline(M, M + TW, ry + ROW);
  });

  // Líneas verticales
  [xDias, ...dias.map((_, i) => xDias + (i + 1) * wDia)].forEach(x => vline(x, yTabla, yTabla + tablaH));
  [xSi, xNo, xPct].forEach(x => vline(x, yTabla, yTabla + tablaH));
  hline(M, M + TW, yTabla + HEAD, "#dcc8c2");
  rrect(M, yTabla, TW, tablaH, 18, null, C.line);

  // Leyenda
  txt("Cada día: llegaron / registradas  ·  Ordenado de quien registró más a quien registró menos",
    W / 2, yLeyenda, { font: `400 15px ${SANS}`, color: C.soft, align: "center" });
  txt("Verde = 70%+ de asistencia · Ámbar = 50-69% · Rojo = menos de 50%  ( ! = 3+ reservas y menos del 50%)",
    W / 2, yLeyenda + 24, { font: `400 14px ${SANS}`, color: C.soft, align: "center" });

  // ── Totales por día ──
  rrect(M, yDias, TW, diasH, 22, "#f4e6e3", null);
  txt("TOTALES POR DÍA", M + 28, yDias + 40, { font: `700 18px ${SANS}`, spacing: 4 });
  const gap = 12;
  const dcw = (TW - 56 - gap * (nDias - 1)) / nDias;
  totDia.forEach((d, i) => {
    const x = M + 28 + i * (dcw + gap);
    const cx = x + dcw / 2;
    const pillW = Math.min(dcw - 16, 120);
    rrect(cx - pillW / 2, yDias + 60, pillW, 30, 15, PASTEL[i % PASTEL.length], null);
    txt(`${d.corto.toUpperCase()} ${d.fecha}`, cx, yDias + 81,
      { font: `700 ${nDias > 5 ? 11 : 13}px ${SANS}`, color: PASTEL_TXT[i % PASTEL_TXT.length], align: "center", spacing: 1 });
    txt(d.reg, cx, yDias + 140, { font: `italic 700 ${nDias > 5 ? 38 : 46}px ${SERIF}`, align: "center" });
    txt("RESERVAS", cx, yDias + 162, { font: `500 12px ${SANS}`, color: C.soft, align: "center", spacing: 3 });
    txt(`${d.lleg} llegaron · ${d.pct}%`, cx, yDias + 184, { font: `600 ${nDias > 5 ? 12 : 14}px ${SANS}`, color: pctColor(d.pct), align: "center" });
    const esMas = data.mejorDia && d.fecha === data.mejorDia.fecha;
    const esMenos = data.peorDia && d.fecha === data.peorDia.fecha && !esMas;
    if (esMas) txt("▲ MÁS", cx, yDias + 204, { font: `700 12px ${SANS}`, color: C.verde, align: "center", spacing: 2 });
    if (esMenos) txt("▼ MENOS", cx, yDias + 204, { font: `700 12px ${SANS}`, color: C.rojo, align: "center", spacing: 2 });
  });

  // ── Destacados ──
  rrect(M, yDest, TW, destH, 22, C.card, C.line);
  txt("DESTACADOS DE LA SEMANA", M + 28, yDest + 42, { font: `700 18px ${SANS}`, spacing: 4 });
  destacados.forEach((d, i) => {
    const y = yDest + 86 + i * 46;
    ctx.beginPath(); ctx.arc(M + 36, y - 6, 6, 0, Math.PI * 2); ctx.fillStyle = d.dot; ctx.fill();
    txt(d.label, M + 54, y, { font: `400 17px ${SANS}`, color: C.soft });
    const fVal = `600 18px ${SANS}`;
    txt(fit(d.val, TW - 380, fVal), M + TW - 28, y, { font: fVal, align: "right" });
    if (i < destacados.length - 1) hline(M + 28, M + TW - 28, y + 18);
  });

  // ── Total general ──
  rrect(M, yTotal, TW, totalH, 22, C.rosaBg, null);
  txt("TOTAL GENERAL", W / 2, yTotal + 38, { font: `700 16px ${SANS}`, color: C.soft, align: "center", spacing: 4 });
  txt(data.totalReg, W / 2, yTotal + 104, { font: `italic 700 64px ${SERIF}`, align: "center" });
  txt(`RESERVAS · ${data.totalLleg} LLEGARON · ${data.pct}% ASISTENCIA`, W / 2, yTotal + 134,
    { font: `600 14px ${SANS}`, color: C.soft, align: "center", spacing: 2 });

  // Pie
  const gen = rep.generadoEl
    ? new Date(rep.generadoEl).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
    : "";
  txt(`Canta Corazón Gto · Rvs${gen ? " · Corte generado el " + gen : ""}`, W / 2, H - 30,
    { font: `400 14px ${SANS}`, color: "#b49a96", align: "center" });

  return canvas;
}

// ── 3. Todo junto: datos → imagen PNG ───────────────────────
export async function generarRankingRP(rep, rps = []) {
  try {
    await Promise.all([
      document.fonts.load("italic 700 60px 'Playfair Display'"),
      document.fonts.load("500 18px 'DM Sans'"),
      document.fonts.load("700 18px 'DM Sans'"),
    ]);
  } catch { /* si no cargan, usa Georgia/Arial */ }
  const data = buildRankingRP(rep, rps);
  const canvas = dibujarRankingRP(rep, data, document.createElement("canvas"));
  const blob = await new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error("No se pudo crear la imagen"))), "image/png"));
  return {
    blob,
    url: URL.createObjectURL(blob),
    nombre: `reservas-por-rp-${rep.semanaStart || "semana"}.png`,
    data,
  };
}
