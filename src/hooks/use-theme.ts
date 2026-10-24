// src/hooks/use-theme.ts
import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "saban-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem(KEY) as Theme | null;
    } catch {
      saved = null;
    }
    const initial: Theme =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  return { theme, toggleTheme };
}