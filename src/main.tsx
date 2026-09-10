import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { LanguageProvider } from "./i18n-react";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
