import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Deutsch primär, Englisch als Fallback (Abschnitt 5).
const resources = {
  de: {
    translation: {
      appTitle: "WM-Tipp-Assistent 2026",
      tagline: "Begründete Ergebnistipps für die FIFA WM 2026.",
      nav: {
        overview: "Übersicht",
        groups: "Gruppen",
        accuracy: "Genauigkeit",
        settings: "Einstellungen",
      },
      placeholder:
        "Die App wird gerade aufgebaut. Daten und Tipps folgen in den nächsten Phasen.",
      disclaimer:
        "Keine Wett- oder Finanzberatung. Tipps ohne Gewähr.",
    },
  },
  en: {
    translation: {
      appTitle: "World Cup Tip Assistant 2026",
      tagline: "Reasoned score predictions for the FIFA World Cup 2026.",
      nav: {
        overview: "Overview",
        groups: "Groups",
        accuracy: "Accuracy",
        settings: "Settings",
      },
      placeholder:
        "The app is being built. Data and predictions will follow in the next phases.",
      disclaimer: "Not betting or financial advice. Predictions without warranty.",
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "de",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
