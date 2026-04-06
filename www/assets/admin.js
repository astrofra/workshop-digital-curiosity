import {
  ApiError,
  buildApiUrl,
  escapeHtml,
  formatFrenchDate,
  requestJson,
  setStatus
} from "/assets/common.js";

const grid = document.querySelector("[data-admin-grid]");
const globalStatus = document.querySelector("[data-admin-status]");
const itemCount = document.querySelector("[data-item-count]");
const refreshButton = document.querySelector("[data-refresh]");
const template = document.querySelector("#admin-card-template");

let refreshTimer = null;

function renderEmptyState() {
  grid.innerHTML = `
    <div class="empty-state panel">
      <p class="eyebrow">Archive vide</p>
      <h2>Aucune contribution recueillie</h2>
      <p>Les soumissions apparaitront ici des qu'elles seront envoyees depuis le formulaire public.</p>
    </div>
  `;
}

function createCard(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  const badge = item.has_model ? "Modele GLB" : "Image en attente";
  const authorLabel = item.author ? `Par ${escapeHtml(item.author)}` : "Auteur ou autrice non renseigne";

  node.dataset.itemId = item.id;
  node.querySelector(".artifact-image").src = item.image_url;
  node.querySelector(".artifact-image").alt = `Image source pour ${item.name}`;
  node.querySelector(".artifact-badge").textContent = badge;
  node.querySelector(".artifact-date").textContent = formatFrenchDate(item.created_at);
  node.querySelector(".artifact-code").textContent = `Code ${item.participant_id}`;
  node.querySelector(".artifact-title").textContent = item.name;
  node.querySelector(".artifact-author").innerHTML = authorLabel;
  node.querySelector(".artifact-description").textContent = item.description;
  node.querySelector(".artifact-image-link").href = item.image_url;
  node.querySelector(".artifact-museum-link").href = `/#${item.id}`;

  const form = node.querySelector(".model-form");
  form.dataset.itemId = item.id;

  if (item.has_model) {
    const modelLink = document.createElement("a");
    modelLink.className = "text-link";
    modelLink.href = item.model_url;
    modelLink.download = "model.glb";
    modelLink.textContent = "Telecharger le GLB";
    node.querySelector(".artifact-links").append(modelLink);
  }

  return node;
}

function renderItems(items) {
  itemCount.textContent = String(items.length);

  if (!items.length) {
    renderEmptyState();
    return;
  }

  grid.replaceChildren(...items.map(createCard));
}

async function loadItems({ silent = false } = {}) {
  if (!silent) {
    setStatus(globalStatus, "Chargement des contributions...", "info");
  }

  try {
    const response = await requestJson(buildApiUrl("admin-items.php"));
    renderItems(response.items);

    if (!silent) {
      setStatus(globalStatus, `${response.items.length} contribution(s) chargee(s).`, "success");
    }
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Impossible de charger les contributions.";
    setStatus(globalStatus, message, "error");
  }
}

async function uploadModel(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  const status = form.querySelector(".status");
  const fileInput = form.querySelector('input[name="model"]');

  if (!fileInput.files[0]) {
    setStatus(status, "Selectionnez un fichier GLB.", "error");
    return;
  }

  const payload = new FormData(form);

  submitButton.disabled = true;
  submitButton.textContent = "Televersement...";
  setStatus(status, "Envoi du modele GLB...", "info");

  try {
    await requestJson(buildApiUrl("upload-model.php", { id: form.dataset.itemId }), {
      method: "POST",
      body: payload
    });

    setStatus(status, "Modele ajoute avec succes.", "success");
    await loadItems({ silent: true });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Impossible de televerser le modele.";
    setStatus(status, message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Televerser le modele";
  }
}

grid.addEventListener("submit", async (event) => {
  const form = event.target.closest(".model-form");

  if (!form) {
    return;
  }

  event.preventDefault();
  await uploadModel(form);
});

refreshButton.addEventListener("click", async () => {
  await loadItems();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadItems({ silent: true });
  }
});

refreshTimer = window.setInterval(() => {
  loadItems({ silent: true });
}, 15000);

window.addEventListener("beforeunload", () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
});

loadItems();
