import { ApiError, buildApiUrl, requestJson, setStatus } from "./common.js";
import {
  getLanguage,
  initLanguageSwitcher,
  interpolate,
  onLanguageChange,
  translateKnownMessage
} from "./i18n.js";

const translations = {
  fr: {
    pageTitle: "Curiosity Museum - Soumettre un artefact",
    heroEyebrow: "Cabinet synthetique",
    heroTitle: "Deposez un fragment, laissez la machine imaginer l'objet.",
    heroLede: `Chaque participant televerse une image et quelques mots. L'archive produit ensuite une reconstruction 3D, exposee dans le musee collectif, ou cabinet de curiosité.
<br><br>
Combien de temps dans le futur nos objets peuvent-ils voyager ? Combien de centaines d'années peuvent-elles s'écouler avant que leur usage et leur raison d'exister soit complètement perdus ?
<br><br>
Quel sens donnera l'humanité du futur à ces artefacts, une fois détachés de l'époque à laquelle ils ont été imaginés et fabriqués ?`,
    formEyebrow: "Soumission",
    formTitle: "Ajouter un artefact",
    participantLabel: "Code participant",
    objectNameLabel: "Nom de l'objet",
    objectNamePlaceholder: "Relique oscillante",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Decrivez la fonction, l'origine ou le pouvoir de l'objet.",
    authorLabel: "Auteur ou autrice (optionnel)",
    authorPlaceholder: "Votre nom",
    dateLabel: "Date fictive (optionnel)",
    datePlaceholder: "An 2473, Epoque basaltique, etc.",
    imageLabel: "Image source",
    imageSecondLabel: "Seconde image (optionnel)",
    submitIdle: "Envoyer au cabinet",
    submitBusy: "Envoi en cours...",
    confirmationEyebrow: "Archive mise a jour",
    confirmationTitle: "Contribution enregistree",
    confirmationLink: "Voir le musee",
    previewEyebrow: "Apercu",
    previewTitle: "Trace visuelle",
    previewEmpty: "Vos images apparaitront ici avant d'entrer dans l'archive.",
    previewCaption: "Sans modele GLB, le musee exposera temporairement vos images composees sur un seul artefact en attente.",
    successCreated: `Contribution enregistree. L'objet "{name}" est visible dans le musee. Vous pouvez encore modifier le formulaire puis renvoyer une nouvelle version.`,
    successReplaced: `Contribution remplacee. L'objet "{name}" est visible dans le musee. Vous pouvez encore modifier le formulaire puis renvoyer une nouvelle version.`,
    genericSuccess: "Contribution envoyee avec succes.",
    genericError: "Impossible d'envoyer la contribution.",
    sendingStatus: "Envoi en cours..."
  },
  en: {
    pageTitle: "Curiosity Museum - Submit an Artifact",
    heroEyebrow: "Synthetic cabinet",
    heroTitle: "Drop a fragment, let the machine imagine the object.",
    heroLede: `Each participant uploads an image and a few words. The archive then produces a 3D reconstruction, displayed in the collective museum, or cabinet of curiosity.
<br><br>
How far into the future can our objects travel? How many centuries may pass before their use and reason for existing are completely lost?
<br><br>
What meaning will future humanity give to these artifacts once they have been detached from the era in which they were imagined and made?`,
    formEyebrow: "Submission",
    formTitle: "Add an artifact",
    participantLabel: "Participant code",
    objectNameLabel: "Object name",
    objectNamePlaceholder: "Oscillating relic",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Describe the object's function, origin, or power.",
    authorLabel: "Author (optional)",
    authorPlaceholder: "Your name",
    dateLabel: "Fictional date (optional)",
    datePlaceholder: "Year 2473, Basaltic Era, etc.",
    imageLabel: "Source image",
    imageSecondLabel: "Second image (optional)",
    submitIdle: "Send to the cabinet",
    submitBusy: "Sending...",
    confirmationEyebrow: "Archive updated",
    confirmationTitle: "Contribution saved",
    confirmationLink: "View the museum",
    previewEyebrow: "Preview",
    previewTitle: "Visual trace",
    previewEmpty: "Your images will appear here before entering the archive.",
    previewCaption: "Without a GLB model, the museum will temporarily display your blended images as a waiting artifact.",
    successCreated: `Contribution saved. The object "{name}" is now visible in the museum. You can still edit the form and send a revised version.`,
    successReplaced: `Contribution updated. The object "{name}" is now visible in the museum. You can still edit the form and send a revised version.`,
    genericSuccess: "Contribution sent successfully.",
    genericError: "Unable to send the contribution.",
    sendingStatus: "Sending..."
  }
};

const apiMessageTranslations = {
  "Contribution enregistree.": "Contribution saved.",
  "Contribution remplacee.": "Contribution updated.",
  "Veuillez joindre une image.": "Please attach an image.",
  "Le code participant doit contenir exactement 4 lettres.": "The participant code must contain exactly 4 letters.",
  "Veuillez remplir tous les champs obligatoires.": "Please fill in all required fields.",
  "Un champ depasse la longueur autorisee.": "One of the fields exceeds the allowed length.",
  "Ce code participant n est pas autorise.": "This participant code is not authorized.",
  "Le fichier image n est pas dans un format accepte.": "The image file format is not accepted.",
  "L image depasse la taille maximale autorisee.": "The image exceeds the maximum allowed size.",
  "Une erreur interne est survenue.": "An internal error occurred."
};

const form = document.querySelector("[data-upload-form]");
const statusElement = document.querySelector("[data-form-status]");
const previewStack = document.querySelector("[data-preview-stack]");
const previewImage = document.querySelector("[data-preview-image]");
const previewImageSecond = document.querySelector("[data-preview-image-second]");
const previewEmpty = document.querySelector("[data-preview-empty]");
const confirmationCard = document.querySelector("[data-confirmation]");
const confirmationText = document.querySelector("[data-confirmation-text]");
const heroEyebrow = document.querySelector(".hero-panel .eyebrow");
const heroTitle = document.querySelector(".submit-hero-title");
const heroLede = document.querySelector(".submit-hero-lede");
const formEyebrow = document.querySelector(".form-panel .panel-heading .eyebrow");
const formTitle = document.querySelector(".form-panel .panel-heading h2");
const previewEyebrow = document.querySelector(".preview-panel .panel-heading .eyebrow");
const previewTitle = document.querySelector(".preview-panel .panel-heading h2");
const previewCaption = document.querySelector(".preview-caption");
const confirmationEyebrow = document.querySelector(".confirmation-card .eyebrow");
const confirmationTitle = document.querySelector(".confirmation-card h3");
const confirmationLink = document.querySelector(".confirmation-card .text-link");

const participantField = form.elements.participant_id;
const imageField = form.elements.image;
const imageFieldSecond = form.elements.image_2;
const nameField = form.elements.name;
const descriptionField = form.elements.description;
const authorField = form.elements.author;
const fictionalDateField = form.elements.fictional_date;
const submitButton = form.querySelector('button[type="submit"]');

const state = {
  isSubmitting: false,
  lastConfirmationKind: null,
  lastConfirmationName: "",
  lastStatusKey: "",
  lastStatusRawMessage: "",
  lastStatusDetail: "",
  lastStatusState: "info"
};

function t(key) {
  return translations[getLanguage()][key];
}

function translateApiMessage(message) {
  return translateKnownMessage(message, getLanguage(), apiMessageTranslations);
}

function resetPreview() {
  previewStack.dataset.count = "0";
  previewStack.hidden = true;
  previewImage.hidden = true;
  previewImage.removeAttribute("src");
  previewImageSecond.hidden = true;
  previewImageSecond.removeAttribute("src");
  previewEmpty.hidden = false;
}

function applyPreview(primarySource = "", secondarySource = "") {
  const hasPrimary = Boolean(primarySource);
  const hasSecondary = Boolean(secondarySource);
  previewStack.dataset.count = hasPrimary && hasSecondary ? "2" : hasPrimary || hasSecondary ? "1" : "0";

  previewStack.hidden = !hasPrimary && !hasSecondary;
  previewImage.hidden = !hasPrimary;
  previewImageSecond.hidden = !hasSecondary;

  if (hasPrimary) {
    previewImage.src = primarySource;
  } else {
    previewImage.removeAttribute("src");
  }

  if (hasSecondary) {
    previewImageSecond.src = secondarySource;
  } else {
    previewImageSecond.removeAttribute("src");
  }

  previewEmpty.hidden = hasPrimary || hasSecondary;
}

function updatePreview() {
  const primaryFile = imageField.files[0];
  const secondaryFile = imageFieldSecond.files[0];

  if (!primaryFile && !secondaryFile) {
    resetPreview();
    return;
  }

  let primarySource = "";
  let secondarySource = "";
  let pending = 0;

  const maybeRender = () => {
    if (pending === 0) {
      applyPreview(primarySource, secondarySource);
    }
  };

  const readFile = (file, assign) => {
    if (!file) {
      return;
    }

    pending += 1;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      assign(String(reader.result || ""));
      pending -= 1;
      maybeRender();
    });
    reader.addEventListener("error", () => {
      pending -= 1;
      maybeRender();
    });
    reader.readAsDataURL(file);
  };

  readFile(primaryFile, (value) => {
    primarySource = value;
  });
  readFile(secondaryFile, (value) => {
    secondarySource = value;
  });
  maybeRender();
}

function renderConfirmation() {
  if (!state.lastConfirmationKind) {
    return;
  }

  const template = state.lastConfirmationKind === "replaced" ? t("successReplaced") : t("successCreated");
  confirmationText.textContent = interpolate(template, { name: state.lastConfirmationName });
}

function renderStatus() {
  let message = "";

  if (state.lastStatusKey) {
    message = t(state.lastStatusKey);
  } else if (state.lastStatusRawMessage) {
    message = translateApiMessage(state.lastStatusRawMessage);
  }

  if (message && state.lastStatusDetail) {
    message = `${message} (${state.lastStatusDetail})`;
  }

  if (!message) {
    setStatus(statusElement, "", "info");
    return;
  }

  setStatus(statusElement, message, state.lastStatusState);
}

function renderSubmitButton() {
  submitButton.textContent = state.isSubmitting ? t("submitBusy") : t("submitIdle");
}

function applyTranslations() {
  document.title = t("pageTitle");
  heroEyebrow.textContent = t("heroEyebrow");
  heroTitle.textContent = t("heroTitle");
  heroLede.innerHTML = t("heroLede");
  formEyebrow.textContent = t("formEyebrow");
  formTitle.textContent = t("formTitle");
  previewEyebrow.textContent = t("previewEyebrow");
  previewTitle.textContent = t("previewTitle");
  previewCaption.textContent = t("previewCaption");
  confirmationEyebrow.textContent = t("confirmationEyebrow");
  confirmationTitle.textContent = t("confirmationTitle");
  confirmationLink.textContent = t("confirmationLink");
  previewEmpty.querySelector("p").textContent = t("previewEmpty");

  participantField.closest(".field").querySelector("span").textContent = t("participantLabel");
  nameField.closest(".field").querySelector("span").textContent = t("objectNameLabel");
  descriptionField.closest(".field").querySelector("span").textContent = t("descriptionLabel");
  authorField.closest(".field").querySelector("span").textContent = t("authorLabel");
  fictionalDateField.closest(".field").querySelector("span").textContent = t("dateLabel");
  imageField.closest(".field").querySelector("span").textContent = t("imageLabel");
  imageFieldSecond.closest(".field").querySelector("span").textContent = t("imageSecondLabel");

  nameField.placeholder = t("objectNamePlaceholder");
  descriptionField.placeholder = t("descriptionPlaceholder");
  authorField.placeholder = t("authorPlaceholder");
  fictionalDateField.placeholder = t("datePlaceholder");

  renderSubmitButton();
  renderConfirmation();
  renderStatus();
}

participantField.addEventListener("input", () => {
  participantField.value = participantField.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

imageField.addEventListener("change", () => {
  updatePreview();
});

imageFieldSecond.addEventListener("change", () => {
  updatePreview();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.lastStatusKey = "";
  state.lastStatusRawMessage = "";
  state.lastStatusDetail = "";
  renderStatus();
  confirmationCard.hidden = true;

  const payload = new FormData(form);
  payload.set("participant_id", participantField.value.toUpperCase().trim());

  state.isSubmitting = true;
  renderSubmitButton();

  try {
    const response = await requestJson(buildApiUrl("upload.php", { debug: 1 }), {
      method: "POST",
      body: payload
    });

    state.lastConfirmationKind = response.message === "Contribution remplacee." ? "replaced" : "created";
    state.lastConfirmationName = response.item.name;
    renderConfirmation();
    confirmationCard.hidden = false;

    state.lastStatusRawMessage = response.message || "";
    state.lastStatusDetail = "";
    state.lastStatusState = "success";
    renderStatus();
  } catch (error) {
    if (error instanceof ApiError) {
      state.lastStatusRawMessage = error.message;
      state.lastStatusKey = "";
      state.lastStatusDetail = error.payload?.detail || "";
    } else {
      state.lastStatusKey = "genericError";
      state.lastStatusRawMessage = "";
      state.lastStatusDetail = "";
    }
    state.lastStatusState = "error";
    renderStatus();
  } finally {
    state.isSubmitting = false;
    renderSubmitButton();
  }
});

initLanguageSwitcher();
onLanguageChange(applyTranslations);
resetPreview();
