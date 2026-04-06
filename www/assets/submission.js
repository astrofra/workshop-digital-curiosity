import { ApiError, buildApiUrl, requestJson, setStatus } from "/assets/common.js";

const form = document.querySelector("[data-upload-form]");
const statusElement = document.querySelector("[data-form-status]");
const previewImage = document.querySelector("[data-preview-image]");
const previewEmpty = document.querySelector("[data-preview-empty]");
const confirmationCard = document.querySelector("[data-confirmation]");
const confirmationText = document.querySelector("[data-confirmation-text]");

const participantField = form.elements.participant_id;
const imageField = form.elements.image;
const submitButton = form.querySelector('button[type="submit"]');
const defaultButtonLabel = submitButton.textContent;

function resetPreview() {
  previewImage.hidden = true;
  previewImage.removeAttribute("src");
  previewEmpty.hidden = false;
}

function updatePreview(file) {
  if (!file) {
    resetPreview();
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    previewImage.src = reader.result;
    previewImage.hidden = false;
    previewEmpty.hidden = true;
  });
  reader.readAsDataURL(file);
}

participantField.addEventListener("input", () => {
  participantField.value = participantField.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

imageField.addEventListener("change", () => {
  updatePreview(imageField.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(statusElement, "", "info");
  confirmationCard.hidden = true;

  const payload = new FormData(form);
  payload.set("participant_id", participantField.value.toUpperCase().trim());

  submitButton.disabled = true;
  submitButton.textContent = "Envoi en cours...";

  try {
    const response = await requestJson(buildApiUrl("upload.php"), {
      method: "POST",
      body: payload
    });

    form.reset();
    resetPreview();
    confirmationText.textContent = `${response.message} L'objet "${response.item.name}" est visible dans le musee.`;
    confirmationCard.hidden = false;
    setStatus(statusElement, response.message || "Contribution envoyee avec succes.", "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Impossible d'envoyer la contribution.";
    setStatus(statusElement, message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = defaultButtonLabel;
  }
});

resetPreview();
