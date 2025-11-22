// -----------------------------
// 要素参照
// -----------------------------
const listToggleBtn = document.getElementById("listToggleBtn");
const listOverlay = document.getElementById("listOverlay");
const listCloseBtn = document.getElementById("listCloseBtn");

const groupToggleBtn = document.getElementById("groupToggleBtn");
const groupOverlay = document.getElementById("groupOverlay");
const groupCloseBtn = document.getElementById("groupCloseBtn");
const addGroupBtn = document.getElementById("addGroupBtn");
const groupListEl = document.getElementById("groupList");
const groupSettingsPanel = document.getElementById("groupSettingsPanel");

const importBtn = document.getElementById("importBtn");      // ★ 追加
const exportBtn = document.getElementById("exportBtn");      // ★ 追加
const importFileInput = document.getElementById("importFileInput"); // ★ 追加

const nameInput = document.getElementById("nameInput");
const addBtn = document.getElementById("addBtn");
const autogenBtn = document.getElementById("autogenBtn");
const peopleList = document.getElementById("peopleList");
const peopleCount = document.getElementById("peopleCount");
const friendsPanel = document.getElementById("friendsPanel");

const iterationsEl = document.getElementById("iterations");
const canvasWEl = document.getElementById("canvasW");
const canvasHEl = document.getElementById("canvasH");
const idealEdgeLenEl = document.getElementById("idealEdgeLen");
const generationCountEl = document.getElementById("generationCount");
const advancedToggleBtn = document.getElementById("advancedToggleBtn"); // ★追加
const advancedSettings = document.getElementById("advancedSettings"); // ★追加
const dashedThresholdEl = document.getElementById("dashedThreshold");

const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const dialogStatusEl = document.getElementById("dialogStatus");

const confirmOverlay = document.getElementById("confirmOverlay");
const confirmMessageEl = document.getElementById("confirmMessage");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmCloseBtn = document.getElementById("confirmCloseBtn");

const autogenSettingsBtn = document.getElementById("autogenSettingsBtn");
const autogenSettingsOverlay = document.getElementById("autogenSettingsOverlay");
const autogenSettingsCloseBtn = document.getElementById("autogenSettingsCloseBtn");
const autogenSettingsBody = document.getElementById("autogenSettingsBody");
const autogenSettingsResetBtn = document.getElementById("autogenSettingsResetBtn");

const edgeStatsEl = document.getElementById("edgeStats");
const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");

let advancedOpen = false; // ★追加

advancedToggleBtn.addEventListener("click", () => {
  advancedOpen = !advancedOpen;
  advancedSettings.style.display = advancedOpen ? "grid" : "none";
  advancedToggleBtn.textContent = advancedOpen
    ? "詳細設定を閉じる"
    : "詳細設定";
});

// -----------------------------
// リストダイアログの開閉
// -----------------------------
function openListDialog() {
  if (listOpen) return;
  listOpen = true;
  listOverlay.style.display = "flex";
  document.body.style.overflow = "hidden"; // ★ 追加
  renderPeople();
  renderFriendsPanel();
}

function closeListDialog() {
  if (!listOpen) return;
  listOpen = false;
  listOverlay.style.display = "none";
  document.body.style.overflow = ""; // ★ 追加
  friendsPanel.innerHTML = "";
}

listToggleBtn.addEventListener("click", openListDialog);
listCloseBtn.addEventListener("click", closeListDialog);

listOverlay.addEventListener("click", (e) => {
  if (e.target === listOverlay) {
    closeListDialog();
  }
});

function openGroupDialog() {
  if (groupOverlay.style.display === "flex") return;
  groupOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";
  renderGroupList();
  renderGroupSettings();
}

function closeGroupDialog() {
  if (groupOverlay.style.display !== "flex") return;
  groupOverlay.style.display = "none";
  document.body.style.overflow = "";
  groupSettingsPanel.innerHTML = "";
}

groupToggleBtn.addEventListener("click", openGroupDialog);
groupCloseBtn.addEventListener("click", closeGroupDialog);

groupOverlay.addEventListener("click", (e) => {
  if (e.target === groupOverlay) {
    closeGroupDialog();
  }
});

// -----------------------------
// 人リストの描画
// -----------------------------
function renderPeople() {
  if (!listOpen) return;

  if (people.length === 0) {
    peopleList.innerHTML = "（まだ人がいません）";
    if (peopleCount) peopleCount.textContent = "（0人）";
    return;
  }

  // ★ 書き換え前にスクロール位置を保存
  let prevScroll = 0;
  const prevListEl = peopleList.querySelector(".person-list");
  if (prevListEl) {
    prevScroll = prevListEl.scrollTop;
  }

  let html = '<div class="person-list">';
  for (const name of people) {
    const cls = "person-item" + (name === selectedPerson ? " selected" : "");
    html += `
      <div class="${cls}" data-name="${escapeHTML(name)}">
        <span class="person-item-name">${escapeHTML(name)}</span>
        <button type="button" class="mini danger" data-del="${escapeHTML(
          name
        )}">削除</button>
      </div>
    `;
  }
  html += "</div>";
  peopleList.innerHTML = html;

  if (peopleCount) {
    peopleCount.textContent = `（${people.length}人）`;
  }

  // ★ 新しいリストにスクロール位置を復元
  const newListEl = peopleList.querySelector(".person-list");
  if (newListEl) {
    newListEl.scrollTop = prevScroll;
  }

  // クリックで選択
  peopleList.querySelectorAll(".person-item").forEach((item) => {
    item.addEventListener("click", () => {
      const name = item.dataset.name;
      selectedPerson = name;
      renderPeople();
      renderFriendsPanel();
    });
  });

  // 削除ボタン
  peopleList.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePerson(btn.dataset.del);
    });
  });
}
// -----------------------------
// 仲良い人の設定UI
// -----------------------------
function renderFriendsPanel() {
  friendsPanel.innerHTML = "";
  if (!listOpen) return;
  if (people.length === 0) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "まず人を追加してください。";
    friendsPanel.appendChild(div);
    return;
  }
  if (!selectedPerson || !people.includes(selectedPerson)) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent =
      "左のリストから人をクリックすると、その人の仲良い人を設定できます。";
    friendsPanel.appendChild(div);
    return;
  }

  const owner = selectedPerson;

  const ownerMap = friendsMap.get(owner) || new Map();
  const list = document.createElement("div");

  people.forEach((p) => {
    if (p === owner) return;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.marginBottom = "4px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.marginRight = "4px";

    const label = document.createElement("span");
    label.textContent = p;
    label.style.flex = "1";
    label.style.fontSize = "12px";

    const weightLabel = document.createElement("span");
    weightLabel.textContent = "親密度";
    weightLabel.style.fontSize = "12px";

    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.min = "0.05";
    weightInput.step = "0.05";
    weightInput.style.width = "70px";
    weightInput.style.fontSize = "12px";
    weightInput.style.padding = "3px 6px";

    const ownerMap = friendsMap.get(owner) || new Map();
    const currentW = ownerMap.get(p);
    if (currentW != null) {
      checkbox.checked = true;
      weightInput.value = String(currentW);
    } else {
      checkbox.checked = false;
      weightInput.value = "1";
    }

    // ★ ここから：向きセレクト
    const dirSelect = document.createElement("select");
    dirSelect.style.fontSize = "12px";
    dirSelect.style.padding = "2px 4px";

    const optBoth = document.createElement("option");
    optBoth.value = "mutual";
    optBoth.textContent = "双方向";

    const optOut = document.createElement("option");
    optOut.value = "outgoing";
    optOut.textContent = "一方向(自分から)";

    const optIn = document.createElement("option");
    optIn.value = "incoming";
    optIn.textContent = "一方向(相手から)";

    dirSelect.appendChild(optBoth);
    dirSelect.appendChild(optOut);
    dirSelect.appendChild(optIn);

    const mode = getRelationMode(owner, p);
    dirSelect.value = mode;

    function syncDirEnabled() {
      dirSelect.disabled = !checkbox.checked;   // ★ チェックの状態に合わせて有効/無効
    }
    syncDirEnabled();

    function applyUpdate() {
      const w = parseFloat(weightInput.value);
      if (!checkbox.checked || !(w > 0)) {
        // 関係削除
        const entries = [];
        const m = friendsMap.get(owner) || new Map();
        m.forEach((ww, f) => {
          if (f !== p) entries.push({ friend: f, weight: ww });
        });
        setFriends(owner, entries);
      } else {
        // 関係追加/更新
        const entries = [];
        const m = friendsMap.get(owner) || new Map();
        const used = new Set();
        m.forEach((ww, f) => {
          if (f === p) {
            entries.push({ friend: f, weight: w });
          } else {
            entries.push({ friend: f, weight: ww });
          }
          used.add(f);
        });
        if (!used.has(p)) {
          entries.push({ friend: p, weight: w });
        }
        setFriends(owner, entries);
      }
      renderFriendsPanel();
      recomputeAndDraw();
    }

    checkbox.addEventListener("change", () => {
      applyUpdate();
      syncDirEnabled();              // ★ チェック変化時に有効/無効を更新
    });
    weightInput.addEventListener("change", applyUpdate);

    dirSelect.addEventListener("change", () => {
      // 友達じゃないのに向きだけ変えるのは無し
      if (!checkbox.checked) {
        dirSelect.value = "mutual";
        return;
      }
      const key = makePairKey(owner, p);
      const val = dirSelect.value;

      if (val === "mutual") {
        relationDirMap.set(key, { mode: "mutual" });
      } else if (val === "outgoing") {
        relationDirMap.set(key, { mode: "oneway", from: owner, to: p });
      } else if (val === "incoming") {
        relationDirMap.set(key, { mode: "oneway", from: p, to: owner });
      }

      renderFriendsPanel();
      recomputeAndDraw();
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(dirSelect);      // ★ セレクトをここに追加
    row.appendChild(weightLabel);
    row.appendChild(weightInput);
    list.appendChild(row);
  });

  friendsPanel.appendChild(list);
}

function renderGroupList() {
  if (!groupListEl) return;

  if (groups.length === 0) {
    groupListEl.innerHTML = "（まだグループがありません）";
    return;
  }
  
  // ★ 書き換え前のスクロール位置を保存
  let prevScroll = 0;
  const prevListEl = groupListEl.querySelector(".person-list");
  if (prevListEl) {
    prevScroll = prevListEl.scrollTop;
  }

  let html = '<div class="person-list">'; // 同じ見た目を流用
  for (const g of groups) {
    const members = Array.from(g.members);
    const label = members.length
      ? members.join("・")
      : "（メンバーなし）";
    const cls = "person-item" + (g.id === selectedGroupId ? " selected" : "");
    html += `
      <div class="${cls}" data-group-id="${g.id}">
        <span class="person-item-name">${escapeHTML(label)}</span>
        <button type="button" class="mini danger" data-del-group="${g.id}">削除</button>
      </div>
    `;
  }
  html += "</div>";
  groupListEl.innerHTML = html;

  // ★ 新しいリストにスクロール位置を復元
  const newListEl = groupListEl.querySelector(".person-list");
  if (newListEl) {
    newListEl.scrollTop = prevScroll;
  }

  // 選択
  groupListEl.querySelectorAll("[data-group-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.groupId);
      selectedGroupId = id;
      renderGroupList();
      renderGroupSettings();
    });
  });

  groupListEl.querySelectorAll("button[data-del-group]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.delGroup);
      const group = groups.find((g) => g.id === id);
      const label = group
        ? group.members.size
          ? Array.from(group.members).join("・")
          : "（メンバーなし）"
        : "このグループ";

      openConfirmDialog(`グループ「${label}」を削除しますか？`, () => {
        const idx = groups.findIndex((g) => g.id === id);
        if (idx >= 0) groups.splice(idx, 1);
        if (selectedGroupId === id) {
          selectedGroupId = groups[0]?.id ?? null;
        }
        renderGroupList();
        renderGroupSettings();
        recomputeAndDraw();
      });
    });
  });
}

function renderGroupSettings() {
  if (!groupSettingsPanel) return;
  groupSettingsPanel.innerHTML = "";

  if (people.length === 0) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "まず人物を追加してください。";
    groupSettingsPanel.appendChild(div);
    return;
  }

  if (!selectedGroupId) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "左のグループ一覧から選択してください。";
    groupSettingsPanel.appendChild(div);
    return;
  }

  const group = groups.find((g) => g.id === selectedGroupId);
  if (!group) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "有効なグループがありません。";
    groupSettingsPanel.appendChild(div);
    return;
  }

  // メンバー設定
  const memberTitle = document.createElement("div");
  memberTitle.className = "friend-owner-name";
  memberTitle.textContent = "グループメンバー";
  groupSettingsPanel.appendChild(memberTitle);

  const memberList = document.createElement("div");

  people.forEach((name) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.marginBottom = "4px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = group.members.has(name);

    const label = document.createElement("span");
    label.textContent = name;
    label.style.fontSize = "12px";

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        group.members.add(name);
      } else {
        group.members.delete(name);
      }
      renderGroupList(); // 表示名（メンバー一覧）更新
      recomputeAndDraw();
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    memberList.appendChild(row);
  });

  groupSettingsPanel.appendChild(memberList);

  // 親密度（重心への引力）設定
  const weightWrap = document.createElement("div");
  weightWrap.style.marginTop = "8px";
  weightWrap.style.display = "flex";
  weightWrap.style.alignItems = "center";
  weightWrap.style.gap = "8px";

  const weightLabel = document.createElement("span");
  weightLabel.textContent = "グループの親密度";
  weightLabel.style.fontSize = "12px";

  const weightInput = document.createElement("input");
  weightInput.type = "number";
  weightInput.min = "0.05";
  weightInput.step = "0.05";
  weightInput.style.width = "80px";
  weightInput.style.fontSize = "12px";
  weightInput.style.padding = "3px 6px";
  weightInput.value = String(group.weight ?? 1);

  weightInput.addEventListener("change", () => {
    const v = parseFloat(weightInput.value);
    group.weight = v > 0 ? v : 1;
    recomputeAndDraw();
  });

  weightWrap.appendChild(weightLabel);
  weightWrap.appendChild(weightInput);
  groupSettingsPanel.appendChild(weightWrap);
}

let statusTimerId = null; // ★ 追加：メイン用タイマーID
let dialogStatusTimerId = null; // ★ 追加：ダイアログ用タイマーID

function flashStatus(msg, isErr = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isErr ? "#b91c1c" : "var(--muted)";

  if (statusTimerId !== null) {
    clearTimeout(statusTimerId);
  }
  statusTimerId = setTimeout(() => {
    statusEl.textContent = "";
    statusTimerId = null;
  }, 5000);
}

function flashDialogStatus(msg, isErr = false) {
  if (!dialogStatusEl) return;
  dialogStatusEl.textContent = msg;
  dialogStatusEl.style.color = isErr ? "#b91c1c" : "var(--muted)";

  if (dialogStatusTimerId !== null) {
    clearTimeout(dialogStatusTimerId);
  }
  dialogStatusTimerId = setTimeout(() => {
    dialogStatusEl.textContent = "";
    dialogStatusTimerId = null;
  }, 5000);
}

let confirmHandler = null;

// ★ 変更版：okLabel / okType を指定できるようにする
// okType: "danger" | "primary" | "ghost" くらいを想定（省略時は primary）
function openConfirmDialog(message, onConfirm, options = {}) {
  const { okLabel = "削除", okType = "danger" } = options;

  confirmHandler = onConfirm;
  confirmMessageEl.textContent = message;

  // ラベル変更
  confirmOkBtn.textContent = okLabel;

  // クラス変更（色）
  confirmOkBtn.classList.remove("danger", "ghost");

  if (okType === "danger") {
    confirmOkBtn.classList.add("danger"); // 赤ボタン
  } else if (okType === "ghost") {
    confirmOkBtn.classList.add("ghost"); // ゴーストボタン
  } else {
    // primary（デフォルト）：特にクラス追加せず、標準ボタン色（青）を使う
  }

  confirmOverlay.style.display = "flex";
}

function closeConfirmDialog() {
  confirmOverlay.style.display = "none";
  confirmHandler = null;
}

confirmOkBtn.addEventListener("click", () => {
  if (confirmHandler) confirmHandler();
  closeConfirmDialog();
});

confirmCancelBtn.addEventListener("click", closeConfirmDialog);
confirmCloseBtn.addEventListener("click", closeConfirmDialog);

confirmOverlay.addEventListener("click", (e) => {
  if (e.target === confirmOverlay) {
    closeConfirmDialog();
  }
});
