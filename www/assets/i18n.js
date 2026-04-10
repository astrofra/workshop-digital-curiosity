const STORAGE_KEY = "curiosity-language";
const SUPPORTED_LANGUAGES = ["fr", "en"];
const listeners = new Set();

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : "fr";
}

function detectInitialLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normalizeLanguage(stored);
    }
  } catch {
    // Ignore storage access errors.
  }

  const documentLanguage = document.documentElement.lang?.slice(0, 2).toLowerCase();
  if (documentLanguage) {
    return normalizeLanguage(documentLanguage);
  }

  const browserLanguage = navigator.language?.slice(0, 2).toLowerCase();
  return normalizeLanguage(browserLanguage);
}

let currentLanguage = detectInitialLanguage();
document.documentElement.lang = currentLanguage;

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(language) {
  const nextLanguage = normalizeLanguage(language);
  if (nextLanguage === currentLanguage) {
    return;
  }

  currentLanguage = nextLanguage;
  document.documentElement.lang = currentLanguage;

  try {
    window.localStorage.setItem(STORAGE_KEY, currentLanguage);
  } catch {
    // Ignore storage access errors.
  }

  for (const listener of listeners) {
    listener(currentLanguage);
  }
}

export function onLanguageChange(listener, options = {}) {
  const { immediate = true } = options;
  listeners.add(listener);

  if (immediate) {
    listener(currentLanguage);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function initLanguageSwitcher(root = document) {
  const switchers = [...root.querySelectorAll("[data-lang-switcher]")];

  if (!switchers.length) {
    return () => {};
  }

  for (const switcher of switchers) {
    const buttons = [...switcher.querySelectorAll("[data-lang]")];
    for (const button of buttons) {
      if (button.dataset.langBound === "true") {
        continue;
      }

      button.dataset.langBound = "true";
      button.addEventListener("click", () => {
        setLanguage(button.dataset.lang);
      });
    }
  }

  return onLanguageChange((language) => {
    for (const switcher of switchers) {
      const label = switcher.dataset.labelFr && switcher.dataset.labelEn
        ? (language === "fr" ? switcher.dataset.labelFr : switcher.dataset.labelEn)
        : "Language";
      switcher.setAttribute("aria-label", label);

      for (const button of switcher.querySelectorAll("[data-lang]")) {
        const isActive = button.dataset.lang === language;
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    }
  });
}

export function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

export function translateKnownMessage(message, language, translations = {}) {
  if (!message) {
    return "";
  }

  if (language === "fr") {
    return message;
  }

  return translations[message] ?? message;
}
