import { useCallback, useState } from "react";

const ONBOARDING_DISMISSED_KEY = "cognetivy-onboarding-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function setDismissedPermanently(): void {
  try {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  } catch {
    // ignore
  }
}

export interface UseOnboardingVisibilityResult {
  /** True when the user has not chosen "never show again". */
  shouldShow: boolean;
  /** Close the modal for this session only. */
  dismiss: () => void;
  /** Persist "never show again" and close. */
  dismissPermanently: () => void;
  /** Whether the modal is open (shouldShow and not closed this session). */
  open: boolean;
  /** Call when user closes the modal (without "never show again"). */
  closeForSession: () => void;
}

export function useOnboardingVisibility(): UseOnboardingVisibilityResult {
  const [dismissedPermanentlyState, setDismissedPermanentlyState] = useState(readDismissed);
  const [closedThisSession, setClosedThisSession] = useState(false);

  const shouldShow = !dismissedPermanentlyState;
  const open = shouldShow && !closedThisSession;

  const dismiss = useCallback(function dismiss() {
    setClosedThisSession(true);
  }, []);

  const dismissPermanently = useCallback(function dismissPermanently() {
    setDismissedPermanentlyState(true);
    setClosedThisSession(true);
    setDismissedPermanently();
  }, []);

  const closeForSession = useCallback(function closeForSession() {
    setClosedThisSession(true);
  }, []);

  return {
    shouldShow,
    dismiss,
    dismissPermanently,
    open,
    closeForSession,
  };
}
