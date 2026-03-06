import * as React from "react";

const MOBILE_BREAKPOINT = 768;
<<<<<<< HEAD
const VIEW_MODE_STORAGE_KEY = "lawyerbot:view-mode";
const VIEW_MODE_EVENT = "lawyerbot:view-mode-change";

export type ViewMode = "mobile" | "desktop" | null;

const readStoredMode = (): ViewMode => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (raw === "mobile" || raw === "desktop") return raw;
  return null;
};

const writeStoredMode = (mode: Exclude<ViewMode, null>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: mode }));
};

export function useViewportMode() {
  const [forcedMode, setForcedMode] = React.useState<ViewMode>(null);
  const [nativeMobile, setNativeMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onMediaChange = () => setNativeMobile(window.innerWidth < MOBILE_BREAKPOINT);
    const onModeChange = () => setForcedMode(readStoredMode());

    setForcedMode(readStoredMode());
    onMediaChange();

    mql.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onModeChange);
    window.addEventListener(VIEW_MODE_EVENT, onModeChange as EventListener);

    return () => {
      mql.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onModeChange);
      window.removeEventListener(VIEW_MODE_EVENT, onModeChange as EventListener);
    };
  }, []);

  const isMobile = forcedMode ? forcedMode === "mobile" : !!nativeMobile;

  const setMode = React.useCallback((mode: "mobile" | "desktop") => {
    writeStoredMode(mode);
    setForcedMode(mode);
  }, []);

  const toggleMode = React.useCallback(() => {
    setMode(isMobile ? "desktop" : "mobile");
  }, [isMobile, setMode]);

  return { isMobile, forcedMode, setMode, toggleMode };
}

export function useIsMobile() {
  const { isMobile } = useViewportMode();
  return isMobile;
=======

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
}
