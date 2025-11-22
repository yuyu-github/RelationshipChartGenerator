// ★ この配列からダイアログを自動生成する
const AUTOGEN_SETTING_DEFS = [
  {
    key: "MIN_PEOPLE",
    label: "人数の最小値",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: 10,
    integer: true,
  },
  {
    key: "MAX_PEOPLE",
    label: "人数の最大値",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: 20,
    integer: true,
  },
  {
    key: "MIN_GROUP_SIZE",
    label: "グループ人数の最小値",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    default: 1,
    integer: true,
  },
  {
    key: "MAX_GROUP_SIZE",
    label: "グループ人数の最大値",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    default: 6,
    integer: true,
  },
  {
    key: "PREFERRED_GROUP_SIZE",
    label: "グループ人数の平均",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    default: 4,
    integer: true,
  },
  {
    key: "GROUP_WEIGHT_MIN",
    label: "グループ親密度の最小値",
    type: "number",
    min: 0,
    max: 10,
    step: 0.01,
    default: 0.7,
  },
  {
    key: "GROUP_WEIGHT_MAX",
    label: "グループ親密度の最大値",
    type: "number",
    min: 0,
    max: 10,
    step: 0.01,
    default: 1.3,
  },
  {
    key: "INTRA_STRONG_EDGE_PROB",
    label: "グループ内で強いペアになる確率",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.2,
  },
  {
    key: "INTRA_EXTRA_SMALL_DENSITY",
    label: "小グループのペア密度",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.95,
  },
  {
    key: "INTRA_EXTRA_MEDIUM_DENSITY",
    label: "中グループのペア密度",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.8,
  },
  {
    key: "INTRA_EXTRA_LARGE_DENSITY",
    label: "大グループのペア密度",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
  },
  {
    key: "BASE_CROSS_PROB",
    label: "グループ間ペアの生成確率",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.12,
  },
  {
    key: "CROSS_STRONG_EDGE_PROB",
    label: "グループ間で強いペアになる確率",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.06,
  },
  {
    key: "ONE_WAY_PROB",
    label: "一方的な関係になる確率",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.05,
  }
];

// defs から現在値テーブルとデフォルトテーブルを組み立てる
const AUTOGEN_SETTINGS_DEFAULT = {};
const AUTOGEN_SETTINGS = {};
const AGS = AUTOGEN_SETTINGS;

AUTOGEN_SETTING_DEFS.forEach(def => {
  AUTOGEN_SETTINGS_DEFAULT[def.key] = def.default;
  AUTOGEN_SETTINGS[def.key] = def.default;
});



// ★ グループ人数を「PREFERRED_GROUP_SIZE を山の頂にした山型分布」で決める
function pickGroupSize(remaining) {
  const minSize = AGS.MIN_GROUP_SIZE;
  const maxSize = AGS.MAX_GROUP_SIZE;

  // 残りが少ないときはきれいに割る：その残り全員で 1 グループ
  if (remaining <= maxSize) {
    // minSize が 1 より大きい場合にも一応対応
    return Math.max(minSize, remaining);
  }

  const lo = minSize;
  const hi = maxSize;

  // 平均（頂点）になるサイズ
  let mu = AGS.PREFERRED_GROUP_SIZE;
  if (mu < lo || mu > hi) {
    // もし設定が範囲外なら、真ん中にフォールバック
    mu = (lo + hi) / 2;
  }

  // σ はレンジに対してそこそこ広めに（調整したかったらここをいじる）
  let sigma = (hi - lo) / 3;
  if (sigma <= 0) sigma = 1;

  const sizes = [];
  const weights = [];
  let total = 0;

  // lo〜hi の整数サイズに対してガウスっぽい重みをつける
  for (let s = lo; s <= hi && s <= remaining; s++) {
    const x = (s - mu) / sigma;
    const w = Math.exp(-0.5 * x * x); // e^{-(x^2)/2}
    sizes.push(s);
    weights.push(w);
    total += w;
  }

  // 念のため
  if (sizes.length === 0) {
    return Math.min(maxSize, Math.max(minSize, remaining));
  }

  // 重み付きランダムサンプリング
  let r = Math.random() * total;
  for (let i = 0; i < sizes.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return sizes[i];
    }
  }

  // 浮動小数誤差で落ちたときのフォールバック
  return sizes[sizes.length - 1];
}

// -----------------------------
// 自動生成ラッパ
// -----------------------------
function doAutoGenerate() {
  suppressRecompute = true;
  try {
    doAutoGenerateMain();
  } finally {
    suppressRecompute = false;
    recomputeAndDraw();
  }
}

// -----------------------------
// 自動生成本体
// ①〜⑤を実装
// -----------------------------
function doAutoGenerateMain() {
  // 既存データをリセット
  resetAll(); // people, friendsMap, groups, nextGroupId などが空になる

  // ===== ① 総人数を決める（10〜20人） =====
  const N =
    AGS.MIN_PEOPLE +
    Math.floor(Math.random() * (AGS.MAX_PEOPLE - AGS.MIN_PEOPLE + 1));

  const baseChar = "A".charCodeAt(0);
  for (let i = 0; i < N; i++) {
    const name = String.fromCharCode(baseChar + i);
    addPerson(name); // people[], friendsMap に反映
  }

  // ===== ② グループ分け（2〜6人、重複所属なし） =====
  // インデックスをシャッフルしてから順にグループ化
  const indices = Array.from({ length: N }, (_, i) => i);
  indices.sort(() => Math.random() - 0.5);

  // グループ定義（UI用の groups とは別の内部構造）
  const groupDefs = []; // { members: string[], weight: number }

  let pos = 0;
  while (pos < N) {
    const remaining = N - pos;

    // ★ 重み付きでサイズを決める
    const size = pickGroupSize(remaining);

    const members = [];
    for (let k = 0; k < size && pos < N; k++, pos++) {
      members.push(people[indices[pos]]);
    }

    const groupWeight = round2(AGS.GROUP_WEIGHT_MIN + Math.random() * (AGS.GROUP_WEIGHT_MAX - AGS.GROUP_WEIGHT_MIN));
    groupDefs.push({ members, weight: groupWeight });
  }

  // 人→グループ番号
  const personToGroupIndex = new Map();
  groupDefs.forEach((g, gi) => {
    for (const name of g.members) {
      personToGroupIndex.set(name, gi);
    }
  });
  
  // ===== 補助：ある人の「所属グループ内」での最大親密度を調べる =====
  function maxIntraWeightForPerson(name, groupMemberSet) {
    const m = friendsMap.get(name);
    if (!m) return 0;
    let maxW = 0;
    for (const [other, w] of m.entries()) {
      if (groupMemberSet.has(other) && w > maxW) {
        maxW = w;
      }
    }
    return maxW;
  }

  // ===== ③ グループ内の友達生成 =====
  // 「グループの親密度も考慮しつつ、それっぽい」感じ
  function addOrUpdateFriendship(a, b, weight) {
    if (!a || !b || a === b) return;
    if (!friendsMap.has(a)) friendsMap.set(a, new Map());
    if (!friendsMap.has(b)) friendsMap.set(b, new Map());

    const mapA = friendsMap.get(a);
    const prev = mapA.get(b);
    const wRaw = prev != null ? (prev + weight) / 2 : weight;
    const w = round2(wRaw);  // 小数第2位まで丸め

    mapA.set(b, w);
    friendsMap.get(b).set(a, w);

    // ★ ここを追加：このペアに「関係がある」ということを向きマップにも登録
    ensureRelationExists(a, b);
  }


  // ★ 追加：一部の関係をランダムに一方向にする
  function randomizeOneWayRelations() {
    for (const [key, rel] of relationDirMap.entries()) {
      // すでに一方向なら触らない
      if (!rel || rel.mode !== "mutual") continue;

      if (Math.random() < AGS.ONE_WAY_PROB) {
        const [nameA, nameB] = key.split("|");
        if (!people.includes(nameA) || !people.includes(nameB)) continue;

        // どっち向きにするかをランダムに決める
        const from = Math.random() < 0.5 ? nameA : nameB;
        const to = from === nameA ? nameB : nameA;

        relationDirMap.set(key, { mode: "oneway", from, to });
      }
    }
  }

  for (const group of groupDefs) {
    const members = group.members;
    const gw = group.weight;
    const m = members.length;
    if (m < 2) continue;

    // 1) 最低限連結にするために「木」を作る
    for (let i = 1; i < m; i++) {
      const a = members[i];
      const j = Math.floor(Math.random() * i); // 0〜i-1
      const b = members[j];

      // わりと強めの辺を張る
      const base = (0.9 + Math.random() * 0.5);
      addOrUpdateFriendship(a, b, base);
    }

    // 2) 追加のグループ内ペア
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const a = members[i];
        const b = members[j];

        // 小さいグループほど少しだけ密度アップ
        const sizeFactorBase =
          m <= 3
            ? AGS.INTRA_EXTRA_SMALL_DENSITY
            : m <= 4
            ? AGS.INTRA_EXTRA_MEDIUM_DENSITY
            : AGS.INTRA_EXTRA_LARGE_DENSITY;
        const sizeFactor = gw * sizeFactorBase;

        if (Math.random() < sizeFactor) {
          const t = Math.random();
          let w;
          if (t < 1 - AGS.INTRA_STRONG_EDGE_PROB) {
            // 弱め：主に点線側に落ちやすい領域（0.4〜0.7）
            w = 0.4 + Math.random() * 0.3;
          } else {
            // 強め：実線になりやすい領域（0.7〜1.4）
            w = 0.7 + Math.random() * 0.7;
          }
          addOrUpdateFriendship(a, b, w);
        }
      }
    }
  }

  // ===== ④ グループ間での友達生成 =====
  if (groupDefs.length >= 2) {
    for (let gi = 0; gi < groupDefs.length; gi++) {
      for (let gj = gi + 1; gj < groupDefs.length; gj++) {
        const g1 = groupDefs[gi];
        const g2 = groupDefs[gj];
        const m1 = g1.members.length;
        const m2 = g2.members.length;
        if (m1 === 0 || m2 === 0) continue;

        const set1 = new Set(g1.members);
        const set2 = new Set(g2.members);

        for (let i = 0; i < m1; i++) {
          const a = g1.members[i];
          for (let j = 0; j < m2; j++) {
            const b = g2.members[j];

            const prob = AGS.BASE_CROSS_PROB;

            if (Math.random() >= prob) continue;

            // a, b がそれぞれ「自分のグループ内」で持っている最大親密度
            const maxA = maxIntraWeightForPerson(a, set1);
            const maxB = maxIntraWeightForPerson(b, set2);
            let baseMax = Math.min(maxA, maxB);

            // まだグループ内の関係がほぼ無いときは、グループ重みを基準にする
            if (baseMax <= 0) {
              baseMax = 1;
            }

            let w;
            const t = Math.random();
            // 「強い関係」になる確率 = AGS.CROSS_STRONG_EDGE_PROB
            if (t < 1 - AGS.CROSS_STRONG_EDGE_PROB) {
              // 多くのケース：自分のグループ内での最大親密度以下
              const low = baseMax * 0.4;
              const high = baseMax;
              w = round2(low + Math.random() * (high - low));
            } else {
              // 稀なケース：それを少しだけ上回る（〜1.2倍くらい）
              const low = baseMax * 0.8;
              const high = baseMax * 1.2;
              w = round2(low + Math.random() * (high - low));
            }

            addOrUpdateFriendship(a, b, w);
          }
        }
      }
    }
  }

  // ===== ⑤ グループ登録（二人グループは登録しない） =====
  groups.length = 0;
  nextGroupId = 1;
  selectedGroupId = null;

  for (const g of groupDefs) {
    if (g.members.length < 2) {
      // 1人だけのグループは登録しない
      continue;
    }
    const id = nextGroupId++;
    groups.push({
      id,
      members: new Set(g.members),
      weight: g.weight,
    });
  }

  randomizeOneWayRelations();

  // ===== UI 更新 =====
  if (listOpen) {
    renderPeople();
    renderFriendsPanel();
  }
  if (typeof renderGroupList === "function") {
    renderGroupList();
  }
  if (typeof renderGroupSettings === "function") {
    renderGroupSettings();
  }
  if (typeof flashDialogStatus === "function") {
    flashDialogStatus("自動生成しました。");
  }
}

// HTML を定義配列から自動生成
function buildAutogenSettingsForm() {
  if (!autogenSettingsBody) return;
  autogenSettingsBody.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "autogen-settings-grid";

  AUTOGEN_SETTING_DEFS.forEach((def) => {
    const row = document.createElement("div");
    row.className = "autogen-setting-row";

    const label = document.createElement("label");
    label.textContent = def.label;

    const input = document.createElement("input");
    input.type = def.type || "number";
    if (def.min != null) input.min = String(def.min);
    if (def.max != null) input.max = String(def.max);
    if (def.step != null) input.step = String(def.step);

    const current = AUTOGEN_SETTINGS[def.key];
    const val =
      current != null ? current : def.default != null ? def.default : "";
    input.value = String(val);

    input.addEventListener("change", () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) return;
      if (def.min != null) v = Math.max(def.min, v);
      if (def.max != null) v = Math.min(def.max, v);
      if (def.integer) v = Math.round(v);

      AUTOGEN_SETTINGS[def.key] = v;
      input.value = String(v);
    });

    row.appendChild(label);
    row.appendChild(input);
    grid.appendChild(row);
  });

  autogenSettingsBody.appendChild(grid);
}

function openAutogenSettingsDialog() {
  if (!autogenSettingsOverlay) return;
  autogenSettingsOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";
  buildAutogenSettingsForm();
}

function closeAutogenSettingsDialog() {
  if (!autogenSettingsOverlay) return;
  autogenSettingsOverlay.style.display = "none";
  document.body.style.overflow = "";
}

// デフォルトに戻す
function resetAutogenSettingsToDefault() {
  for (const key in AUTOGEN_SETTINGS_DEFAULT) {
    AUTOGEN_SETTINGS[key] = AUTOGEN_SETTINGS_DEFAULT[key];
  }
  buildAutogenSettingsForm();
}

// イベント設定
if (autogenSettingsBtn) {
  autogenSettingsBtn.addEventListener("click", openAutogenSettingsDialog);
}
if (autogenSettingsCloseBtn) {
  autogenSettingsCloseBtn.addEventListener("click", closeAutogenSettingsDialog);
}
if (autogenSettingsOverlay) {
  autogenSettingsOverlay.addEventListener("click", (e) => {
    if (e.target === autogenSettingsOverlay) {
      closeAutogenSettingsDialog();
    }
  });
}
if (autogenSettingsResetBtn) {
  autogenSettingsResetBtn.addEventListener("click", resetAutogenSettingsToDefault);
}
