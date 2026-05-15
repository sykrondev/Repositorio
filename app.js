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
const logoutBtn = $("#logoutBtn");
const adminLock = $("#adminLock");
const loginMsg = $("#loginMsg");
const sessionToast = $("#sessionToast");
const filtersEl = $("#filters");
const categoryInput = $("#categoryInput");
const linksRef = ref(db, "links");
const categoriesRef = ref(db, "categories");
const musicPlayerEl = $("#musicPlayer");
const ramValue = $("#ramValue");
const ramStatus = $("#ramStatus");
const ramBar = $("#ramBar");

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
let currentFilter = "todos";
let editingId = null;
let categoryEditorMode = "create";
let editingCategoryName = null;
let managingCategoryName = null;
let ramMonitorBusy = false;

updateRamMonitor();
setInterval(updateRamMonitor, 3000);

/* Auth */
onAuthStateChanged(auth, currentUser => {
  const hadUser = Boolean(user);
  user = currentUser;

  addLinkBtn.classList.toggle("hidden", !user);
  addCategoryBtn.classList.toggle("hidden", !user);
  editCategoryBtn.classList.toggle("hidden", !user);
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
  return links.filter(link => {
    const category = normal(link.category || "misc");

    const matchesFilter =
      currentFilter === "todos" || category === normal(currentFilter);

    return matchesFilter;
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

/* Render */
function renderLinks(links) {
  if (!links.length) {
    repo.innerHTML = `
      <section class="glass empty">
        No hay links todavía. ${user ? "Pulsa + link para crear el primero." : ""}
      </section>
    `;
    return;
  }

  const groups = {};

  links.forEach(link => {
    const category = link.category?.trim() || "misc";
    if (!groups[category]) groups[category] = [];
    groups[category].push(link);
  });

  const order = getCategoryOptions();

  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ia = order.findIndex(category => normal(category) === normal(a));
    const ib = order.findIndex(category => normal(category) === normal(b));

    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;

    return ia - ib;
  });

  repo.innerHTML = sortedGroups.map(([category, items]) => `
    <section class="category glass">
      <h2>${escapeHtml(category)}</h2>
      ${items.map(linkTemplate).join("")}
    </section>
  `).join("");
}

function linkTemplate(link) {
  const host = getHost(link.url);
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const canManage = Boolean(user);

  return `
    <article class="link-card">
      <a class="link-main" href="${escapeAttr(link.url)}" target="_blank" rel="noopener">
        <span class="link-icon" aria-hidden="true">
          <img src="${favicon}" alt="">
        </span>
        <span class="link-text">
          <b>${escapeHtml(link.title)}</b>
          <small>${escapeHtml(host)}</small>
        </span>
      </a>

      ${
        canManage
          ? `
            <div class="actions">
              <button type="button" data-edit="${escapeAttr(link.id)}" title="Editar link">editar</button>
              <button type="button" class="delete" data-delete="${escapeAttr(link.id)}" title="Eliminar link">borrar</button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

/* Editar / borrar: delegación */
repo.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

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

    const ok = confirm("¿Eliminar este link?");
    if (!ok) return;

    await remove(ref(db, `links/${deleteButton.dataset.delete}`));
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

/* YouTube */
const YOUTUBE_VIDEO_ID = "ejztepv9AyY";
let ytPlayer = null;
let ytReady = false;
let wantedVolume = Number($("#volumeSlider").value);
let ytLoadTimer = null;
let autoplayStarted = false;

function setMusicState(text) {
  $("#musicState").textContent = text;
}

function youtubePlayerVars() {
  const vars = {
    start: 1,
    autoplay: 0,
    controls: 1,
    disablekb: 0,
    enablejsapi: 1,
    modestbranding: 1,
    playsinline: 1,
    rel: 0
  };

  if (window.location.protocol.startsWith("http")) {
    vars.origin = window.location.origin;
  }

  return vars;
}

window.onYouTubeIframeAPIReady = function () {
  if (ytPlayer) return;
  clearTimeout(ytLoadTimer);

  ytPlayer = new window.YT.Player("ytPlayer", {
    width: "100%",
    height: "100%",
    videoId: YOUTUBE_VIDEO_ID,
    playerVars: youtubePlayerVars(),
    events: {
      onReady: event => {
        ytReady = true;
        event.target.setVolume(wantedVolume);
        setMusicState("listo");
        startAutoplay();
      },
      onStateChange: event => {
        const state = window.YT.PlayerState;

        if (event.data === state.BUFFERING) {
          setMusicState("cargando");
        }

        if (event.data === state.PLAYING) {
          setMusicState("reproduciendo");
          musicPlayerEl.classList.add("playing");
        }

        if (event.data === state.PAUSED) {
          setMusicState("pausa");
          musicPlayerEl.classList.remove("playing");
        }

        if (event.data === state.ENDED) {
          setMusicState("termino");
          musicPlayerEl.classList.remove("playing");
        }
      },
      onError: () => {
        setMusicState("error");
        musicPlayerEl.classList.remove("playing");
      }
    }
  });
};

loadYouTubeApi();
window.addEventListener("load", () => {
  setTimeout(startAutoplay, 1200);
});

$("#playBtn").addEventListener("click", playMusic);
$("#thumbPlayBtn").addEventListener("click", playMusic);

function playMusic() {
  autoplayStarted = true;

  if (!ytReady || !ytPlayer) {
    playYoutubeDirectly(true);
    loadYouTubeApi();
    return;
  }

  try {
    ytPlayer.unMute();
    ytPlayer.setVolume(wantedVolume);
    ytPlayer.playVideo();
    setMusicState("iniciando");
  } catch (error) {
    console.error(error);
    setMusicState("error");
  }
}

$("#pauseBtn").addEventListener("click", () => {
  if (ytReady && ytPlayer) {
    ytPlayer.pauseVideo();
  } else {
    pauseYoutubeDirectly();
  }
});

$("#volumeSlider").addEventListener("input", event => {
  wantedVolume = Number(event.target.value);

  if (!ytReady || !ytPlayer) return;

  ytPlayer.setVolume(wantedVolume);

  if (wantedVolume === 0) ytPlayer.mute();
  else ytPlayer.unMute();
});

function loadYouTubeApi() {
  if (window.YT?.Player) {
    window.onYouTubeIframeAPIReady();
    return;
  }

  if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) return;

  setMusicState("cargando");
  ytLoadTimer = setTimeout(() => {
    if (!ytReady) setMusicState("sin youtube");
  }, 8000);

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  document.body.appendChild(script);
}

function youtubeEmbedUrl(autoplay = false) {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    controls: "1",
    mute: autoplay ? "1" : "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1"
  });

  if (window.location.protocol.startsWith("http")) {
    params.set("origin", window.location.origin);
  }

  return `https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?${params.toString()}`;
}

function startAutoplay() {
  if (autoplayStarted) return;
  autoplayStarted = true;

  if (ytReady && ytPlayer) {
    try {
      ytPlayer.mute();
      ytPlayer.playVideo();
      musicPlayerEl.classList.add("playing");
      setMusicState("auto");
      return;
    } catch (error) {
      console.error(error);
    }
  }

  playYoutubeDirectly(true);
}

function playYoutubeDirectly(autoplay = false) {
  const target = $("#ytPlayer");

  if (target.tagName === "IFRAME") {
    target.src = youtubeEmbedUrl(autoplay);
    target.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
  } else {
    target.innerHTML = `
      <iframe
        title="YouTube player"
        src="${youtubeEmbedUrl(autoplay)}"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
  }

  musicPlayerEl.classList.add("playing");
  setMusicState("reproduciendo");
}

function pauseYoutubeDirectly() {
  const target = $("#ytPlayer");

  if (target.tagName === "IFRAME") {
    target.src = youtubeEmbedUrl(false);
  } else {
    target.innerHTML = "";
  }

  musicPlayerEl.classList.remove("playing");
  setMusicState("pausa");
}

function showToast(message) {
  sessionToast.textContent = message;
  sessionToast.classList.remove("hidden");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    sessionToast.classList.add("hidden");
  }, 3200);
}

async function updateRamMonitor() {
  if (ramMonitorBusy) return;
  ramMonitorBusy = true;

  try {
    if ("measureUserAgentSpecificMemory" in performance) {
      const result = await performance.measureUserAgentSpecificMemory();
      const usedMb = bytesToMb(result.bytes);
      const percent = getPageMemoryPercent(usedMb);

      ramValue.textContent = `${usedMb} MB`;
      ramStatus.textContent = "page est";
      ramBar.style.width = `${percent}%`;
      return;
    }

    const memory = performance.memory;

    if (!memory) {
      ramValue.textContent = "-- MB";
      ramStatus.textContent = "no data";
      ramBar.style.width = "18%";
      return;
    }

    const usedMb = bytesToMb(memory.usedJSHeapSize);
    const limitMb = bytesToMb(memory.jsHeapSizeLimit);
    const percent = Math.max(2, Math.min(100, Math.round((usedMb / limitMb) * 100)));

    ramValue.textContent = `${usedMb} MB`;
    ramStatus.textContent = "js heap";
    ramBar.style.width = `${percent}%`;
  } catch (error) {
    console.warn(error);
    ramValue.textContent = "-- MB";
    ramStatus.textContent = "blocked";
    ramBar.style.width = "18%";
  } finally {
    ramMonitorBusy = false;
  }
}

/* Helpers */
function bytesToMb(bytes = 0) {
  return Math.round(bytes / 1024 / 1024);
}

function getPageMemoryPercent(usedMb) {
  return Math.max(4, Math.min(100, Math.round((usedMb / 256) * 100)));
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
