export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "prismxgpt.theme";

export function getStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "dark";
  return (window.localStorage.getItem(THEME_KEY) as ThemeChoice | null) ?? "system";
}

export function resolveTheme(theme: ThemeChoice): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyTheme(theme: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

export function setTheme(theme: ThemeChoice) {
  if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

let systemListenerAttached = false;
export function initTheme() {
  if (typeof window === "undefined") return;
  applyTheme(getStoredTheme());
  if (systemListenerAttached) return;
  systemListenerAttached = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getStoredTheme() === "system") applyTheme("system");
  };
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else mq.addListener(handler);
}
