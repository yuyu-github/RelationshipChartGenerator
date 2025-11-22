function int(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// 2D ベクトルの向き（外積）
function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function escapeHTML(s) {
  return s.replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
}
