// --- レイアウト用：斥力の影響範囲 ------------------------
// フック長 k に対して、斥力が届く最大距離を REPULSION_RANGE_FACTOR * k とする。
// この距離を超えた相手からの斥力は無視する。
const REPULSION_RANGE_FACTOR = 1.0;

const COHESION_STRENGTH_SCALE = 12;
const CIRCLE_STRENGTH_SCALE = 10;
const OUT_STRENGTH_SCALE = 10;
const OUT_STRENGTH_EXTRA = 0.3;


// -----------------------------
// 描画用の定数
// -----------------------------
const GRAPH_MARGIN = 60;

const NODE_RADIUS = 10;
const NODE_FILL_COLOR = "#1976d2";
const NODE_BORDER_COLOR = "#ffffff";
const NODE_BORDER_WIDTH = 1.5;

// 線の色（親密度では変えない）
const EDGE_COLOR = "#666666";

// 線の太さ設定
const BASE_LINE_WIDTH = 1.5;   // 最低太さ
const LINE_WIDTH_SCALE = 9;    // 親密度1増えるごとの増加量
const MAX_LINE_WIDTH = 9.5;     // 上限

// 矢印の三角形のサイズ（線の太さに応じて変える）
const ARROW_HEAD_BASE = 6;          // 基本サイズ
const ARROW_HEAD_BY_LINEWIDTH = 1; // lineWidth に掛ける係数
const ARROW_HEAD_ASPECT = 0.65;      // 幅 / 高さ の比率
const ARROW_LINE_OVERLAP = 2;  // 線を矢印の中にどれくらい潜り込ませるか(px)

// ラベル（名前）表示用
const LABEL_DISTANCE = 22;          // ノード中心からラベル中心までの距離
const LABEL_FONT_SIZE = 17;         // 文字サイズ
const LABEL_FONT_WEIGHT = "400";    // 太さ

// ラベルの白フチ
const LABEL_STROKE_WIDTH = 3;
const LABEL_STROKE_COLOR = "#ffffff";
const LABEL_FILL_COLOR = "#000000";


let lastLayoutNodes = null;
let lastLayoutEdges = null;

// ★ 実際に 1 回だけレイアウト計算＋描画する本体（非同期）
// スケジューリングやフラグ管理はここでは一切しない
async function recomputeAndDrawMain() {
  if (people.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = "";
    updateEdgeStats([], [], 0.7);
    return;
  }

  const { nodes: baseNodes, edges } = buildGraph();
  const iters = clamp(int(iterationsEl.value, 800), 50, 5000);
  const W = clamp(int(canvasWEl.value, 1000), 400, 2000);
  const H = clamp(int(canvasHEl.value, 600), 300, 2000);
  const runs = clamp(int(generationCountEl.value, 5), 1, 30);

  // 一度 repaint させる
  await new Promise(requestAnimationFrame);

  let bestNodes = null;
  let bestScore = Infinity;
  let bestAspectDiff = Infinity;

  for (let r = 0; r < runs; r++) {
    const trialNodes = baseNodes.map((n) => ({ name: n.name, x: 0, y: 0 }));

    frLayout(trialNodes, edges, W, H, { iterations: iters });

    // 回転してから評価
    minimizeBoundingBox(trialNodes, W, H);
    const score = computeCrossingScore(trialNodes, edges);
    const arDiff = computeBoundingBoxAspectDiff(trialNodes, W, H);

    if (score < bestScore || (score === bestScore && arDiff < bestAspectDiff)) {
      bestScore = score;
      bestAspectDiff = arDiff;
      bestNodes = trialNodes;
    }
  }

  if (bestNodes) {
    // ★ レイアウト結果をキャッシュしておく
    lastLayoutNodes = bestNodes;
    lastLayoutEdges = edges;
    drawGraph(bestNodes, edges, W, H);
  } else {
    flashStatus("描画に失敗しました", true);
  }
}

function redraw() {
  // まだ一度もレイアウトしていない場合は普通に計算
  if (!lastLayoutNodes || !lastLayoutEdges) {
    recomputeAndDraw();
    return;
  }

  const W = clamp(int(canvasWEl.value, 1000), 400, 2000);
  const H = clamp(int(canvasHEl.value, 600), 300, 2000);
  drawGraph(lastLayoutNodes, lastLayoutEdges, W, H);
}

function buildGraph() {
  const nameToIndex = new Map();
  const nodes = people.map((name, i) => {
    nameToIndex.set(name, i);
    return { name, x: 0, y: 0 };
  });

  // key: "A|B"（名前ベース） -> { aIndex, bIndex, weight }
  const edgeMap = new Map();

  for (const [u, m] of friendsMap.entries()) {
    const ui = nameToIndex.get(u);
    if (ui == null) continue;
    for (const [v, wRaw] of m.entries()) {
      const vi = nameToIndex.get(v);
      if (vi == null || ui === vi) continue;

      const key = makePairKey(u, v); // ★ 名前ベースのキー
      const w = wRaw > 0 ? wRaw : 1;
      const existing = edgeMap.get(key);
      if (!existing || w > existing.weight) {
        edgeMap.set(key, { aIndex: ui, bIndex: vi, weight: w });
      }
    }
  }

  const edges = [];
  for (const [pairKey, info] of edgeMap.entries()) {
    const { aIndex, bIndex, weight } = info;

    // 向き情報
    const rel = relationDirMap.get(pairKey);
    let directedFrom = null;
    let directedTo = null;

    if (rel && rel.mode === "oneway") {
      const fromName = rel.from;
      const toName = rel.to;
      const fromIndex = nameToIndex.get(fromName);
      const toIndex = nameToIndex.get(toName);
      if (fromIndex != null && toIndex != null) {
        directedFrom = fromIndex;
        directedTo = toIndex;
      }
    }

    edges.push({
      source: aIndex,      // レイアウト計算用（向きは無視）
      target: bIndex,
      weight,
      directedFrom,        // ★ 矢印の向き
      directedTo,
    });
  }

  return { nodes, edges };
}

// Fruchterman–Reingold 風レイアウト
// - nodes: { name, x, y }
// - edges: { source, target, weight }  （weight は「仲の良さ」）
// - グローバルに groups: [{ id, members: Set<string>, weight }] がある前提
//   ・グループ内全員を重心に引く力
//   ・グループの凸包を「半径を揃える」方向に動かして円に近づける力
//   ・その円の内側にグループ外の点がいた場合は外へ押し出す力
function frLayout(nodes, edges, W, H, opts) {
  const N = nodes.length;
  if (N === 0) return;

  const k = clamp(int(idealEdgeLenEl.value, 240), 50, 1000);
  const repulsionRadius = REPULSION_RANGE_FACTOR * k;

  const deg = new Float64Array(N);
  for (const e of edges) {
    const w = e.weight != null && e.weight > 0 ? e.weight : 1;
    deg[e.source] += w;
    deg[e.target] += w;
  }

  // 初期配置：ランダム（あとでスケーリングするのでキャンバス外でもOK）
  const margin = 40;
  for (const n of nodes) {
    n.x = margin + Math.random() * (W - margin * 2);
    n.y = margin + Math.random() * (H - margin * 2);
  }

  // name -> index（グループ用）
  const nameToIndex = new Map();
  nodes.forEach((n, i) => nameToIndex.set(n.name, i));

  // グループ情報（インデックス配列＋グループ重み）
  const groupInfos = [];
  for (const g of groups) {
    if (!g.members || g.members.size === 0) continue;
    const idxs = [];
    for (const name of g.members) {
      const idx = nameToIndex.get(name);
      if (idx != null) idxs.push(idx);
    }
    if (idxs.length >= 2) {
      const w = g.weight != null && g.weight > 0 ? g.weight : 1;
      groupInfos.push({ indices: idxs, weight: w });
    }
  }

  let t = Math.max(W, H) / 8;
  const iterations = Math.max(1, opts.iterations | 0);
  const cool = t / iterations;
  const dispX = new Float64Array(N);
  const dispY = new Float64Array(N);

  for (let iter = 0; iter < iterations; iter++) {
    dispX.fill(0);
    dispY.fill(0);

    // 斥力（影響範囲つき）
    for (let v = 0; v < N; v++) {
      for (let u = v + 1; u < N; u++) {
        let dx = nodes[v].x - nodes[u].x;
        let dy = nodes[v].y - nodes[u].y;
        let dist = Math.hypot(dx, dy);

        // ★ 斥力の影響範囲を制限：遠すぎる相手は無視
        if (!dist || dist > repulsionRadius) continue;

        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        dispX[v] += fx;
        dispY[v] += fy;
        dispX[u] -= fx;
        dispY[u] -= fy;
      }
    }

    // ----------------------
    // 2. エッジの引力（仲の良さ weight でスケール）
    // ----------------------
    for (const e of edges) {
      const v = e.source;
      const u = e.target;
      const w = e.weight != null && e.weight > 0 ? e.weight : 1;

      let dx = nodes[v].x - nodes[u].x;
      let dy = nodes[v].y - nodes[u].y;
      let dist = Math.hypot(dx, dy) || 0.0001;
      const force = (w * (dist * dist)) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      dispX[v] -= fx;
      dispY[v] -= fy;
      dispX[u] += fx;
      dispY[u] += fy;
    }

    // ----------------------
    // 3. グループに関する力
    //    - グループ全体を重心に引く
    //    - 凸包を「半径を揃える」方向に動かして円に近づける
    //    - その円の内側に外部ノードがいたら外へ押し出す
    // ----------------------
    for (const gf of groupInfos) {
      const idxs = gf.indices;
      const m = idxs.length;
      if (m < 2) continue;

      // 所属フラグ（外部ノード判定用）
      const memberFlag = new Uint8Array(N);
      for (const v of idxs) memberFlag[v] = 1;

      // 重心
      let cx = 0,
        cy = 0;
      for (const v of idxs) {
        cx += nodes[v].x;
        cy += nodes[v].y;
      }
      cx /= m;
      cy /= m;

      // 3-1. グループ全体を重心に引く力（団子っぽくまとめる）
      const cohesionStrength = COHESION_STRENGTH_SCALE * gf.weight; // 強さは適当に調整可
      for (const v of idxs) {
        const dx = nodes[v].x - cx;
        const dy = nodes[v].y - cy;
        dispX[v] -= cohesionStrength * dx;
        dispY[v] -= cohesionStrength * dy;
      }

      // 3-2. 凸包を円に近づける（半径を揃える）
      const hull = convexHullIndices(idxs, nodes);
      const hN = hull.length;
      if (hN >= 2) {
        let rSum = 0;
        const radii = new Array(hN);
        for (let i = 0; i < hN; i++) {
          const v = hull[i];
          const dx = nodes[v].x - cx;
          const dy = nodes[v].y - cy;
          const r = Math.hypot(dx, dy) || 0.0001;
          radii[i] = r;
          rSum += r;
        }
        let R = rSum / hN;
        if (!Number.isFinite(R) || R < k * 0.3) {
          R = k; // 小さすぎるときは適当な基準値
        }

        const circleStrength = CIRCLE_STRENGTH_SCALE * gf.weight; // 円に寄せる強さ（調整可）

        for (let i = 0; i < hN; i++) {
          const v = hull[i];
          const dx = nodes[v].x - cx;
          const dy = nodes[v].y - cy;
          const r = radii[i];
          const rr = r || 0.0001;
          const ux = dx / rr;
          const uy = dy / rr;
          const delta = r - R; // Rより外なら正、内なら負

          // 半径 r を R に近づけるようにする
          const f = circleStrength * delta;
          // delta>0（外側）は中心方向に、delta<0（内側）は外側に
          dispX[v] -= f * ux;
          dispY[v] -= f * uy;
        }

        // 3-3. グループ外の点を円の外側へ押し出す（境界付近も含めて）
        const outStrengthBase = OUT_STRENGTH_SCALE * gf.weight; // ベース強度（調整可）
        const band = R * OUT_STRENGTH_EXTRA; // 境界の「影響範囲」（半径の 30% 分外側まで）

        for (let v = 0; v < N; v++) {
          if (memberFlag[v]) continue; // グループ内は対象外
          let dx = nodes[v].x - cx;
          let dy = nodes[v].y - cy;
          let dist = Math.hypot(dx, dy) || 0.0001;

          // 円の内側 or 境界近く（外側バンド）にいる場合に反発させる
          if (dist < R + band) {
            const ux = dx / dist;
            const uy = dy / dist;
            let overlap, strengthFactor;

            if (dist < R) {
              // 完全に円の内側 → 強く押し出す
              overlap = R - dist; // どれくらい内側に食い込んでいるか
              strengthFactor = 1.0; // 最大強度
            } else {
              // R <= dist < R + band → 境界近くの外側
              overlap = R + band - dist; // 境界からの近さ
              // 円のすぐ近くほど強く、band の外縁でほぼ 0 になるように
              strengthFactor = overlap / band; // 0〜1
            }

            const f = outStrengthBase * overlap * strengthFactor;
            // 円の外側方向へ押し出す
            dispX[v] += f * ux;
            dispY[v] += f * uy;
          }
        }
      }
    }

    // 4. ★ ぼっちだけ全体重心に引く弱い力をかける
    {
      let gcx = 0, gcy = 0;
      for (let v = 0; v < N; v++) {
        gcx += nodes[v].x;
        gcy += nodes[v].y;
      }
      gcx /= N;
      gcy /= N;

      // 強さは k に比例させて、小さめに
      const lonelyStrength = 0.001 * k;

      for (let v = 0; v < N; v++) {
        if (deg[v] > 0) continue; // 友達がいるノードには適用しない
        const dx = nodes[v].x - gcx;
        const dy = nodes[v].y - gcy;
        // 中心に向かうように押す（dx,dy は重心からの差なのでマイナスを掛ける）
        dispX[v] -= lonelyStrength * dx;
        dispY[v] -= lonelyStrength * dy;
      }
    }

    // 5. 位置更新（既存そのまま）
    for (let v = 0; v < N; v++) {
      const dx = dispX[v];
      const dy = dispY[v];
      const m2 = Math.hypot(dx, dy) || 0.0001;
      const step = Math.min(m2, t);
      nodes[v].x += (dx / m2) * step;
      nodes[v].y += (dy / m2) * step;
    }

    t = Math.max(0, t - cool);
  }
}

// indices: ノードインデックス配列, nodes: ノード配列
// 返り値: 凸包のインデックス配列（外周を一周する順）
function convexHullIndices(indices, nodes) {
  const pts = indices.map((i) => ({ idx: i, x: nodes[i].x, y: nodes[i].y }));
  if (pts.length <= 2) return indices.slice();

  // x, y でソート
  pts.sort((a, b) => {
    if (a.x === b.x) return a.y - b.y;
    return a.x - b.x;
  });

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2) {
      const p1 = lower[lower.length - 2];
      const p2 = lower[lower.length - 1];
      const o = orient(p1.x, p1.y, p2.x, p2.y, p.x, p.y);
      if (o <= 0) lower.pop();
      else break;
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2) {
      const p1 = upper[upper.length - 2];
      const p2 = upper[upper.length - 1];
      const o = orient(p1.x, p1.y, p2.x, p2.y, p.x, p.y);
      if (o <= 0) upper.pop();
      else break;
    }
    upper.push(p);
  }

  // 一番端の点が重複するので除去して結合
  upper.pop();
  lower.pop();
  const hullPts = lower.concat(upper);

  return hullPts.map((p) => p.idx);
}

// グラフ全体を回転させて、軸に平行な最小長方形の面積が最小になる角度を探す
function minimizeBoundingBox(nodes, W, H) {
  const n = nodes.length;
  if (n === 0) return;

  // 重心
  let cx = 0,
    cy = 0;
  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
  }
  cx /= n;
  cy /= n;

  const step = Math.PI / 180; // 1度刻み
  let bestAngle = 0;
  let bestArea = Infinity;
  let bestBounds = null;

  for (let angle = 0; angle < Math.PI; angle += step) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const node of nodes) {
      const dx = node.x - cx;
      const dy = node.y - cy;
      const rx = cosA * dx - sinA * dy;
      const ry = sinA * dx + cosA * dy;

      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }

    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      bestAngle = angle;
      bestBounds = { minX, maxX, minY, maxY };
    }
  }

  if (!bestBounds) return;

  const cosA = Math.cos(bestAngle);
  const sinA = Math.sin(bestAngle);
  const { minX, maxX, minY, maxY } = bestBounds;
  const width = maxX - minX;
  const height = maxY - minY;

  // キャンバス中央に配置するオフセット
  const offsetX = (W - width) / 2 - minX;
  const offsetY = (H - height) / 2 - minY;

  // 最良角度で回転しつつ、キャンバス内中央に平行移動
  for (const node of nodes) {
    const dx = node.x - cx;
    const dy = node.y - cy;
    const rx = cosA * dx - sinA * dy;
    const ry = sinA * dx + cosA * dy;
    node.x = rx + offsetX;
    node.y = ry + offsetY;
  }
}

// 軸に平行な最小長方形の縦横比とキャンバスの縦横比の差
function computeBoundingBoxAspectDiff(nodes, canvasW, canvasH) {
  if (nodes.length === 0) return Infinity;

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return Infinity;

  const boxAR = w / h;
  const canvasAR = canvasW / canvasH;
  return Math.abs(boxAR - canvasAR);
}

// 線分 ab と cd が「交差」しているか（端点の接触や完全重なりは無視）
function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);

  return o1 * o2 < 0 && o3 * o4 < 0;
}

// 交差ごとに (x*y)^2 を足し上げ、その合計の切り捨て値 S を返す
// x, y はそれぞれのエッジの親密度（weight）
function computeCrossingScore(nodes, edges) {
  let sum = 0;
  const m = edges.length;
  for (let i = 0; i < m; i++) {
    const e1 = edges[i];
    const a = nodes[e1.source];
    const b = nodes[e1.target];
    const x = e1.weight != null && e1.weight > 0 ? e1.weight : 1;

    for (let j = i + 1; j < m; j++) {
      const e2 = edges[j];
      // 共通頂点を持つペアは除外
      if (
        e1.source === e2.source ||
        e1.source === e2.target ||
        e1.target === e2.source ||
        e1.target === e2.target
      ) {
        continue;
      }
      const c = nodes[e2.source];
      const d = nodes[e2.target];
      if (segmentsIntersect(a, b, c, d)) {
        const y = e2.weight != null && e2.weight > 0 ? e2.weight : 1;
        const v = x * y;
        sum += v * v; // (xy)^2
      }
    }
  }
  return Math.floor(sum);
}

function computeLayoutTransform(nodes, W, H) {
  if (!nodes || nodes.length === 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const width  = maxX - minX;
  const height = maxY - minY;

  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return { scale: 1, tx: 0, ty: 0 };
  }

  // ★ ノード用マージン＋ラベル用マージン
  const margin = GRAPH_MARGIN;

  const scaleX = (W - 2 * margin) / width;
  const scaleY = (H - 2 * margin) / height;

  let scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  }

  // 小さいグラフは拡大してOKにしたいなら上のままで良い
  // 「縮小だけ」にしたい場合は↓を使う：
  // scale = Math.min(1, scale);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centerX = W / 2;
  const centerY = H / 2;

  // レイアウト座標 (cx, cy) がキャンバス中央に来るように平行移動
  const tx = centerX - cx * scale;
  const ty = centerY - cy * scale;

  return { scale, tx, ty };
}

// =============================
// エッジ統計の計算と表示
// =============================
function updateEdgeStats(nodes, edges, threshold) {
  if (!edgeStatsEl) return;

  const n = nodes.length;
  const maxLines = (n * (n - 1)) / 2; // 引けうる線の最大本数 (nC2)

  if (n < 2 || !Number.isFinite(maxLines) || maxLines <= 0) {
    edgeStatsEl.textContent =
      "実線: 0 実線+点線: 0 実線率: 0 実線+点線率: 0";
    return;
  }

  let solidEq = 0;   // 実線の「本数」(矢印は 0.5 本)
  let dashedEq = 0;  // 点線の本数
  const a = threshold;

  for (const e of edges) {
    const isDirected = e.directedFrom != null && e.directedTo != null;
    const w = e.weight != null && e.weight > 0 ? e.weight : 1;
    const x = w; // 親密度

    if (isDirected) {
      // 矢印は常に実線扱いだが 0.5 本
      solidEq += 0.5;
    } else {
      if (x <= a) {
        // 双方向かつ親密度しきい値以下 → 点線
        dashedEq += 1;
      } else {
        // 双方向かつしきい値超え → 実線
        solidEq += 1;
      }
    }
  }

  const solidPlusDashed = solidEq + dashedEq;
  const solidRate = solidEq / maxLines;
  const bothRate = solidPlusDashed / maxLines;

  const fmt = (v) => String(round2(v)); // 小数第二位まで

  // 例: 10人, 実線4, 矢印1, 点線5
  // solidEq = 4.5, solidPlusDashed = 9.5
  // solidRate = 4.5 / 45 = 0.1, bothRate ≒ 0.21
  edgeStatsEl.textContent =
    `実線: ${fmt(solidEq)} ` +
    `実線+点線: ${fmt(solidPlusDashed)} ` +
    `実線率: ${fmt(solidRate)} ` +
    `実線+点線率: ${fmt(bothRate)}`;
}

function drawGraph(nodes, edges, W, H) {
  canvas.width = W;
  canvas.height = H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ★ レイアウト座標 → キャンバス座標の変換を計算
  const { scale, tx, ty } = computeLayoutTransform(nodes, W, H);

  // ★ 以降の描画はこの transform の下で行う
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, tx, ty);

  const thresholdRaw = parseFloat(dashedThresholdEl.value);
  const a = Number.isFinite(thresholdRaw) ? thresholdRaw : 0.7; // 点線にする基準 a

  updateEdgeStats(nodes, edges, a);

  // ★ ラベル用オフセット（ノード中心 → ラベル中心）
  const { labelDx, labelDy } = computeLabelOffsets(nodes, edges);

  // =====================
  // エッジ描画
  // =====================
  for (const e of edges) {
    const isDirected = e.directedFrom != null && e.directedTo != null;

    const s = isDirected ? nodes[e.directedFrom] : nodes[e.source];
    const t = isDirected ? nodes[e.directedTo]   : nodes[e.target];

    const w = e.weight != null && e.weight > 0 ? e.weight : 1;
    const x = w; // 親密度

    // 線の太さ
    let lineWidth;
    if (!isDirected && x <= a) {
      // 双方向かつ親密度がしきい値以下 → 点線・最低太さ
      ctx.setLineDash([4, 4]);
      lineWidth = BASE_LINE_WIDTH;
    } else {
      // 一方向 or 親密度しきい値超え → 実線・太さを親密度で変える
      ctx.setLineDash([]);
      const lw =
        BASE_LINE_WIDTH + Math.max(0, (x - a) * LINE_WIDTH_SCALE);
      lineWidth = Math.min(MAX_LINE_WIDTH, lw);
    }

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = EDGE_COLOR;

    // ノード半径と矢印サイズ
    const nodeR = NODE_RADIUS;
    const arrowSize = isDirected
      ? ARROW_HEAD_BASE + lineWidth * ARROW_HEAD_BY_LINEWIDTH
      : 0;

    let dx = t.x - s.x;
    let dy = t.y - s.y;
    let len = Math.hypot(dx, dy) || 0.0001;
    const ux = dx / len;
    const uy = dy / len;

    const startX = s.x + ux * nodeR;
    const startY = s.y + uy * nodeR;

    let lineEndOffset = nodeR;
    if (isDirected) {
      // 矢印のベースより少し手前まで線を引く（= 三角の中に 2px くらい潜る）
      lineEndOffset += arrowSize - ARROW_LINE_OVERLAP;
    }

    const endX = t.x - ux * lineEndOffset;
    const endY = t.y - uy * lineEndOffset;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 一方向矢印
    if (isDirected) {
      const headX = t.x - ux * nodeR;
      const headY = t.y - uy * nodeR;

      const ah = arrowSize;
      const aw = arrowSize * ARROW_HEAD_ASPECT;
      const px = -uy;
      const py = ux;

      const baseX = headX - ux * ah;
      const baseY = headY - uy * ah;

      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(baseX + px * aw, baseY + py * aw);
      ctx.lineTo(baseX - px * aw, baseY - py * aw);
      ctx.closePath();
      ctx.fillStyle = EDGE_COLOR;
      ctx.fill();
    }
  }

  // 点線設定をリセット
  ctx.setLineDash([]);

  // =====================
  // ノード & ラベル描画
  // =====================
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font =
    `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE}px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif`;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    // ノード本体
    ctx.beginPath();
    ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = NODE_FILL_COLOR;
    ctx.fill();
    ctx.lineWidth = NODE_BORDER_WIDTH;
    ctx.strokeStyle = NODE_BORDER_COLOR;
    ctx.stroke();

    // ラベル中心位置（ノード中心 + オフセット）
    const lx = n.x + labelDx[i];
    const ly = n.y + labelDy[i];

    // ラベルの白フチ
    ctx.lineWidth = LABEL_STROKE_WIDTH;
    ctx.strokeStyle = LABEL_STROKE_COLOR;
    ctx.strokeText(n.name, lx, ly);

    // ラベル本体
    ctx.fillStyle = LABEL_FILL_COLOR;
    ctx.fillText(n.name, lx, ly);
  }
}


// ノードごとに「ラベルをどの方向に出すか」を決める
// nodes: [{x,y,...}], edges: buildGraph() で作った配列
function computeLabelOffsets(nodes, edges) {
  const nodeCount = nodes.length;
  const labelDx = new Array(nodeCount).fill(0);
  const labelDy = new Array(nodeCount).fill(0);

  // 各ノードごとの「パスの偏角」リスト
  const angleLists = Array.from({ length: nodeCount }, () => []);

  // エッジから偏角を集める（無向なので両方向に登録）
  for (const e of edges) {
    const pairs = [
      [e.source, e.target],
      [e.target, e.source],
    ];
    for (const [from, to] of pairs) {
      if (from == null || to == null) continue;
      const src = nodes[from];
      const dst = nodes[to];
      let ang = Math.atan2(dst.y - src.y, dst.x - src.x); // -π～π
      if (ang < 0) ang += 2 * Math.PI;                    // 0～2π に正規化
      angleLists[from].push(ang);
    }
  }

  // 各ノードごとに「一番開けている方向」の中央を求める
  for (let i = 0; i < nodeCount; i++) {
    const angles = angleLists[i];
    let theta; // ラベル方向（0～2π）

    if (angles.length === 0) {
      // エッジがないノード：上方向に出す
      theta = -Math.PI / 2;
      if (theta < 0) theta += 2 * Math.PI;
    } else if (angles.length === 1) {
      // 1本だけなら、その反対側
      theta = angles[0] + Math.PI;
      if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    } else {
      // 角度を昇順にソート
      angles.sort((a, b) => a - b);

      let bestGap = -1;
      let bestStart = angles[0];

      for (let k = 0; k < angles.length; k++) {
        const a1 = angles[k];
        const a2 =
          k === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[k + 1];
        const gap = a2 - a1;

        if (gap > bestGap) {
          bestGap = gap;
          bestStart = a1;
        }
      }

      // 最大ギャップの中央
      theta = bestStart + bestGap / 2;
      if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    }

    const dx = Math.cos(theta) * LABEL_DISTANCE;
    const dy = Math.sin(theta) * LABEL_DISTANCE;
    labelDx[i] = dx;
    labelDy[i] = dy;
  }

  return { labelDx, labelDy };
}
