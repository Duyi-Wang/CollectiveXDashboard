import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LANGUAGE_STORAGE_KEY,
  readLanguage,
  translate,
  translateMessage,
  type Language,
  type TranslationParams,
} from "./i18n";

import { DASHBOARD_TITLE } from "./branding";

const LanguageContext = createContext({
  language: "en" as Language,
  setLanguage: (_language: Language) => {},
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage);
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = translate(DASHBOARD_TITLE, language);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        translate(
          "MORI 内部 fork 的 CollectiveX 通信性能实验台。导入 InferenceX、GitHub Actions 和本地数据，对比 GPU 通信延迟与带宽。",
          language,
        ),
      );
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      /* Switching still works when storage is unavailable. */
    }
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = useCallback(
    (key: string, params?: TranslationParams) =>
      translate(key, language, params),
    [language],
  );
  const message = useCallback(
    (value: string) => translateMessage(value, language),
    [language],
  );
  return { language, setLanguage, t, message };
}
export function LanguageSwitch() {
  const { language, setLanguage } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label="Language / 语言">
      <button
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        lang="zh-CN"
        aria-label="中文"
        aria-pressed={language === "zh"}
        onClick={() => setLanguage("zh")}
      >
        中文
      </button>
    </div>
  );
}
