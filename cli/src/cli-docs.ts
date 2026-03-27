/**
 * POC: Build CLI spec from Commander and open a local HTML docs page in the browser.
 */
import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import open from "open";

export interface CliOptionSpec {
  term: string;
  description: string;
}

export interface CliCommandSpec {
  name: string;
  description: string;
  options: CliOptionSpec[];
  commands: CliCommandSpec[];
}

export interface CliSpec {
  name: string;
  description: string;
  version: string;
  /** What happens when running the CLI with no subcommand (e.g. just `cognetivy`). */
  defaultBehavior?: string;
  options: CliOptionSpec[];
  commands: CliCommandSpec[];
}

function buildCommandSpec(cmd: Command, helper: ReturnType<Command["createHelp"]>): CliCommandSpec {
  const visibleOptions = helper.visibleOptions(cmd);
  const visibleCommands = helper.visibleCommands(cmd);
  return {
    name: cmd.name(),
    description: cmd.description(),
    options: visibleOptions.map((opt) => ({
      term: helper.optionTerm(opt),
      description: helper.optionDescription(opt),
    })),
    commands: visibleCommands
      .filter((c) => c.name() !== "help")
      .map((c) => buildCommandSpec(c, helper)),
  };
}

export function buildCliSpec(root: Command): CliSpec {
  const helper = root.createHelp();
  const visibleOptions = helper.visibleOptions(root);
  const visibleCommands = helper.visibleCommands(root);
  return {
    name: root.name(),
    description: root.description(),
    version: (root as { version?: () => string }).version?.() ?? "",
    options: visibleOptions.map((opt) => ({
      term: helper.optionTerm(opt),
      description: helper.optionDescription(opt),
    })),
    commands: visibleCommands
      .filter((c) => c.name() !== "help")
      .map((c) => buildCommandSpec(c, helper)),
  };
}

function renderCommand(spec: CliCommandSpec, prefix: string, depth: number): string {
  const fullName = prefix ? `${prefix} ${spec.name}` : spec.name;
  const hasContent = spec.options.length > 0 || spec.commands.length > 0;
  const optionsHtml =
    spec.options.length > 0
      ? `
    <div class="options-block">
      <div class="options-label">Options</div>
      <table class="options-table">
        <thead><tr><th>Option</th><th>Description</th></tr></thead>
        <tbody>
          ${spec.options.map((o) => `<tr><td><span class="option-term">${escapeHtml(o.term)}</span></td><td>${escapeHtml(o.description)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`
      : "";
  const subcommandsHtml =
    spec.commands.length > 0
      ? `
    <div class="subcommands-block">
      <div class="subcommands-label">Subcommands</div>
      <div class="subcommands-list">
        ${spec.commands.map((c) => renderCommand(c, fullName, depth + 1)).join("")}
      </div>
    </div>`
      : "";
  const bodyHtml = hasContent ? optionsHtml + subcommandsHtml : `<p class="description-only">${escapeHtml(spec.description)}</p>`;
  return `
  <details class="command-card" data-command="${escapeAttr(fullName)}" data-depth="${depth}" ${depth === 0 ? "open" : ""}>
    <summary class="command-summary">
      <span class="command-name">${escapeHtml(fullName)}</span>
      <span class="command-desc">${escapeHtml(spec.description)}</span>
    </summary>
    <div class="command-body">
      ${bodyHtml}
    </div>
  </details>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function generateDocsHtml(spec: CliSpec): string {
  const globalOptionsHtml =
    spec.options.length > 0
      ? `
    <details class="global-options-card" open>
      <summary class="card-summary">
        <span class="card-title">Global options</span>
      </summary>
      <div class="card-body">
        <table class="options-table">
          <thead><tr><th>Option</th><th>Description</th></tr></thead>
          <tbody>
            ${spec.options.map((o) => `<tr><td><span class="option-term">${escapeHtml(o.term)}</span></td><td>${escapeHtml(o.description)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </details>`
      : "";

  const commandsHtml = spec.commands.map((c) => renderCommand(c, spec.name, 0)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(spec.name)} CLI reference</title>
  <style>
    :root {
      --header-bg: #1e293b;
      --header-text: #f1f5f9;
      --accent: #0d9488;
      --accent-hover: #0f766e;
      --card-border: #e2e8f0;
      --card-bg: #ffffff;
      --body-bg: #f1f5f9;
      --text: #334155;
      --text-muted: #64748b;
      --option-bg: #f0fdfa;
      --option-border: #99f6e4;
    }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; background: var(--body-bg); color: var(--text); line-height: 1.6; }
    .topbar {
      background: var(--header-bg); color: var(--header-text); padding: 1rem 1.5rem; margin-bottom: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .topbar h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
    .topbar .version { margin: 0.25rem 0 0; font-size: 0.875rem; opacity: 0.85; }
    .topbar .tagline { margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9; max-width: 42rem; }
    .main { max-width: 920px; margin: 0 auto; padding: 1.5rem; }
    .section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 1.5rem 0 0.75rem; }
    .section-title:first-of-type { margin-top: 0; }
    .section-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin: 1.5rem 0 0.75rem; }
    .section-header:first-of-type { margin-top: 0; }
    .section-header .section-title { margin: 0; }
    details { display: block; margin-bottom: 0.5rem; }
    .command-card, .global-options-card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px;
      overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .command-card[data-depth="0"] { border-left: 4px solid var(--accent); }
    .command-card[data-depth="1"] { border-left: 4px solid #38bdf8; margin-left: 0.5rem; }
    .command-card[data-depth="2"] { border-left: 4px solid #a78bfa; margin-left: 1rem; }
    .command-summary, .card-summary {
      list-style: none; cursor: pointer; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem;
      flex-wrap: wrap; user-select: none;
    }
    .command-summary::-webkit-details-marker, .card-summary::-webkit-details-marker { display: none; }
    .command-summary::before, .card-summary::before {
      content: ''; display: inline-block; width: 0; height: 0;
      border-left: 5px solid var(--text-muted); border-top: 4px solid transparent; border-bottom: 4px solid transparent;
      margin-right: 0.5rem; transition: transform 0.2s;
    }
    details[open] > .command-summary::before, details[open] > .card-summary::before { transform: rotate(90deg); }
    .command-summary:hover, .card-summary:hover { background: #f8fafc; }
    .command-name { font-weight: 600; color: var(--accent); font-family: ui-monospace, monospace; font-size: 0.95rem; }
    .command-desc { color: var(--text-muted); font-size: 0.875rem; }
    .card-title { font-weight: 600; color: var(--text); }
    .command-body, .card-body { padding: 0 1rem 1rem; border-top: 1px solid var(--card-border); }
    .options-block, .subcommands-block { margin-top: 1rem; }
    .options-block:first-child, .subcommands-block:first-child { margin-top: 0.75rem; }
    .options-label, .subcommands-label {
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    .options-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .options-table th, .options-table td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--card-border); vertical-align: top; }
    .options-table th { color: var(--text-muted); font-weight: 600; }
    .options-table tbody tr:hover { background: #f8fafc; }
    .option-term {
      display: inline-block; background: var(--option-bg); color: #0f766e; padding: 0.2em 0.5em;
      border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.85em; border: 1px solid var(--option-border);
    }
    .subcommands-list { margin-top: 0.5rem; }
    .description-only { margin: 0; color: var(--text-muted); font-size: 0.875rem; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--card-border); font-size: 0.8rem; color: var(--text-muted); }
    .footer code { background: #e2e8f0; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.85em; }
    .expand-actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
    .btn { cursor: pointer; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 500; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text); }
    .btn:hover { background: #e2e8f0; }
    .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }
    .default-behavior-card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px;
      padding: 1rem 1.25rem; margin-bottom: 0.5rem; border-left: 4px solid var(--accent);
    }
    .default-behavior-desc { margin: 0 0 0.75rem; color: var(--text); }
    .default-behavior-usage { margin: 0 0 0.25rem; font-size: 0.8rem; color: var(--text-muted); }
    .default-behavior-cmd { display: inline-block; background: var(--option-bg); color: #0f766e; padding: 0.35em 0.6em; border-radius: 4px; font-size: 0.95rem; border: 1px solid var(--option-border); }
  </style>
</head>
<body>
  <header class="topbar">
    <h1>${escapeHtml(spec.name)}</h1>
    ${spec.version ? `<p class="version">Version ${escapeHtml(spec.version)}</p>` : ""}
    <p class="tagline">${escapeHtml(spec.description)}</p>
  </header>
  <main class="main">
    ${spec.defaultBehavior ? `
    <div class="section-title">Default behavior</div>
    <div class="default-behavior-card">
      <p class="default-behavior-desc">${escapeHtml(spec.defaultBehavior)}</p>
      <p class="default-behavior-usage">Run with no arguments:</p>
      <code class="default-behavior-cmd">${escapeHtml(spec.name)}</code>
    </div>
    ` : ""}
    ${spec.options.length > 0 ? `<div class="section-title">Global</div>${globalOptionsHtml}` : ""}
    <div class="section-header">
      <span class="section-title">Commands</span>
      <div class="expand-actions">
        <button type="button" class="btn btn-sm" id="expand-all">Expand all</button>
        <button type="button" class="btn btn-sm" id="collapse-all">Collapse all</button>
      </div>
    </div>
    ${commandsHtml}
    <p class="footer">Generated from CLI. Use <code>${escapeHtml(spec.name)} --help</code> in the terminal for quick help.</p>
  </main>
  <script>
    (function() {
      var cards = document.querySelectorAll('.command-card, .global-options-card');
      document.getElementById('expand-all').onclick = function() { cards.forEach(function(d) { d.open = true; }); };
      document.getElementById('collapse-all').onclick = function() { cards.forEach(function(d) { d.open = false; }); };
    })();
  </script>
</body>
</html>`;
}

export interface OpenCliDocsOptions {
  /** What happens when running the CLI with no subcommand. Shown as "Default behavior" in the docs. */
  defaultBehavior?: string;
}

export async function openCliDocsInBrowser(root: Command, options?: OpenCliDocsOptions): Promise<void> {
  const spec = buildCliSpec(root);
  if (options?.defaultBehavior) {
    spec.defaultBehavior = options.defaultBehavior;
  }
  const html = generateDocsHtml(spec);
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, "cognetivy-cli-docs.html");
  await fs.writeFile(tmpPath, html, "utf-8");
  await open(tmpPath);
  console.log(`Opened CLI reference at ${tmpPath}`);
}
