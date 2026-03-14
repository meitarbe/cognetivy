/**
 * URL helpers for onboarding and opening the Cognetivy app (used by default command and tests).
 */

const DEFAULT_LOCAL_APP_PORT = 5173;

/** Cloud app URL (Cognetivy in browser). Use COGNETIVY_APP_URL, or localhost when in dev, else production. */
export function getCloudAppUrl(): string {
  if (process.env.COGNETIVY_APP_URL) {
    return process.env.COGNETIVY_APP_URL.replace(/\/$/, "");
  }
  const isLocalDev =
    process.env.NODE_ENV === "development" ||
    process.env.COGNETIVY_DEV === "true" ||
    process.env.COGNETIVY_DEV === "1";
  if (isLocalDev) {
    const port = process.env.COGNETIVY_APP_PORT ?? String(DEFAULT_LOCAL_APP_PORT);
    return `http://localhost:${port}`;
  }
  return "https://app.cognetivy.com";
}

/** Build the app URL to open for cloud onboarding; when workflowId is set, returns workflow deep link. */
export function buildCloudOnboardingUrl(appUrl: string, workflowId: string | null): string {
  if (workflowId == null) return appUrl;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/workflow?workflow_id=${encodeURIComponent(workflowId)}`;
}
