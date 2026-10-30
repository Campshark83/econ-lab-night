// Tiny SVG chart helpers. All charts share one look: ink marks, red dashed
// line for the theory prediction, teal for "you".

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const W = 400;

// Dots on a number line, stacked when close. markers: vertical reference lines.
export function stripChart({ min, max, points, markers = [], unit = '', ticks }) {
  const padL = 16, padR = 16;
  const x = v => padL + ((v - min) / (max - min)) * (W - padL - padR);
  const r = 8;
  // stack dots that collide
  const placed = [];
  const sorted = [...points].sort((a, b) => a.v - b.v);
  for (const p of sorted) {
    const px = x(p.v);
    let level = 0;
    while (placed.some(q => q.level === level && Math.abs(q.px - px) < r * 2.1)) level++;
    placed.push({ ...p, px, level });
  }
  const maxLevel = Math.max(0, ...placed.map(p => p.level));
  const markerSpace = markers.length ? 22 * markers.length + 8 : 0;
  const dotsH = (maxLevel + 1) * (r * 2.2) + 12;
  const H = markerSpace + dotsH + 40;
  const base = markerSpace + dotsH;
  const tk = ticks || niceTicks(min, max);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart of everyone's answers">`;
  // markers
  markers.forEach((m, i) => {
    const mx = x(Math.max(min, Math.min(max, m.v)));
    const ly = 14 + i * 22;
    s += `<line class="mk ${m.cls}" x1="${mx}" x2="${mx}" y1="${ly - 10}" y2="${base}" />`;
    const right = mx > W - 110;
    s += `<text class="mk-label ${m.cls}" x="${right ? mx - 6 : mx + 6}" y="${ly + 4}" text-anchor="${right ? 'end' : 'start'}">${esc(m.label)}</text>`;
  });
  // axis
  s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" />`;
  tk.forEach(t => {
    s += `<line class="tick" x1="${x(t)}" x2="${x(t)}" y1="${base}" y2="${base + 6}" />`;
    s += `<text class="tick-label" x="${x(t)}" y="${base + 22}" text-anchor="middle">${t}${unit}</text>`;
  });
  // dots
  placed.forEach(p => {
    const cy = base - 10 - p.level * r * 2.2;
    s += `<circle class="dot ${p.cls || ''} ${p.me ? 'me' : ''}" cx="${p.px}" cy="${cy}" r="${r}"><title>${esc(p.label)}: ${p.v}${unit}</title></circle>`;
  });
  return s + '</svg>';
}

// Vertical bars, optional horizontal reference line.
export function barChart({ bars, max, line, unit = '', showValues = true }) {
  const H = 230, padB = 40, padT = 28, padL = 8, padR = 8;
  const n = Math.max(1, bars.length);
  const slot = (W - padL - padR) / n;
  const bw = Math.min(64, slot * 0.7);
  const y = v => H - padB - (v / max) * (H - padB - padT);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">`;
  s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" />`;
  bars.forEach((b, i) => {
    const cx = padL + slot * i + slot / 2;
    const top = y(b.v);
    s += `<rect class="bar ${b.cls || ''} ${b.me ? 'me' : ''}" x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(0, H - padB - top)}" rx="4"><title>${esc(b.label)}: ${b.v}${unit}</title></rect>`;
    if (showValues && b.v > 0) s += `<text class="bar-val" x="${cx}" y="${top - 6}" text-anchor="middle">${b.v}${unit}</text>`;
    const maxCh = Math.max(3, Math.floor(slot / 8));
    const lab = b.label.length > maxCh ? b.label.slice(0, maxCh - 1) + '…' : b.label;
    if (bars.length <= 10 || b.me || b.always) s += `<text class="tick-label ${b.me ? 'me-label' : ''}" x="${cx}" y="${H - padB + 20}" text-anchor="middle">${esc(lab)}</text>`;
  });
  if (line) {
    const ly = y(line.v);
    s += `<line class="mk ${line.cls}" x1="${padL}" x2="${W - padR}" y1="${ly}" y2="${ly}" />`;
    s += `<text class="mk-label ${line.cls}" x="${W - padR}" y="${ly - 6}" text-anchor="end">${esc(line.label)}</text>`;
  }
  return s + '</svg>';
}

function niceTicks(min, max) {
  const span = max - min;
  const step = span <= 10 ? 1 : span <= 20 ? 2 : span <= 50 ? 5 : span <= 100 ? 10 : 20;
  const out = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t);
  if (out.length > 11) return out.filter((_, i) => i % 2 === 0);
  return out;
}
