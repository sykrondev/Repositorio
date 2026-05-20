import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import {
  getDatabase,
  ref,
  push,
  remove,
  update,
  onValue,
  serverTimestamp
} from "firebase/database";

/* Firebase */
const firebaseConfig = {
  apiKey: "AIzaSyCPGbQe6KxUJ7WgAii2zTuJvTav_Q9hDng",
  authDomain: "toshiro-69514.firebaseapp.com",
  databaseURL: "https://toshiro-69514-default-rtdb.firebaseio.com",
  projectId: "toshiro-69514",
  storageBucket: "toshiro-69514.firebasestorage.app",
  messagingSenderId: "790165229444",
  appId: "1:790165229444:web:afe29b17ac4a87c72d97d1",
  measurementId: "G-H7FPR08S0Y"
};

const app = initializeApp(firebaseConfig);
isSupported().then(ok => ok && getAnalytics(app)).catch(() => {});

const auth = getAuth(app);
const db = getDatabase(app);

const $ = selector => document.querySelector(selector);

const repo = $("#repo");
const status = $("#firebaseStatus");
const addLinkBtn = $("#addLinkBtn");
const addCategoryBtn = $("#addCategoryBtn");
const editCategoryBtn = $("#editCategoryBtn");
const notesToggleBtn = $("#notesToggleBtn");
const logoutBtn = $("#logoutBtn");
const adminLock = $("#adminLock");
const loginMsg = $("#loginMsg");
const sessionToast = $("#sessionToast");
const filtersEl = $("#filters");
const categoryInput = $("#categoryInput");
const linksRef = ref(db, "links");
const categoriesRef = ref(db, "categories");
const notesRef = ref(db, "notes");
const tracksRef = ref(db, "tracks");
const musicPlayerEl = $("#musicPlayer");
const notesWin = $("#notesWin");
const noteForm = $("#noteForm");
const noteTitle = $("#noteTitle");
const noteContent = $("#noteContent");
const notesList = $("#notesList");
const pasteNoteBtn = $("#pasteNoteBtn");

const baseCategories = [
  "misc",
  "juegos",
  "educación",
  "streaming legal",
  "streaming ilegal",
  "noticias",
  "bancos",
  "reddit",
  "github"
];

let user = null;
let liveLinks = [];
let liveCategories = [];
let liveNotes = [];
let currentFilter = "todos";
let editingId = null;
let categoryEditorMode = "create";
let editingCategoryName = null;
let managingCategoryName = null;
let searchQuery = "";
let viewMode = localStorage.getItem("toshiro-view") || "grid";
let lastDeletedLink = null;
let undoTimer = null;

const LS_PINS = "toshiro-pins";
const LS_CLICKS = "toshiro-clicks";
const LS_VOL = "toshiro-volume";

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

let pins = new Set(loadJSON(LS_PINS, []));
let clicks = loadJSON(LS_CLICKS, {});

/* Cybercore fixed — theme cycle removed */

/* Video background eliminated for performance */

/* Live Chile clock (es-CL, America/Santiago) */
(() => {
  const el = document.getElementById("liveClock");
  if (!el) return;

  const dayFmt = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const timeFmt = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const tick = () => {
    const now = new Date();
    const date = dayFmt.format(now).replace(/\./g, "").toUpperCase();
    const time = timeFmt.format(now);
    el.textContent = `${date} · ${time} CLT`;
  };

  tick();
  setInterval(tick, 1000);
})();

/* Auth */
onAuthStateChanged(auth, currentUser => {
  const hadUser = Boolean(user);
  user = currentUser;

  addLinkBtn.classList.toggle("hidden", !user);
  addCategoryBtn.classList.toggle("hidden", !user);
  editCategoryBtn.classList.toggle("hidden", !user);
  $("#bulkAddBtn").classList.toggle("hidden", !user);
  $("#exportBtn").classList.toggle("hidden", !user);
  $("#importBtn").classList.toggle("hidden", !user);
  logoutBtn.classList.toggle("hidden", !user);
  adminLock.classList.toggle("hidden", Boolean(user));
  adminLock.setAttribute("aria-expanded", "false");

  if (user) {
    $("#loginWin").classList.add("hidden");
    loginMsg.classList.remove("error");
    loginMsg.textContent = "Sesion iniciada.";
    showToast("Sesion iniciada. Ya puedes editar links.");
  } else {
    closeEditor();
    closeCategoryEditor();
    closeCategoryManager();
    loginMsg.classList.remove("error");
    loginMsg.textContent = hadUser ? "Sesion cerrada." : "Ingresa para administrar links.";
    if (hadUser) showToast("Sesion cerrada.");
  }

  renderCategoryControls();
  renderLinks(getVisibleLinks());
});

/* Realtime Database */
onValue(
  notesRef,
  snapshot => {
    const data = snapshot.val();

    liveNotes = data
      ? Object.entries(data).map(([id, value]) => ({ id, ...value }))
      : [];

    renderNotes();
  },
  error => {
    console.error(error);
    renderNotes();
  }
);

onValue(
  linksRef,
  snapshot => {
    const data = snapshot.val();

    liveLinks = data
      ? Object.entries(data).map(([id, value]) => ({ id, ...value }))
      : [];

    status.textContent = "Firebase: conectado";
    renderCategoryControls();
    if (!$("#categoryManager").classList.contains("hidden")) renderCategoryManager();
    renderLinks(getVisibleLinks());
  },
  error => {
    console.error(error);
    status.textContent = "Firebase: error. Revisa rules/database.";
    renderLinks([]);
  }
);

onValue(
  categoriesRef,
  snapshot => {
    const data = snapshot.val();

    liveCategories = data
      ? Object.entries(data)
        .map(([id, value]) => ({ id, ...value }))
        .filter(category => category.name || category.previousName)
      : [];

    renderCategoryControls();
    if (!$("#categoryManager").classList.contains("hidden")) renderCategoryManager();
    renderLinks(getVisibleLinks());
  },
  error => {
    console.error(error);
    showToast("No se pudieron cargar categorías.");
  }
);

/* Filtros */
filtersEl.addEventListener("click", event => {
  const button = event.target.closest(".filter");
  if (!button) return;

  filtersEl.querySelectorAll(".filter").forEach(btn => btn.classList.remove("active"));
  button.classList.add("active");
  currentFilter = button.dataset.filter;
  renderLinks(getVisibleLinks());
});

function getVisibleLinks() {
  return filterLinks(liveLinks);
}

function filterLinks(links) {
  const q = normal(searchQuery).trim();

  return links.filter(link => {
    const category = normal(link.category || "misc");

    const matchesFilter =
      currentFilter === "todos" || category === normal(currentFilter);

    if (!matchesFilter) return false;
    if (!q) return true;

    const haystack = normal(`${link.title || ""} ${link.url || ""} ${link.category || ""}`);
    return haystack.includes(q);
  });
}

function getCategoryOptions() {
  const categoryMap = new Map();
  const renamed = getRenamedCategoryMap();
  const hidden = getHiddenCategorySet();

  baseCategories.forEach(category => {
    const clean = cleanCategoryName(category);
    const replacement = renamed.get(normal(clean));
    const nextName = replacement || clean;
    if (clean && !hidden.has(normal(clean)) && !hidden.has(normal(nextName))) {
      categoryMap.set(normal(nextName), nextName);
    }
  });

  liveCategories.forEach(category => {
    if (category.hidden) return;
    const clean = cleanCategoryName(category.name);
    if (clean) categoryMap.set(normal(clean), clean);
  });

  liveLinks.forEach(link => {
    const clean = cleanCategoryName(link.category);
    const replacement = renamed.get(normal(clean));
    const nextName = replacement || clean;
    if (clean && !hidden.has(normal(clean)) && !hidden.has(normal(nextName))) {
      categoryMap.set(normal(nextName), nextName);
    }
  });

  const baseOrder = baseCategories.map(category => normal(renamed.get(normal(category)) || category));

  return [...categoryMap.values()].sort((a, b) => {
    const ia = baseOrder.indexOf(normal(a));
    const ib = baseOrder.indexOf(normal(b));

    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;

    return ia - ib;
  });
}

function getRenamedCategoryMap() {
  const renamed = new Map();

  liveCategories.forEach(category => {
    if (category.hidden) return;
    const from = cleanCategoryName(category.previousName);
    const to = cleanCategoryName(category.name);
    if (from && to) renamed.set(normal(from), to);
  });

  return renamed;
}

function getHiddenCategorySet() {
  const hidden = new Set();

  liveCategories.forEach(category => {
    if (!category.hidden) return;

    const name = cleanCategoryName(category.name);
    const previousName = cleanCategoryName(category.previousName);
    if (name) hidden.add(normal(name));
    if (previousName) hidden.add(normal(previousName));
  });

  return hidden;
}

function getStoredCategory(categoryName) {
  const clean = normal(categoryName);
  return liveCategories.find(category =>
    normal(category.name) === clean || normal(category.previousName) === clean
  );
}

function renderCategoryControls(selectedCategory = categoryInput.value || "misc") {
  const categories = getCategoryOptions();

  if (currentFilter !== "todos" && !categories.some(category => normal(category) === normal(currentFilter))) {
    currentFilter = "todos";
  }

  filtersEl.innerHTML = [
    filterButtonTemplate("todos", "todos"),
    ...categories.map(category => filterButtonTemplate(category, category))
  ].join("");

  categoryInput.innerHTML = categories.map(category => `
    <option value="${escapeAttr(category)}">${escapeHtml(category)}</option>
  `).join("");

  categoryInput.value = categories.some(category => normal(category) === normal(selectedCategory))
    ? categories.find(category => normal(category) === normal(selectedCategory))
    : "misc";
}

function filterButtonTemplate(label, value) {
  const active = normal(currentFilter) === normal(value) ? " active" : "";
  return `<button type="button" class="filter${active}" data-filter="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

/* Notas */
notesToggleBtn.addEventListener("click", () => {
  notesWin.classList.toggle("hidden");
  if (!notesWin.classList.contains("hidden")) {
    renderNotes();
    if (user) noteTitle.focus();
  }
});

$("#closeNotes").addEventListener("click", event => {
  event.preventDefault();
  notesWin.classList.add("hidden");
});

pasteNoteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      noteContent.value = text;
      noteContent.focus();
      noteContent.setSelectionRange(noteContent.value.length, noteContent.value.length);
      showToast("Texto pegado desde el portapapeles.");
    }
  } catch (error) {
    console.error(error);
    showToast("No se pudo leer el portapapeles.");
  }
});

noteForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!user) {
    alert("Debes iniciar sesión como admin.");
    return;
  }

  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();

  if (!title || !content) return;

  await push(notesRef, {
    title,
    content,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  noteForm.reset();
  noteTitle.focus();
  showToast("Nota guardada.");
});

notesList.addEventListener("click", async event => {
  const copyButton = event.target.closest("[data-note-copy]");
  const deleteButton = event.target.closest("[data-note-delete]");
  const loadButton = event.target.closest("[data-note-load]");

  if (copyButton) {
    const note = liveNotes.find(item => item.id === copyButton.dataset.noteCopy);
    if (!note) return;
    await copyText(note.content);
    showToast("Comando copiado.");
    return;
  }

  if (loadButton) {
    const note = liveNotes.find(item => item.id === loadButton.dataset.noteLoad);
    if (!note) return;
    noteTitle.value = note.title || "";
    noteContent.value = note.content || "";
    noteTitle.focus();
    showToast("Nota cargada en el editor.");
    return;
  }

  if (deleteButton) {
    if (!user) return;
    const ok = confirm("¿Borrar esta nota?");
    if (!ok) return;
    await remove(ref(db, `notes/${deleteButton.dataset.noteDelete}`));
  }
});

/* Render */
function categoryColor(index) {
  const hue = Math.round((index * 137.508) % 360);
  const s = index % 3;
  const L = s === 0 ? "70%" : s === 1 ? "83%" : "57%";
  const C = s === 0 ? "0.21" : s === 1 ? "0.15" : "0.24";
  return `oklch(${L} ${C} ${hue})`;
}

function renderLinks(links) {
  repo.classList.toggle("view-grid", viewMode === "grid");
  repo.classList.toggle("view-list", viewMode === "list");
  repo.classList.toggle("view-compact", viewMode === "compact");

  if (!links.length) {
    const msg = searchQuery
      ? `No hay resultados para "${escapeHtml(searchQuery)}".`
      : `No hay links todavía. ${user ? "Pulsa + link para crear el primero." : ""}`;
    repo.innerHTML = `<section class="glass empty">${msg}</section>`;
    return;
  }

  const groups = {};
  const pinnedGroup = [];

  links.forEach(link => {
    if (pins.has(link.id)) {
      pinnedGroup.push(link);
      return;
    }
    const category = link.category?.trim() || "misc";
    if (!groups[category]) groups[category] = [];
    groups[category].push(link);
  });

  const sortByUsage = (a, b) => (clicks[b.id] || 0) - (clicks[a.id] || 0);
  pinnedGroup.sort(sortByUsage);
  Object.values(groups).forEach(arr => arr.sort(sortByUsage));

  const order = getCategoryOptions();

  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ia = order.findIndex(category => normal(category) === normal(a));
    const ib = order.findIndex(category => normal(category) === normal(b));

    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;

    return ia - ib;
  });

  const pinnedSection = pinnedGroup.length
    ? `<section class="category glass" style="--category-title-color:#ffd700;--category-border-color:#ffd700"><h2>★ fijados</h2>${pinnedGroup.map(linkTemplate).join("")}</section>`
    : "";

  repo.innerHTML = pinnedSection + sortedGroups.map(([category, items], index) => {
    const color = categoryColor(index);
    return `
    <section class="category glass" style="--category-title-color:${color};--category-border-color:${color}">
      <h2>${escapeHtml(category)}</h2>
      ${items.map(linkTemplate).join("")}
    </section>
  `;
  }).join("");

  const totalSections = sortedGroups.length + (pinnedGroup.length ? 1 : 0);
  repo.classList.toggle("single-cat", totalSections === 1);

  scheduleRepoLayout();
}

let repoLayoutTimer = null;

function getRepoColumnCount() {
  if (!repo || viewMode === "list") return 1;

  const gap = 10;
  const minWidth = viewMode === "compact" ? 240 : 280;
  const available = repo.clientWidth || repo.getBoundingClientRect().width || 0;
  if (!available) return 1;

  return Math.max(1, Math.floor((available + gap) / (minWidth + gap)));
}

function applyRepoLayout() {
  if (!repo) return;

  const categories = [...repo.querySelectorAll(".category")];
  if (!categories.length) return;
  if (viewMode === "list") return;
  if (categories.length === 1) return;

  const columnCount = getRepoColumnCount();
  if (columnCount <= 1) return;

  const categoryData = categories.map(category => ({
    node: category,
    height: category.getBoundingClientRect().height
  })).sort((a, b) => b.height - a.height);

  const columnsWrap = document.createElement("div");
  columnsWrap.className = "repo-columns";

  const columns = Array.from({ length: columnCount }, () => {
    const col = document.createElement("div");
    col.className = "repo-col";
    columnsWrap.appendChild(col);
    return col;
  });

  const heights = new Array(columnCount).fill(0);

  categoryData.forEach(({ node, height }) => {
    let targetIndex = 0;

    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[targetIndex]) targetIndex = i;
    }

    columns[targetIndex].appendChild(node);
    heights[targetIndex] += height + 10;
  });

  repo.innerHTML = "";
  repo.appendChild(columnsWrap);
}

function scheduleRepoLayout() {
  clearTimeout(repoLayoutTimer);
  repoLayoutTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      applyRepoLayout();
    });
  }, 40);
}

function renderNotes() {
  if (!notesList) return;

  noteForm.classList.toggle("hidden", !user);

  if (!liveNotes.length) {
    notesList.innerHTML = `
      <div class="empty notes-empty">
        ${user ? "Todavía no hay notas. Guarda un comando para tenerlo a mano." : "No hay notas guardadas."}
      </div>
    `;
    return;
  }

  notesList.innerHTML = liveNotes
    .slice()
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
    .map(noteTemplate)
    .join("");
}

function noteTemplate(note) {
  const canManage = Boolean(user);

  return `
    <article class="note-item">
      <div class="note-header">
        <b>${escapeHtml(note.title || "sin titulo")}</b>
        <div class="note-actions">
          <button type="button" class="copy" data-note-copy="${escapeAttr(note.id)}">copiar</button>
          <button type="button" data-note-load="${escapeAttr(note.id)}">cargar</button>
          ${canManage ? `<button type="button" class="delete" data-note-delete="${escapeAttr(note.id)}">borrar</button>` : ""}
        </div>
      </div>
      <pre>${escapeHtml(note.content || "")}</pre>
    </article>
  `;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (error) {
    console.warn(error);
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.left = "-9999px";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

function linkTemplate(link) {
  const host = getHost(link.url);
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const canManage = Boolean(user);
  const pinned = pins.has(link.id);
  const count = clicks[link.id] || 0;

  return `
    <article class="link-card${pinned ? " pinned" : ""}">
      <a class="link-main" href="${escapeAttr(link.url)}" target="_blank" rel="noopener" data-link="${escapeAttr(link.id)}">
        <span class="link-icon" aria-hidden="true">
          <img src="${favicon}" alt="" loading="lazy" onerror="this.style.opacity='.3'">
        </span>
        <span class="link-text">
          <b>${escapeHtml(link.title)}</b>
          <small>${escapeHtml(host)}${count ? ` <span class="link-meta">· ${count}</span>` : ""}</small>
        </span>
      </a>

      <div class="actions">
        <button type="button" class="pin-btn${pinned ? " active" : ""}" data-pin="${escapeAttr(link.id)}" title="Fijar" aria-label="Fijar">★</button>
        <button type="button" class="copy-btn" data-copy-url="${escapeAttr(link.url)}" title="Copiar URL">⧉</button>
        ${
          canManage
            ? `<button type="button" data-edit="${escapeAttr(link.id)}" title="Editar link">editar</button>
               <button type="button" class="delete" data-delete="${escapeAttr(link.id)}" title="Eliminar link">borrar</button>`
            : ""
        }
      </div>
    </article>
  `;
}

/* Editar / borrar / pin / copy / track: delegación */
repo.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const pinButton = event.target.closest("[data-pin]");
  const copyButton = event.target.closest("[data-copy-url]");
  const linkAnchor = event.target.closest("[data-link]");

  if (pinButton) {
    event.preventDefault();
    const id = pinButton.dataset.pin;
    if (pins.has(id)) pins.delete(id); else pins.add(id);
    saveJSON(LS_PINS, [...pins]);
    renderLinks(getVisibleLinks());
    return;
  }

  if (copyButton) {
    event.preventDefault();
    await copyText(copyButton.dataset.copyUrl);
    showToast("URL copiada.");
    return;
  }

  if (editButton) {
    event.preventDefault();
    if (!user) return;

    const link = liveLinks.find(item => item.id === editButton.dataset.edit);
    if (!link) return;

    openEditor(link);
    return;
  }

  if (deleteButton) {
    event.preventDefault();
    if (!user) return;

    const link = liveLinks.find(item => item.id === deleteButton.dataset.delete);
    if (!link) return;

    lastDeletedLink = link;
    await remove(ref(db, `links/${link.id}`));
    showUndoToast(`Link "${link.title}" borrado.`);
    return;
  }

  if (linkAnchor) {
    const id = linkAnchor.dataset.link;
    clicks[id] = (clicks[id] || 0) + 1;
    saveJSON(LS_CLICKS, clicks);
  }
});

/* Crear / editar */
addLinkBtn.addEventListener("click", () => {
  openEditor();
});

addCategoryBtn.addEventListener("click", () => {
  openCategoryEditor("create");
});

editCategoryBtn.addEventListener("click", () => {
  openCategoryManager(currentFilter === "todos" ? null : currentFilter);
});

$("#closeEditor").addEventListener("click", event => {
  event.preventDefault();
  closeEditor();
});

$("#closeCategoryEditor").addEventListener("click", event => {
  event.preventDefault();
  closeCategoryEditor();
});

$("#closeCategoryManager").addEventListener("click", event => {
  event.preventDefault();
  closeCategoryManager();
});

$("#categoryEditSelect").addEventListener("change", event => {
  editingCategoryName = event.target.value;
  $("#categoryNameInput").value = editingCategoryName;
});

$("#categoryList").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-category-edit]");
  const deleteButton = event.target.closest("[data-category-delete]");

  if (editButton) {
    selectManagedCategory(editButton.dataset.categoryEdit);
    return;
  }

  if (deleteButton) {
    const category = deleteButton.dataset.categoryDelete;
    const ok = confirm(`Borrar categoria "${category}"? Los links pasaran a misc.`);
    if (!ok) return;

    try {
      await deleteCategory(category);
      if (normal(currentFilter) === normal(category)) currentFilter = "todos";
      managingCategoryName = null;
      renderCategoryControls();
      renderCategoryManager();
      renderLinks(getVisibleLinks());
      showToast(`Categoria "${category}" borrada.`);
    } catch (error) {
      console.error(error);
      $("#categoryManagerMsg").textContent = "No se pudo borrar. Revisa las reglas de Firebase.";
    }
  }
});

$("#categoryRenameForm").addEventListener("submit", async event => {
  event.preventDefault();

  const name = cleanCategoryName($("#categoryRenameInput").value);
  if (!managingCategoryName || !name) return;

  const exists = getCategoryOptions().some(category =>
    normal(category) === normal(name) && normal(category) !== normal(managingCategoryName)
  );

  if (exists) {
    $("#categoryManagerMsg").textContent = "Esa categoria ya existe.";
    return;
  }

  try {
    await renameCategory(managingCategoryName, name);
    currentFilter = name;
    managingCategoryName = name;
    renderCategoryControls(name);
    renderCategoryManager(name);
    renderLinks(getVisibleLinks());
    showToast(`Categoria "${name}" actualizada.`);
  } catch (error) {
    console.error(error);
    $("#categoryManagerMsg").textContent = "No se pudo actualizar. Revisa las reglas de Firebase.";
  }
});

$("#linkForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!user) {
    alert("Debes iniciar sesión como admin.");
    return;
  }

  const payload = {
    title: $("#titleInput").value.trim(),
    url: normalizeUrl($("#urlInput").value.trim()),
    category: $("#categoryInput").value,
    updatedAt: serverTimestamp()
  };

  if (editingId) {
    await update(ref(db, `links/${editingId}`), payload);
  } else {
    await push(linksRef, {
      ...payload,
      createdAt: serverTimestamp()
    });
  }

  closeEditor();
});

function openEditor(link = null) {
  editingId = link?.id || null;
  renderCategoryControls(link?.category || categoryInput.value || "misc");

  $("#editorTitle").textContent = editingId ? "editar.link" : "nuevo.link";
  $("#saveLinkBtn").textContent = editingId ? "actualizar" : "guardar";

  $("#titleInput").value = link?.title || "";
  $("#urlInput").value = link?.url || "";
  $("#categoryInput").value = link?.category || categoryInput.value || "misc";

  $("#linkEditor").classList.remove("hidden");
  $("#titleInput").focus();
}

function closeEditor() {
  editingId = null;
  $("#linkForm").reset();
  $("#categoryInput").value = "misc";
  $("#linkEditor").classList.add("hidden");
}

$("#categoryForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!user) {
    alert("Debes iniciar sesión como admin.");
    return;
  }

  const name = cleanCategoryName($("#categoryNameInput").value);

  if (!name) return;

  const exists = getCategoryOptions().some(category =>
    normal(category) === normal(name) && normal(category) !== normal(editingCategoryName)
  );

  if (exists) {
    $("#categoryMsg").textContent = "Esa categoria ya existe.";
    return;
  }

  try {
    const wasEditing = categoryEditorMode === "edit";

    if (categoryEditorMode === "edit") {
      await renameCategory(editingCategoryName, name);
    } else {
      await push(categoriesRef, {
        name,
        createdAt: serverTimestamp()
      });
    }

    currentFilter = name;
    closeCategoryEditor();
    showToast(`Categoria "${name}" ${wasEditing ? "actualizada" : "creada"}.`);
  } catch (error) {
    console.error(error);
    $("#categoryMsg").textContent = "No se pudo guardar. Revisa las reglas de Firebase.";
  }
});

async function renameCategory(oldName, newName) {
  const oldClean = cleanCategoryName(oldName);
  const newClean = cleanCategoryName(newName);
  const stored = getStoredCategory(oldClean);
  const updates = {};

  if (stored) {
    updates[`categories/${stored.id}/name`] = newClean;
    updates[`categories/${stored.id}/previousName`] = stored.previousName || oldClean;
    updates[`categories/${stored.id}/updatedAt`] = serverTimestamp();
  } else {
    const newCategoryRef = push(categoriesRef);
    updates[`categories/${newCategoryRef.key}`] = {
      name: newClean,
      previousName: oldClean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  }

  liveLinks.forEach(link => {
    const linkCategory = normal(link.category || "misc");
    const previousName = normal(stored?.previousName || "");

    if (linkCategory === normal(oldClean) || (previousName && linkCategory === previousName)) {
      updates[`links/${link.id}/category`] = newClean;
      updates[`links/${link.id}/updatedAt`] = serverTimestamp();
    }
  });

  await update(ref(db), updates);
}

async function deleteCategory(categoryName) {
  const clean = cleanCategoryName(categoryName);
  const stored = getStoredCategory(clean);
  const updates = {};
  const baseMatch = baseCategories.some(category => normal(category) === normal(clean));
  const previousName = cleanCategoryName(stored?.previousName);

  if (stored && !baseMatch && !previousName) {
    updates[`categories/${stored.id}`] = null;
  } else if (stored) {
    updates[`categories/${stored.id}/hidden`] = true;
    updates[`categories/${stored.id}/previousName`] = previousName || clean;
    updates[`categories/${stored.id}/updatedAt`] = serverTimestamp();
  } else {
    const hiddenRef = push(categoriesRef);
    updates[`categories/${hiddenRef.key}`] = {
      name: clean,
      previousName: clean,
      hidden: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  }

  liveLinks.forEach(link => {
    const linkCategory = normal(link.category || "misc");
    const previous = normal(previousName || "");

    if (linkCategory === normal(clean) || (previous && linkCategory === previous)) {
      updates[`links/${link.id}/category`] = "misc";
      updates[`links/${link.id}/updatedAt`] = serverTimestamp();
    }
  });

  await update(ref(db), updates);
}

function openCategoryEditor(mode = "create", selectedCategory = null) {
  categoryEditorMode = mode;
  $("#categoryForm").reset();
  $("#categoryEditorTitle").textContent = mode === "edit" ? "editar.categoria" : "nueva.categoria";
  $("#saveCategoryBtn").textContent = mode === "edit" ? "actualizar categoria" : "guardar categoria";
  $("#categoryMsg").textContent = mode === "edit"
    ? "Tambien actualizara los links que usan esa categoria."
    : "Se agregara a filtros y al selector de links.";

  if (mode === "edit") {
    const categories = getCategoryOptions();
    editingCategoryName = selectedCategory && categories.some(category => normal(category) === normal(selectedCategory))
      ? categories.find(category => normal(category) === normal(selectedCategory))
      : categories[0] || "misc";

    $("#categoryEditSelect").innerHTML = categories.map(category => `
      <option value="${escapeAttr(category)}">${escapeHtml(category)}</option>
    `).join("");
    $("#categoryEditSelect").value = editingCategoryName;
    $("#categoryEditSelect").classList.remove("hidden");
    $("#categoryNameInput").value = editingCategoryName;
  } else {
    editingCategoryName = null;
    $("#categoryEditSelect").classList.add("hidden");
    $("#categoryEditSelect").innerHTML = "";
  }

  $("#categoryEditor").classList.remove("hidden");
  $("#categoryNameInput").focus();
}

function closeCategoryEditor() {
  categoryEditorMode = "create";
  editingCategoryName = null;
  $("#categoryForm").reset();
  $("#categoryEditSelect").classList.add("hidden");
  $("#categoryEditor").classList.add("hidden");
}

function openCategoryManager(selectedCategory = null) {
  managingCategoryName = selectedCategory;
  renderCategoryManager(selectedCategory);
  $("#categoryManager").classList.remove("hidden");
}

function closeCategoryManager() {
  managingCategoryName = null;
  $("#categoryRenameForm").classList.add("hidden");
  $("#categoryManager").classList.add("hidden");
}

function renderCategoryManager(selectedCategory = managingCategoryName) {
  const categories = getCategoryOptions();

  $("#categoryList").innerHTML = categories.map(category => `
    <article class="category-row">
      <b>${escapeHtml(category)}</b>
      <div class="category-row-actions">
        <button type="button" data-category-edit="${escapeAttr(category)}">editar</button>
        <button type="button" class="delete" data-category-delete="${escapeAttr(category)}">borrar</button>
      </div>
    </article>
  `).join("");

  const selected = selectedCategory && categories.some(category => normal(category) === normal(selectedCategory))
    ? categories.find(category => normal(category) === normal(selectedCategory))
    : null;

  if (selected) selectManagedCategory(selected);
  else {
    $("#categoryRenameForm").classList.add("hidden");
    $("#categoryManagerMsg").textContent = "Elige una categoria para editar.";
  }
}

function selectManagedCategory(category) {
  managingCategoryName = category;
  $("#categoryRenameInput").value = category;
  $("#categoryRenameForm").classList.remove("hidden");
  $("#categoryManagerMsg").textContent = `Editando "${category}".`;
}

/* Login */
adminLock.addEventListener("click", () => {
  if (user) return;

  loginMsg.classList.remove("error");
  loginMsg.textContent = "Ingresa para administrar links.";
  $("#loginWin").classList.remove("hidden");
  adminLock.setAttribute("aria-expanded", "true");
  $("#emailInput").focus();
});

$("#closeLogin").addEventListener("click", event => {
  event.preventDefault();
  $("#loginWin").classList.add("hidden");
  adminLock.setAttribute("aria-expanded", "false");
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    loginMsg.classList.remove("error");
    loginMsg.textContent = "Entrando...";

    await signInWithEmailAndPassword(
      auth,
      $("#emailInput").value,
      $("#passwordInput").value
    );

    loginMsg.textContent = "Sesion iniciada.";
    $("#loginForm").reset();
    $("#loginWin").classList.add("hidden");
  } catch (error) {
    console.error(error);
    loginMsg.classList.add("error");
    loginMsg.textContent = "Login invalido o Email/Password no activado.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

/* Drag */
if (musicPlayerEl) {
  musicPlayerEl.classList.remove("draggable");
  musicPlayerEl.style.left = "";
  musicPlayerEl.style.top = "";
  musicPlayerEl.style.right = "";
  musicPlayerEl.style.bottom = "";
  musicPlayerEl.style.position = "";
  musicPlayerEl.style.transform = "";
}
document.querySelectorAll(".draggable").forEach(makeDraggable);

function makeDraggable(element) {
  const handle = element.querySelector(".drag-handle") || element;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  handle.addEventListener("pointerdown", event => {
    if (event.target.closest("button, input, select, textarea, a")) return;

    dragging = true;

    const rect = element.getBoundingClientRect();

    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;

    element.style.position = "fixed";
    element.style.left = `${originX}px`;
    element.style.top = `${originY}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.transform = "none";

    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (!dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    element.style.left = `${originX + dx}px`;
    element.style.top = `${originY + dy}px`;
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

/* Audio Local */
const localAudio = $("#localAudio");
const volumeWrap = $("#musicPlayer .volume");
const FIXED_MUSIC_VOLUME = 0.1;
$("#volumeSlider").value = FIXED_MUSIC_VOLUME * 100;
localStorage.setItem(LS_VOL, String(FIXED_MUSIC_VOLUME * 100));
let wantedVolume = FIXED_MUSIC_VOLUME;
let audioUnlockDone = false;
let audioRetryTimer = null;
let audioUnlockBindingDone = false;

function setMusicState(text) {
  $("#musicState").textContent = text;
}

function syncVolumeLabel() {
  if (volumeWrap) volumeWrap.dataset.value = `${Math.round(wantedVolume * 100)}%`;
  const volumeSlider = $("#volumeSlider");
  if (volumeSlider) volumeSlider.style.setProperty("--volume-fill", `${Math.round(wantedVolume * 100)}%`);
}

if (localAudio) {
  localAudio.volume = wantedVolume;
  syncVolumeLabel();

  localAudio.addEventListener("play", () => {
    setMusicState("reproduciendo");
    musicPlayerEl.classList.add("playing");
  });

  localAudio.addEventListener("pause", () => {
    setMusicState("pausa");
    musicPlayerEl.classList.remove("playing");
  });
}

$("#playBtn").addEventListener("click", playMusic);
$("#thumbPlayBtn").addEventListener("click", playMusic);

function clearAudioRetry() {
  if (!audioRetryTimer) return;
  clearTimeout(audioRetryTimer);
  audioRetryTimer = null;
}

function scheduleAudioRetry() {
  if (audioUnlockDone) return;
  clearAudioRetry();
  audioRetryTimer = setTimeout(() => {
    startMusicOnLoad();
  }, 1200);
}

function unlockAudibleMusic() {
  if (!localAudio) return;
  clearAudioRetry();
  localAudio.muted = false;
  localAudio.volume = FIXED_MUSIC_VOLUME;
  return localAudio.play().then(() => {
    audioUnlockDone = true;
    setMusicState("reproduciendo");
  }).catch(error => {
    console.error(error);
    audioUnlockDone = false;
    localAudio.muted = true;
    localAudio.volume = FIXED_MUSIC_VOLUME;
    setMusicState("reproduciendo");
    scheduleAudioRetry();
  });
}

function handleFirstSoundIntent() {
  if (audioUnlockDone) return;
  unlockAudibleMusic();
}

function bindGlobalAudioUnlock() {
  if (audioUnlockBindingDone) return;
  audioUnlockBindingDone = true;

  ["pointerdown", "touchstart", "keydown", "click"].forEach(eventName => {
    window.addEventListener(eventName, handleFirstSoundIntent, {
      capture: true,
      passive: true
    });
  });
}

function startMusicOnLoad() {
  if (!localAudio || audioUnlockDone) return;
  localAudio.muted = true;
  localAudio.volume = FIXED_MUSIC_VOLUME;
  localAudio.play().then(() => {
    setMusicState("reproduciendo");
    requestAnimationFrame(() => unlockAudibleMusic());
  }).catch(() => {
    localAudio.muted = true;
    localAudio.volume = FIXED_MUSIC_VOLUME;
    localAudio.play().then(() => {
      setMusicState("reproduciendo");
      scheduleAudioRetry();
    }).catch(() => {
      setMusicState("esperando audio");
      scheduleAudioRetry();
    });
  });
}

function playMusic() {
  return unlockAudibleMusic();
}

bindGlobalAudioUnlock();

window.addEventListener("load", () => {
  startMusicOnLoad();
  setTimeout(startMusicOnLoad, 600);
});

$("#pauseBtn").addEventListener("click", () => {
  if (localAudio) localAudio.pause();
});

/* Tracks + seek */
const DEFAULT_TRACK = { id: "__default", title: "beach static signal", url: "./music.mp3", builtin: true };
let liveTracks = [];
let allTracks = [DEFAULT_TRACK];
let currentTrackIndex = Number(localStorage.getItem("toshiro-track-idx")) || 0;
let seekDragging = false;

const seekSlider = $("#seekSlider");
const trackTitleEl = $("#trackTitle");
const trackTimeEl = $("#trackTime");
const tracksPanel = $("#tracksPanel");
const tracksList = $("#tracksList");

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

let tracksInitialized = false;
function rebuildTracks() {
  allTracks = [DEFAULT_TRACK, ...liveTracks];
  if (currentTrackIndex >= allTracks.length) currentTrackIndex = 0;
  localAudio.loop = allTracks.length === 1;
  renderTracksList();
  updateTrackInfo();
  if (!tracksInitialized && currentTrackIndex > 0) {
    tracksInitialized = true;
    loadTrack(currentTrackIndex, false);
  } else {
    tracksInitialized = true;
  }
}

function updateTrackInfo() {
  const track = allTracks[currentTrackIndex] || DEFAULT_TRACK;
  trackTitleEl.textContent = track.title || "sin título";
}

function loadTrack(index, autoplay = true) {
  if (!allTracks.length) return;
  currentTrackIndex = (index + allTracks.length) % allTracks.length;
  localStorage.setItem("toshiro-track-idx", currentTrackIndex);

  const track = allTracks[currentTrackIndex];
  const wasPlaying = !localAudio.paused;
  localAudio.src = track.url;
  localAudio.muted = false;
  localAudio.volume = FIXED_MUSIC_VOLUME;
  updateTrackInfo();
  renderTracksList();

  if (autoplay || wasPlaying) {
    localAudio.play().catch(() => setMusicState("error"));
  }
}

function renderTracksList() {
  if (!tracksList) return;
  const canManage = Boolean(user);

  tracksList.innerHTML = allTracks.map((track, i) => `
    <article class="track-row${i === currentTrackIndex ? " active" : ""}" data-track-idx="${i}">
      <b>${escapeHtml(track.title || "sin título")}</b>
      ${!track.builtin && canManage ? `<button type="button" class="delete" data-track-delete="${escapeAttr(track.id)}">×</button>` : ""}
    </article>
  `).join("");

  $("#trackForm").classList.toggle("hidden", !canManage);
}

onValue(tracksRef, snapshot => {
  const data = snapshot.val();
  liveTracks = data
    ? Object.entries(data).map(([id, value]) => ({ id, ...value }))
    : [];
  rebuildTracks();
}, () => {
  liveTracks = [];
  rebuildTracks();
});

$("#prevTrackBtn").addEventListener("click", () => loadTrack(currentTrackIndex - 1));
$("#nextTrackBtn").addEventListener("click", () => loadTrack(currentTrackIndex + 1));

$("#tracksToggleBtn").addEventListener("click", () => {
  tracksPanel.classList.toggle("hidden");
  if (!tracksPanel.classList.contains("hidden")) renderTracksList();
});

$("#closeTracksPanel").addEventListener("click", event => {
  event.preventDefault();
  tracksPanel.classList.add("hidden");
});

tracksList.addEventListener("click", async event => {
  const deleteBtn = event.target.closest("[data-track-delete]");
  if (deleteBtn) {
    event.stopPropagation();
    if (!user) return;
    if (!confirm("¿Borrar esta pista?")) return;
    await remove(ref(db, `tracks/${deleteBtn.dataset.trackDelete}`));
    return;
  }

  const row = event.target.closest("[data-track-idx]");
  if (!row) return;
  loadTrack(Number(row.dataset.trackIdx));
});

$("#trackForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!user) return;

  const title = $("#trackTitleInput").value.trim();
  const url = $("#trackUrlInput").value.trim();
  if (!title || !url) return;

  await push(tracksRef, {
    title,
    url,
    createdAt: serverTimestamp()
  });

  $("#trackForm").reset();
  showToast(`Pista "${title}" agregada.`);
});

localAudio.addEventListener("timeupdate", () => {
  if (seekDragging) return;
  const duration = localAudio.duration || 0;
  const current = localAudio.currentTime || 0;
  const pct = duration > 0 ? (current / duration) * 1000 : 0;
  seekSlider.value = pct;
  seekSlider.style.setProperty("--seek-fill", `${pct / 10}%`);
  trackTimeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
});

localAudio.addEventListener("loadedmetadata", () => {
  trackTimeEl.textContent = `0:00 / ${formatTime(localAudio.duration)}`;
});

localAudio.addEventListener("ended", () => {
  if (allTracks.length > 1) loadTrack(currentTrackIndex + 1);
});

seekSlider.addEventListener("input", event => {
  seekDragging = true;
  const pct = Number(event.target.value) / 1000;
  seekSlider.style.setProperty("--seek-fill", `${pct * 100}%`);
  if (localAudio.duration) {
    trackTimeEl.textContent = `${formatTime(localAudio.duration * pct)} / ${formatTime(localAudio.duration)}`;
  }
});

seekSlider.addEventListener("change", event => {
  const pct = Number(event.target.value) / 1000;
  if (localAudio.duration) localAudio.currentTime = localAudio.duration * pct;
  seekDragging = false;
});

$("#volumeSlider").addEventListener("input", event => {
  event.target.value = FIXED_MUSIC_VOLUME * 100;
  wantedVolume = FIXED_MUSIC_VOLUME;
  if (localAudio) {
    localAudio.muted = false;
    localAudio.volume = FIXED_MUSIC_VOLUME;
  }
  localStorage.setItem(LS_VOL, String(FIXED_MUSIC_VOLUME * 100));
  syncVolumeLabel();
});

function showToast(message) {
  sessionToast.textContent = message;
  sessionToast.classList.remove("hidden");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    sessionToast.classList.add("hidden");
  }, 3200);
}

function showUndoToast(message) {
  sessionToast.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message + " ";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "deshacer";
  btn.style.marginLeft = "10px";
  btn.addEventListener("click", async () => {
    if (!lastDeletedLink || !user) return;
    const { id, ...payload } = lastDeletedLink;
    await update(ref(db, `links/${id}`), payload);
    lastDeletedLink = null;
    showToast("Link restaurado.");
  });
  sessionToast.appendChild(text);
  sessionToast.appendChild(btn);
  sessionToast.classList.remove("hidden");

  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    sessionToast.classList.add("hidden");
    lastDeletedLink = null;
  }, 6000);
}

/* Search */
const searchInput = $("#searchInput");
const clearSearchBtn = $("#clearSearchBtn");

searchInput.addEventListener("input", event => {
  searchQuery = event.target.value;
  clearSearchBtn.classList.toggle("hidden", !searchQuery);
  renderLinks(getVisibleLinks());
});

clearSearchBtn.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  renderLinks(getVisibleLinks());
  searchInput.focus();
});

/* View mode */
document.querySelectorAll(".view-mode").forEach(btn => {
  if (btn.dataset.view === viewMode) {
    document.querySelectorAll(".view-mode").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-mode").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    viewMode = btn.dataset.view;
    localStorage.setItem("toshiro-view", viewMode);
    renderLinks(getVisibleLinks());
  });
});

window.addEventListener("resize", () => {
  scheduleRepoLayout();
});

/* Theme cycling removed — cybercore fixed */

/* Bulk add */
$("#bulkAddBtn").addEventListener("click", () => {
  const categories = getCategoryOptions();
  $("#bulkCategoryInput").innerHTML = categories.map(c =>
    `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`
  ).join("");
  $("#bulkCategoryInput").value = currentFilter !== "todos" && categories.includes(currentFilter)
    ? currentFilter : "misc";
  $("#bulkEditor").classList.remove("hidden");
  $("#bulkInput").focus();
});

$("#closeBulkEditor").addEventListener("click", event => {
  event.preventDefault();
  $("#bulkEditor").classList.add("hidden");
});

$("#bulkForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!user) return;

  const category = $("#bulkCategoryInput").value;
  const lines = $("#bulkInput").value.split("\n").map(l => l.trim()).filter(Boolean);
  let added = 0;
  let failed = 0;

  for (const line of lines) {
    try {
      let title, urlRaw;
      if (line.includes("|")) {
        const [t, u] = line.split("|").map(s => s.trim());
        title = t; urlRaw = u;
      } else {
        urlRaw = line;
        title = getHost(urlRaw).replace(/^www\./, "");
      }
      const url = normalizeUrl(urlRaw);
      await push(linksRef, {
        title: title || getHost(url),
        url,
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      added++;
    } catch (error) {
      console.error(error);
      failed++;
    }
  }

  $("#bulkMsg").textContent = `Agregados: ${added}. Fallos: ${failed}.`;
  $("#bulkInput").value = "";
  showToast(`${added} links agregados.`);
});

/* Export */
$("#exportBtn").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    links: liveLinks,
    categories: liveCategories,
    notes: liveNotes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `toshiro-links-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Export descargado.");
});

/* Import */
$("#importBtn").addEventListener("click", () => {
  $("#importEditor").classList.remove("hidden");
  $("#importInput").focus();
});

$("#closeImportEditor").addEventListener("click", event => {
  event.preventDefault();
  $("#importEditor").classList.add("hidden");
});

$("#importForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!user) return;

  let parsed;
  try {
    parsed = JSON.parse($("#importInput").value);
  } catch (error) {
    $("#importMsg").textContent = "JSON inválido.";
    return;
  }

  const incomingLinks = Array.isArray(parsed) ? parsed : (parsed.links || []);
  const incomingCategories = parsed.categories || [];
  const merge = $("#importMerge").checked;
  let added = 0;

  try {
    if (!merge) {
      await update(ref(db), { links: null });
    }

    for (const link of incomingLinks) {
      if (!link.url) continue;
      await push(linksRef, {
        title: link.title || getHost(link.url),
        url: normalizeUrl(link.url),
        category: link.category || "misc",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      added++;
    }

    for (const cat of incomingCategories) {
      if (!cat.name) continue;
      const exists = liveCategories.some(c => normal(c.name) === normal(cat.name));
      if (exists) continue;
      await push(categoriesRef, {
        name: cleanCategoryName(cat.name),
        previousName: cat.previousName || null,
        hidden: cat.hidden || false,
        createdAt: serverTimestamp()
      });
    }

    $("#importMsg").textContent = `Importados ${added} links.`;
    showToast(`${added} links importados.`);
    $("#importEditor").classList.add("hidden");
  } catch (error) {
    console.error(error);
    $("#importMsg").textContent = "Error al importar. Revisa reglas de Firebase.";
  }
});

/* Keyboard shortcuts */
document.addEventListener("keydown", event => {
  const tag = (event.target.tagName || "").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable;

  if (event.key === "Escape") {
    document.querySelectorAll(".modal, .notes-panel").forEach(el => {
      if (!el.classList.contains("hidden")) el.classList.add("hidden");
    });
    return;
  }

  if (typing) return;

  if (event.key === "/") {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (event.key.toLowerCase() === "n" && user) {
    event.preventDefault();
    openEditor();
    return;
  }

});

/* Share target (PWA) */
{
  const shareParams = new URLSearchParams(location.search);
  const sharedUrl = shareParams.get("url") || shareParams.get("text");
  if (sharedUrl) {
    let consumed = false;
    const unsub = onAuthStateChanged(auth, currentUser => {
      if (!currentUser || consumed) return;
      consumed = true;
      setTimeout(() => {
        openEditor();
        $("#urlInput").value = sharedUrl;
        $("#titleInput").value = shareParams.get("title") || "";
      }, 200);
      unsub();
      history.replaceState({}, "", location.pathname);
    });
  }
}

/* Service worker */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

/* Helpers */
function timestampValue(value) {
  return typeof value === "number" ? value : 0;
}

function normalizeUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return new URL(`https://${url}`).href;
  }
}

function getHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function cleanCategoryName(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function normal(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function escapeHtml(string = "") {
  return String(string).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(string = "") {
  return escapeHtml(string);
}
