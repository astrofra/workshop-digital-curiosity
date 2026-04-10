import {
  ApiError,
  buildAppUrl,
  buildApiUrl,
  escapeHtml,
  formatDisplayDate,
  requestJson,
  setStatus
} from "./common.js";
import {
  getLanguage,
  initLanguageSwitcher,
  interpolate,
  onLanguageChange,
  translateKnownMessage
} from "./i18n.js";

const translations = {
  fr: {
    pageTitle: "Curiosity Museum - Admin",
    headerEyebrow: "Interface locale",
    headerTitle: "Administration de l'archive",
    headerLede: "Parcourez les contributions, telechargez les images source et rattachez un modele GLB a chaque objet.",
    contributionsLabel: "Contributions",
    refresh: "Actualiser",
    emptyEyebrow: "Archive vide",
    emptyTitle: "Aucune contribution recueillie",
    emptyText: "Les soumissions apparaitront ici des qu'elles seront envoyees depuis le formulaire public.",
    badgeModel: "Modele GLB",
    badgePending: "Image en attente",
    authorPrefix: "Par",
    codeLabel: "Code {code}",
    unknownAuthor: "Auteur ou autrice non renseigne",
    imageLink: "Telecharger l'image",
    imageLinkSecond: "Telecharger l'image 2",
    museumLink: "Voir dans le musee",
    deleteButton: "Supprimer l'objet",
    modelField: "Ajouter un GLB",
    uploadModel: "Televerser le modele",
    uploadModelBusy: "Televersement...",
    downloadGlb: "Telecharger le GLB",
    selectGlb: "Selectionnez un fichier GLB.",
    uploadProgress: "Envoi du modele GLB...",
    uploadSuccess: "Modele ajoute avec succes.",
    uploadError: "Impossible de televerser le modele.",
    deleteConfirm: 'Supprimer definitivement "{title}" ?',
    deleteProgress: "Suppression de l'objet...",
    deleteSuccess: "Objet supprime.",
    deleteError: "Impossible de supprimer l'objet.",
    loadProgress: "Chargement des contributions...",
    loadSuccess: "{count} contribution(s) chargee(s).",
    loadError: "Impossible de charger les contributions."
  },
  en: {
    pageTitle: "Curiosity Museum - Admin",
    headerEyebrow: "Local interface",
    headerTitle: "Archive administration",
    headerLede: "Browse contributions, download source images, and attach a GLB model to each object.",
    contributionsLabel: "Contributions",
    refresh: "Refresh",
    emptyEyebrow: "Archive empty",
    emptyTitle: "No contributions collected yet",
    emptyText: "Submissions will appear here as soon as they are sent from the public form.",
    badgeModel: "GLB model",
    badgePending: "Image pending",
    authorPrefix: "By",
    codeLabel: "Code {code}",
    unknownAuthor: "Unknown author",
    imageLink: "Download image",
    imageLinkSecond: "Download image 2",
    museumLink: "View in museum",
    deleteButton: "Delete object",
    modelField: "Add a GLB",
    uploadModel: "Upload model",
    uploadModelBusy: "Uploading...",
    downloadGlb: "Download GLB",
    selectGlb: "Select a GLB file.",
    uploadProgress: "Uploading the GLB model...",
    uploadSuccess: "Model added successfully.",
    uploadError: "Unable to upload the model.",
    deleteConfirm: 'Permanently delete "{title}"?',
    deleteProgress: "Deleting object...",
    deleteSuccess: "Object deleted.",
    deleteError: "Unable to delete the object.",
    loadProgress: "Loading contributions...",
    loadSuccess: "{count} contribution(s) loaded.",
    loadError: "Unable to load contributions."
  }
};

const apiMessageTranslations = {
  "Objet supprime.": "Object deleted.",
  "Modele ajoute avec succes.": "Model added successfully.",
  "Selectionnez un fichier GLB.": "Select a GLB file.",
  "Envoi du modele GLB...": "Uploading the GLB model...",
  "Impossible de televerser le modele.": "Unable to upload the model.",
  "Chargement des contributions...": "Loading contributions...",
  "Impossible de charger les contributions.": "Unable to load contributions.",
  "Objet introuvable.": "Object not found.",
  "Le fichier GLB n est pas dans un format accepte.": "The GLB file format is not accepted.",
  "Une erreur interne est survenue.": "An internal error occurred."
};

const grid = document.querySelector("[data-admin-grid]");
const globalStatus = document.querySelector("[data-admin-status]");
const itemCount = document.querySelector("[data-item-count]");
const refreshButton = document.querySelector("[data-refresh]");
const template = document.querySelector("#admin-card-template");
const headerEyebrow = document.querySelector(".admin-head .eyebrow");
const headerTitle = document.querySelector(".admin-head h1");
const headerLede = document.querySelector(".admin-head .lede");
const contributionsLabel = document.querySelector(".stat-label");

const state = {
  items: [],
  globalStatusKey: "",
  globalStatusValues: null,
  globalStatusRawMessage: "",
  globalStatusState: "info",
  refreshTimer: null
};

function t(key, values) {
  const value = translations[getLanguage()][key];
  return values ? interpolate(value, values) : value;
}

function translateApiMessage(message) {
  return translateKnownMessage(message, getLanguage(), apiMessageTranslations);
}

function updateFormStatus(form) {
  const status = form.querySelector(".status");
  const key = form.dataset.statusKey;
  const rawMessage = form.dataset.statusRawMessage || "";
  if ((!key && !rawMessage) || status.hidden) {
    return;
  }

  const message = key ? t(key) : translateApiMessage(rawMessage);
  setStatus(status, message, form.dataset.statusState || "info");
}

function updateCard(node, item) {
  node._item = item;

  const badge = item.has_model ? t("badgeModel") : t("badgePending");
  const authorLabel = item.author ? `${t("authorPrefix")} ${escapeHtml(item.author)}` : t("unknownAuthor");

  node.dataset.itemId = item.id;
  node.querySelector(".artifact-image").src = item.image_url;
  node.querySelector(".artifact-image").alt = item.name;
  node.querySelector(".artifact-image-grid").dataset.count = item.image_url_2 ? "2" : "1";
  const secondaryImage = node.querySelector(".artifact-image-secondary");
  secondaryImage.hidden = !item.image_url_2;
  if (item.image_url_2) {
    secondaryImage.src = item.image_url_2;
    secondaryImage.alt = `${item.name} - second image`;
  } else {
    secondaryImage.removeAttribute("src");
    secondaryImage.alt = "";
  }
  node.querySelector(".artifact-badge").textContent = badge;
  node.querySelector(".artifact-date").textContent = formatDisplayDate(item.created_at, getLanguage());
  node.querySelector(".artifact-code").textContent = t("codeLabel", { code: item.participant_id });
  node.querySelector(".artifact-title").textContent = item.name;
  node.querySelector(".artifact-author").innerHTML = authorLabel;
  node.querySelector(".artifact-description").textContent = item.description;
  node.querySelector(".artifact-image-link").href = item.image_url;
  node.querySelector(".artifact-image-link").textContent = t("imageLink");
  const secondaryLink = node.querySelector(".artifact-image-link-secondary");
  secondaryLink.hidden = !item.image_url_2;
  if (item.image_url_2) {
    secondaryLink.href = item.image_url_2;
    secondaryLink.textContent = t("imageLinkSecond");
  } else {
    secondaryLink.removeAttribute("href");
  }
  node.querySelector(".artifact-museum-link").href = buildAppUrl(`#${item.id}`);
  node.querySelector(".artifact-museum-link").textContent = t("museumLink");
  node.querySelector(".artifact-delete-button").textContent = t("deleteButton");

  const form = node.querySelector(".model-form");
  form.dataset.itemId = item.id;
  form.querySelector(".field span").textContent = t("modelField");
  form.querySelector('button[type="submit"]').textContent = form.dataset.busy === "true" ? t("uploadModelBusy") : t("uploadModel");
  updateFormStatus(form);

  const existingModelLink = node.querySelector(".artifact-model-link");
  if (existingModelLink) {
    existingModelLink.textContent = t("downloadGlb");
  } else if (item.has_model) {
    const modelLink = document.createElement("a");
    modelLink.className = "text-link artifact-model-link";
    modelLink.href = item.model_url;
    modelLink.download = "model.glb";
    modelLink.textContent = t("downloadGlb");
    node.querySelector(".artifact-links").append(modelLink);
  }
}

function renderEmptyState() {
  grid.innerHTML = `
    <div class="empty-state panel">
      <p class="eyebrow">${escapeHtml(t("emptyEyebrow"))}</p>
      <h2>${escapeHtml(t("emptyTitle"))}</h2>
      <p>${escapeHtml(t("emptyText"))}</p>
    </div>
  `;
}

function renderItems(items) {
  itemCount.textContent = String(items.length);

  if (!items.length) {
    renderEmptyState();
    return;
  }

  const nodes = items.map((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    updateCard(node, item);
    return node;
  });

  grid.replaceChildren(...nodes);
}

function applyTranslations() {
  document.title = t("pageTitle");
  headerEyebrow.textContent = t("headerEyebrow");
  headerTitle.textContent = t("headerTitle");
  headerLede.textContent = t("headerLede");
  contributionsLabel.textContent = t("contributionsLabel");
  refreshButton.textContent = t("refresh");

  if (!state.items.length) {
    renderEmptyState();
  } else {
    for (const node of grid.querySelectorAll(".artifact-card")) {
      if (node._item) {
        updateCard(node, node._item);
      }
    }
  }

  if (state.globalStatusMessage) {
    const message = state.globalStatusKey
      ? t(state.globalStatusKey, state.globalStatusValues)
      : translateApiMessage(state.globalStatusRawMessage);
    setStatus(globalStatus, message, state.globalStatusState);
  }
}

async function deleteItem(card) {
  const itemId = card.dataset.itemId;
  const title = card.querySelector(".artifact-title")?.textContent?.trim() || "this object";

  if (!window.confirm(t("deleteConfirm", { title }))) {
    return;
  }

  const deleteButton = card.querySelector(".artifact-delete-button");
  const modelSubmitButton = card.querySelector('.model-form button[type="submit"]');
  const form = card.querySelector(".model-form");

  deleteButton.disabled = true;
  if (modelSubmitButton) {
    modelSubmitButton.disabled = true;
  }
  form.dataset.statusKey = "deleteProgress";
  form.dataset.statusState = "info";
  updateFormStatus(form);

  try {
    const response = await requestJson(buildApiUrl("delete-item.php", { id: itemId }), {
      method: "POST"
    });

    state.globalStatusKey = "";
    state.globalStatusValues = null;
    state.globalStatusRawMessage = response.message || "";
    state.globalStatusState = "success";
    setStatus(globalStatus, translateApiMessage(response.message) || t("deleteSuccess"), state.globalStatusState);
    await loadItems({ silent: true });
  } catch (error) {
    const message = translateApiMessage(
      error instanceof ApiError ? error.message : t("deleteError")
    );
    form.dataset.statusKey = "";
    form.dataset.statusRawMessage = error instanceof ApiError ? error.message : "";
    form.dataset.statusState = "error";
    setStatus(form.querySelector(".status"), message, "error");
    deleteButton.disabled = false;
    if (modelSubmitButton) {
      modelSubmitButton.disabled = false;
    }
  }
}

async function loadItems({ silent = false } = {}) {
  if (!silent) {
    state.globalStatusKey = "loadProgress";
    state.globalStatusValues = null;
    state.globalStatusRawMessage = "";
    state.globalStatusState = "info";
    setStatus(globalStatus, t("loadProgress"), state.globalStatusState);
  }

  try {
    const response = await requestJson(buildApiUrl("admin-items.php"));
    state.items = response.items;
    renderItems(response.items);

    if (!silent) {
      state.globalStatusKey = "loadSuccess";
      state.globalStatusValues = { count: response.items.length };
      state.globalStatusRawMessage = "";
      state.globalStatusState = "success";
      setStatus(globalStatus, t("loadSuccess", { count: response.items.length }), state.globalStatusState);
    }
  } catch (error) {
    state.globalStatusKey = error instanceof ApiError ? "" : "loadError";
    state.globalStatusValues = null;
    state.globalStatusRawMessage = error instanceof ApiError ? error.message : "";
    state.globalStatusState = "error";
    setStatus(
      globalStatus,
      translateApiMessage(error instanceof ApiError ? error.message : t("loadError")),
      state.globalStatusState
    );
  }
}

async function uploadModel(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  const status = form.querySelector(".status");
  const fileInput = form.querySelector('input[name="model"]');

  if (!fileInput.files[0]) {
    setStatus(status, t("selectGlb"), "error");
    form.dataset.statusKey = "selectGlb";
    form.dataset.statusRawMessage = "";
    form.dataset.statusState = "error";
    return;
  }

  const payload = new FormData(form);

  form.dataset.busy = "true";
  form.dataset.statusKey = "uploadProgress";
  form.dataset.statusRawMessage = "";
  form.dataset.statusState = "info";
  submitButton.disabled = true;
  updateCard(form.closest(".artifact-card"), form.closest(".artifact-card")._item);

  try {
    await requestJson(buildApiUrl("upload-model.php", { id: form.dataset.itemId }), {
      method: "POST",
      body: payload
    });

    form.dataset.statusKey = "uploadSuccess";
    form.dataset.statusRawMessage = "";
    form.dataset.statusState = "success";
    updateFormStatus(form);
    await loadItems({ silent: true });
  } catch (error) {
    form.dataset.statusKey = "";
    form.dataset.statusRawMessage = error instanceof ApiError ? error.message : "";
    form.dataset.statusState = "error";
    const message = translateApiMessage(
      error instanceof ApiError ? error.message : t("uploadError")
    );
    setStatus(status, message, "error");
  } finally {
    form.dataset.busy = "false";
    submitButton.disabled = false;
    updateCard(form.closest(".artifact-card"), form.closest(".artifact-card")._item);
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

grid.addEventListener("click", async (event) => {
  const button = event.target.closest(".artifact-delete-button");

  if (!button) {
    return;
  }

  const card = button.closest(".artifact-card");
  if (!card) {
    return;
  }

  await deleteItem(card);
});

refreshButton.addEventListener("click", async () => {
  await loadItems();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadItems({ silent: true });
  }
});

state.refreshTimer = window.setInterval(() => {
  loadItems({ silent: true });
}, 15000);

window.addEventListener("beforeunload", () => {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
  }
});

initLanguageSwitcher();
onLanguageChange(applyTranslations);
loadItems();
