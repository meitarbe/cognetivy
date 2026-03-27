import http from "node:http";
import open from "open";

const SUCCESS_HTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cognetivy CLI</title></head>
<body style="font-family:system-ui;max-width:480px;margin:3rem auto;text-align:center;">
  <h1>Logged in</h1>
  <p>You can close this window and return to the terminal.</p>
</body></html>
`;

const DENIED_HTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cognetivy CLI</title></head>
<body style="font-family:system-ui;max-width:480px;margin:3rem auto;text-align:center;">
  <h1>Authorization denied</h1>
  <p>You can close this window.</p>
</body></html>
`;

export interface LoginFlowResult {
  code?: string;
  error?: string;
}

/**
 * Start a temporary HTTP server, open the browser to the app's CLI auth page,
 * and resolve when the user completes the flow (code or error).
 */
export function runLoginFlow(options: {
  appUrl: string;
  timeoutMs?: number;
}): Promise<LoginFlowResult> {
  const { appUrl, timeoutMs = 5 * 60 * 1000 } = options;
  const baseUrl = appUrl.replace(/\/$/, "");

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      const parsed = new URL(url, `http://127.0.0.1`);
      const code = parsed.searchParams.get("code");
      const error = parsed.searchParams.get("error");

      const sendHtml = (html: string, status = 200) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      };

      if (parsed.pathname === "/callback" || parsed.pathname === "/callback/") {
        server.close();
        if (code) {
          sendHtml(SUCCESS_HTML);
          resolve({ code });
        } else if (error) {
          sendHtml(DENIED_HTML);
          resolve({ error: error === "denied" ? "Authorization denied" : error });
        } else {
          sendHtml("<body>Missing code or error. Close this window.</body>", 400);
          resolve({ error: "Missing code or error in callback" });
        }
        return;
      }

      sendHtml("<body>Not found. Use the CLI auth flow.</body>", 404);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        resolve({ error: "Could not bind callback server" });
        return;
      }
      const port = addr.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${baseUrl}/cli-auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const timeout = setTimeout(() => {
        server.close();
        resolve({ error: "Login timed out. Please try again." });
      }, timeoutMs);

      server.on("close", () => clearTimeout(timeout));

      open(authUrl).catch(() => {
        console.error("Could not open browser. Visit this URL to authorize:");
        console.error(authUrl);
      });
    });

    server.on("error", (err) => {
      server.close();
      resolve({ error: err.message ?? "Server error" });
    });
  });
}
