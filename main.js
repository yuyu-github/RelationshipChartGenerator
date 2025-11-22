// -----------------------------
// 人の追加・サンプル
// -----------------------------
addBtn.addEventListener("click", () => {
  const name = (nameInput.value || "").trim();
  if (!name) return;
  if (people.includes(name)) {
    flashDialogStatus("同じ名前が既にあります。", true);
    return;
  }
  addPerson(name);
  nameInput.value = "";
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

autogenBtn.addEventListener("click", () => {
  if (people.length > 0 || groups.length > 0) {
    // 既存データがある場合は確認ダイアログ
    openConfirmDialog(
      "既存の人物やグループを消して自動生成しますか？",
      () => {
        doAutoGenerate();
      },
      {
        okLabel: "生成",
        okType: "primary",
      }
    );
  } else {
    // 何もないときはそのまま生成
    doAutoGenerate();
  }
});

addGroupBtn.addEventListener("click", () => {
  const id = nextGroupId++;
  groups.push({
    id,
    members: new Set(), // 所属する人の名前
    weight: 1, // グループの親密度（重心への引力の強さ）
  });
  if (!selectedGroupId) selectedGroupId = id;
  renderGroupList();
  renderGroupSettings();
});

canvasWEl.addEventListener("input", () => redraw());
canvasHEl.addEventListener("input", () => redraw());
dashedThresholdEl.addEventListener("change", () => redraw());
idealEdgeLenEl.addEventListener("change", () => recomputeAndDraw());
generationCountEl.addEventListener("change", () => recomputeAndDraw());
iterationsEl.addEventListener("change", () => recomputeAndDraw());

// ★ 自動描画の同時実行を防ぐためのフラグ
let recomputeRunning = false;
let recomputeAgain = false;
// ★ 自動再描画を一時的に止めるためのフラグ
let suppressRecompute = false;

function recomputeAndDraw() {
  if (suppressRecompute) return;

  // すでに計算中なら「あとでもう一回」のフラグだけ立てて即 return
  if (recomputeRunning) {
    recomputeAgain = true;
    return;
  }
  recomputeRunning = true;
  recomputeAgain = false;

  // イベントループを一回譲ってから本体を実行
  setTimeout(async () => {
    try {
      await recomputeAndDrawMain();
    } finally {
      recomputeRunning = false;
      if (recomputeAgain) {
        // 途中でさらに recomputeAndDraw が呼ばれていたら 1 回だけ再実行
        recomputeAndDraw();
      }
    }
  }, 0);
}

// =============================
// エキスポート：people + friendships + groups を JSON で保存
// =============================
exportBtn.addEventListener("click", () => {
  if (people.length === 0 && groups.length === 0) {
    flashStatus("エクスポートするデータがありません。", true);
    return;
  }

  // 友情（無向ペア）を一意に列挙＋向き情報付き
  const friendships = [];
  const seen = new Set();
  for (const [name, m] of friendsMap.entries()) {
    for (const [friend, w] of m.entries()) {
      const a = String(name);
      const b = String(friend);
      const key = a < b ? `${a}::${b}` : `${b}::${a}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const weight = Number.isFinite(w) ? w : 1;
      const type = getPairDirection(a, b); // "both" | "a_to_b" | "b_to_a"

      friendships.push({
        a,
        b,
        weight,
        type,
      });
    }
  }

  // グループ（内部 groups 配列そのまま。ただしメンバー名だけにする）
  const groupData = groups.map((g) => ({
    members: Array.from(g.members),
    weight: Number.isFinite(g.weight) && g.weight > 0 ? g.weight : 1,
  }));

  const data = {
    version: 2,       // 一応バージョン番号
    people: [...people],
    friendships,
    groups: groupData,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "correlation-list.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  flashStatus("リストをエキスポートしました。");
});

// =============================
// インポート：ボタン押下でファイル選択を開く
// =============================
importBtn.addEventListener("click", () => {
  importFileInput.click();
});

// =============================
// インポート本体
// =============================
importFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const data = JSON.parse(text);

      if (!data || !Array.isArray(data.people)) {
        throw new Error("invalid format");
      }

      const peopleArr = data.people
        .map((x) => String(x))
        .filter((x) => x.trim() !== "");

      // friendships は [{a,b,weight,type?}, ...] 想定（無くてもOK）
      const friendships = Array.isArray(data.friendships)
        ? data.friendships
        : [];

      // groups は [{members:[...], weight}] 想定（無くてもOK）
      const groupsArr = Array.isArray(data.groups) ? data.groups : [];

      // 一括反映：描画は最後に 1 回だけ
      suppressRecompute = true;
      try {
        resetAll(); // people, friendsMap, groups, relationDirMap などをクリア

        // --- 人物を復元 ---
        for (const name of peopleArr) {
          if (people.includes(name)) continue;
          people.push(name);
          friendsMap.set(name, new Map());
        }
        selectedPerson = people.length > 0 ? people[0] : null;

        // --- 友情を復元（向き付き） ---
        for (const f of friendships) {
          const a = String(f.a);
          const b = String(f.b);
          if (!people.includes(a) || !people.includes(b)) continue;

          const wRaw = Number(f.weight);
          const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

          let type = f.type;
          if (type !== "a_to_b" && type !== "b_to_a" && type !== "mutual") {
            // 古いデータなど type がなければ mutual 扱い
            type = "mutual";
          }

          setPairFriendshipWithDirection(a, b, w, type);
        }

        // --- グループを復元 ---
        groups.length = 0;
        nextGroupId = 1;
        selectedGroupId = null;

        for (const g of groupsArr) {
          const membersRaw = Array.isArray(g.members) ? g.members : [];
          const members = membersRaw
            .map((x) => String(x))
            .filter((name) => people.includes(name));

          if (members.length === 0) continue; // 空グループはスキップ

          const id = nextGroupId++;
          const wRaw = Number(g.weight);
          const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

          groups.push({
            id,
            members: new Set(members),
            weight: w,
          });
        }

        if (groups.length > 0) {
          selectedGroupId = groups[0].id;
        }
      } finally {
        suppressRecompute = false;
      }

      // --- UI を再描画 ---
      if (listOpen) {
        renderPeople();
        renderFriendsPanel();
      }
      if (groupOverlay && groupOverlay.style.display === "flex") {
        renderGroupList();
        renderGroupSettings();
      }

      recomputeAndDraw();
      flashStatus("リストをインポートしました。");
    } catch (err) {
      console.error(err);
      flashStatus("インポートに失敗しました。", true);
    } finally {
      // 同じファイルを続けて選べるように
      importFileInput.value = "";
    }
  };
  reader.readAsText(file);
});


// PNG保存（レイアウトが縮小されている場合は高解像度で描き直してから保存）
saveBtn.addEventListener("click", () => {
  // まだ一度もレイアウトされていない場合は保存しない
  if (!lastLayoutNodes || !lastLayoutEdges) {
    flashStatus("まだ相関図が描画されていません", true);
    return;
  }

  // 現在の設定値から基準のキャンバスサイズを取得
  const baseW = clamp(int(canvasWEl.value, 1000), 400, 2000);
  const baseH = clamp(int(canvasHEl.value, 600), 300, 2000);

  // 今のレイアウトをそのキャンバスに載せたときの scale を計算
  const { scale } = computeLayoutTransform(lastLayoutNodes, baseW, baseH);

  // エクスポート用キャンバスサイズ
  let exportW = baseW;
  let exportH = baseH;

  if (scale > 0) {
    // どれくらい縮小されているかの逆数だけキャンバスを大きくする
    const factor = Math.min(12, 2 / scale);
    exportW = Math.round(baseW * factor);
    exportH = Math.round(baseH * factor);
  }

  // 画面用のサイズを覚えておく
  const prevW = canvas.width;
  const prevH = canvas.height;

  // 高解像度キャンバスに描き直してからエクスポート
  drawGraph(lastLayoutNodes, lastLayoutEdges, exportW, exportH);
  const url = canvas.toDataURL("image/png");

  // 画面表示用に元のサイズに戻す
  drawGraph(lastLayoutNodes, lastLayoutEdges, prevW, prevH);

  // ダウンロード
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.png";
  a.click();
});
