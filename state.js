// -----------------------------
// 状態
// -----------------------------
const people = []; // ["A","B",...]
const friendsMap = new Map(); // name -> Map(friendName -> weight>0)
// 向き情報: "A|B" -> { mode: 'mutual' } または { mode: 'oneway', from: 'A', to: 'B' }
const relationDirMap = new Map();

// ★ 追加：グループ
const groups = []; // { id: number, members: Set<string>, weight: number }
let nextGroupId = 1;
let selectedGroupId = null;
let listOpen = false;
let selectedPerson = null;

function makePairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}


// a-b の関係が現在どういう向きかを返す。
// 返り値: "mutual" | "a_to_b" | "b_to_a"
function getPairDirection(a, b) {
  const key = makePairKey(a, b);
  const rel = relationDirMap.get(key);

  // 向き情報がなければ「mutual」とみなす
  if (!rel || rel.mode === "mutual") {
    return "mutual";
  }
  if (rel.mode === "oneway") {
    if (rel.from === a && rel.to === b) return "a_to_b";
    if (rel.from === b && rel.to === a) return "b_to_a";
  }
  // 想定外はとりあえず mutual 扱い
  return "mutual";
}

// a-b の関係を「重み＋向き」を含めて設定する。
// type: "mutual" | "a_to_b" | "b_to_a"
function setPairFriendshipWithDirection(a, b, weight, type) {
  setPairFriendship(a, b, weight);

  const key = makePairKey(a, b);

  if (type === "a_to_b") {
    relationDirMap.set(key, { mode: "oneway", from: a, to: b });
  } else if (type === "b_to_a") {
    relationDirMap.set(key, { mode: "oneway", from: b, to: a });
  } else {
    // "mutual" か不正値 → 双方向扱い
    relationDirMap.set(key, { mode: "mutual" });
  }
}

// owner 視点でのモードを返す: "mutual" | "outgoing" | "incoming"
function getRelationMode(owner, friend) {
  const key = makePairKey(owner, friend);
  const rel = relationDirMap.get(key);
  if (!rel) return "mutual";
  if (rel.mode === "mutual") return "mutual";
  if (rel.mode === "oneway") {
    if (rel.from === owner) return "outgoing";
    if (rel.to === owner) return "incoming";
  }
  return "mutual";
}

// つながりができたとき、向き情報がまだ無ければ「双方向」として登録
function ensureRelationExists(owner, friend) {
  const key = makePairKey(owner, friend);
  if (!relationDirMap.has(key)) {
    relationDirMap.set(key, { mode: "mutual" });
  }
}

// 2人の間にまったく辺が無くなったら、向き情報を消す
function clearRelationIfNoEdge(a, b) {
  const key = makePairKey(a, b);
  const mapA = friendsMap.get(a);
  const mapB = friendsMap.get(b);
  const existA = mapA && mapA.has(b);
  const existB = mapB && mapB.has(a);
  if (!existA && !existB) {
    relationDirMap.delete(key);
  }
}

function addPerson(name) {
  people.push(name);
  friendsMap.set(name, new Map());
  if (!selectedPerson) selectedPerson = name;
  if (listOpen) {
    renderPeople();
    renderFriendsPanel();
  }
  recomputeAndDraw();
}

function removePerson(name) {
  const idx = people.indexOf(name);
  if (idx >= 0) people.splice(idx, 1);
  friendsMap.delete(name);
  for (const set of friendsMap.values()) set.delete(name);

  // ★ 追加：グループからも外す
  for (const g of groups) {
    g.members.delete(name);
  }

  if (selectedPerson === name) {
    selectedPerson = people.length > 0 ? people[0] : null;
  }
  if (listOpen) {
    renderPeople();
    renderFriendsPanel();
  }
  // グループダイアログが開いている場合も更新
  renderGroupList();
  renderGroupSettings();
  recomputeAndDraw();
}

function resetAll() {
  people.length = 0;
  friendsMap.clear();
  selectedPerson = null;
  groups.length = 0;
  nextGroupId = 1;
  selectedGroupId = null;
  relationDirMap.clear();
}

function setFriends(owner, entries) {
  // entries: [{ friend: string, weight: number }, ...]
  if (!friendsMap.has(owner)) friendsMap.set(owner, new Map());
  const prev = friendsMap.get(owner);
  const next = new Map();

  // 新しい一覧
  for (const { friend, weight } of entries) {
    if (!friend || friend === owner) continue;
    const w = weight > 0 ? weight : 1;
    next.set(friend, w);
  }

  // 外れた相手から owner を削除し、必要なら向き情報も削除
  prev.forEach((_, f) => {
    if (!next.has(f)) {
      if (!friendsMap.has(f)) friendsMap.set(f, new Map());
      friendsMap.get(f).delete(owner);
      clearRelationIfNoEdge(owner, f); // ★ 追加
    }
  });

  // 追加・更新された相手側に owner を追加（重みも揃える）
  next.forEach((w, f) => {
    if (!friendsMap.has(f)) friendsMap.set(f, new Map());
    friendsMap.get(f).set(owner, w);
    ensureRelationExists(owner, f);    // ★ 追加：デフォルトは双方向
  });

  friendsMap.set(owner, next);
}

function setPairFriendship(a, b, weight) {
  if (!a || !b || a === b) return;
  const w = weight > 0 ? weight : 1;
  if (!friendsMap.has(a)) friendsMap.set(a, new Map());
  if (!friendsMap.has(b)) friendsMap.set(b, new Map());
  friendsMap.get(a).set(b, w);
  friendsMap.get(b).set(a, w);
  ensureRelationExists(a, b); // ★ 追加：サンプルや自動生成でも向き情報を持つ
}
