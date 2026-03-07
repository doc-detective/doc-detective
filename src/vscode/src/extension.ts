import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsp } from 'fs';
import { detectTests } from "../../common/src/detectTests.js";
import { validate } from "../../common/src/validate.js";
import type { SchemaKey } from "../../common/src/schemas/index.js";
import YAML from "yaml";
import { resolveFileTypes, matchFileType } from "./fileTypeResolver.js";

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Create an output channel for logging
const outputChannel = vscode.window.createOutputChannel('Doc Detective');

/**
 * Logs a message to both the console and the extension's output channel.
 */
function log(message: string) {
  console.log(message);
  outputChannel.appendLine(message);
}

/**
 * Loads and parses a configuration file in JSON or YAML format from the specified path.
 */
async function loadConfigFile(filePath: string): Promise<any> {
  try {
    log(`Loading config file: ${filePath}`);
    const content = await fsp.readFile(filePath, 'utf8');

    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      return YAML.parse(content);
    }
    throw new Error(`Unsupported file format: ${path.extname(filePath)}`);
  } catch (error) {
    log(`Error loading config file: ${error}`);
    return null;
  }
}

/**
 * Asynchronously checks if a file exists and is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Searches for the Doc Detective configuration file in the workspace.
 */
async function findConfigFile(workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined): Promise<string | null> {
  // First check if a custom path is set in settings
  const config = vscode.workspace.getConfiguration('docDetective');
  const configPath = config.get<string>('configPath');

  if (configPath && configPath.trim() !== '') {
    // If absolute path, use it directly
    if (path.isAbsolute(configPath)) {
      return (await fileExists(configPath)) ? configPath : null;
    }

    // Relative path - try to resolve from each workspace folder
    if (workspaceFolders && workspaceFolders.length > 0) {
      for (const folder of workspaceFolders) {
        const fullPath = path.join(folder.uri.fsPath, configPath);
        if (await fileExists(fullPath)) {
          return fullPath;
        }
      }
    }

    // If we get here, the custom path wasn't found
    log(`Custom config path not found: ${configPath}`);
    return null;
  }

  // If no custom path or not found, look for default files in workspace root
  if (workspaceFolders && workspaceFolders.length > 0) {
    for (const folder of workspaceFolders) {
      const possibleFiles = [
        path.join(folder.uri.fsPath, '.doc-detective.json'),
        path.join(folder.uri.fsPath, '.doc-detective.yaml'),
        path.join(folder.uri.fsPath, '.doc-detective.yml')
      ];

      for (const file of possibleFiles) {
        if (await fileExists(file)) {
          log(`Found config file: ${file}`);
          return file;
        }
      }
    }
  }

  log('No Doc Detective config file found');
  return null;
}

// WebviewViewProvider for Doc Detective
class DocDetectiveWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'docDetectiveView';
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // Check if the view is available
  public hasView(): boolean {
    return !!this._view;
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    try {
      log('Resolving webview view...');
      this._view = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
      };

      webviewView.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src vscode-webview:;">
          <title>Loading Doc Detective...</title>
          <style>
            body {
              padding: 20px;
              color: var(--vscode-editor-foreground);
              font-family: var(--vscode-font-family);
            }
            .loading {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100px;
            }
          </style>
        </head>
        <body>
          <div class="loading">Loading Doc Detective... Please wait.</div>
        </body>
        </html>
      `;

      // Initial render
      log('Initial webview HTML set, updating webview...');
      await this.updateWebview();

      // Listen for messages from the webview (if needed)
      webviewView.webview.onDidReceiveMessage(async (message) => {
        log(`Received message from webview: ${JSON.stringify(message)}`);
      });

      log('Webview view resolved successfully');
    } catch (error) {
      log(`Error resolving webview: ${error}`);
      if (this._view) {
        this._view.webview.html = this.getErrorHtml(`Failed to initialize Doc Detective panel: ${error}`);
      }
    }
  }

  public async updateWebview() {
    try {
      if (!this._view) {
        log('No view available to update');
        return;
      }

      log('Updating webview content...');

      // Get open files
      const editors = vscode.window.visibleTextEditors;
      const filePaths = editors
        .filter(e => e.document.uri.scheme === 'file')
        .map(e => e.document.uri.fsPath);
      const uniquePaths = Array.from(new Set(filePaths));

      log(`Found ${uniquePaths.length} unique file paths`);

      if (uniquePaths.length === 0) {
        this._view.webview.html = this.getNoFilesHtml();
        return;
      }

      // Show loading state
      this._view.webview.html = this.getLoadingHtml();

      // Load config file if available
      const configFilePath = await findConfigFile(vscode.workspace.workspaceFolders);
      let baseConfig: any = null;

      if (configFilePath) {
        baseConfig = await loadConfigFile(configFilePath);
        log(`Loaded base config from ${configFilePath}`);
      } else {
        log('No config file found, using default configuration');
      }

      // Validate config if loaded
      if (baseConfig) {
        const result = validate({ schemaKey: "config_v3" as SchemaKey, object: baseConfig, addDefaults: true });
        if (result.valid) {
          baseConfig = result.object;
        } else {
          log(`Config validation failed: ${result.errors}. Using defaults.`);
          baseConfig = null;
        }
      }

      // Resolve file types from config
      const fileTypes = resolveFileTypes(baseConfig?.fileTypes);
      const config = baseConfig || {};

      // For each file, detect tests using common's content-based API
      const results: Record<string, any> = {};
      for (const file of uniquePaths) {
        try {
          log(`Detecting tests for file: ${file}`);

          const content = await fsp.readFile(file, 'utf8');
          const fileType = matchFileType(file, fileTypes);

          if (!fileType) {
            results[file] = [];
            continue;
          }

          const tests = await detectTests({
            content,
            filePath: file,
            fileType,
            config: {
              detectSteps: config.detectSteps !== false,
              origin: config.origin,
              logLevel: config.logLevel,
            },
          });
          results[file] = tests;
          log(`Detected tests for ${file}: ${JSON.stringify(tests).substring(0, 100)}...`);
        } catch (e) {
          log(`Error detecting tests for ${file}: ${e}`);
          results[file] = { error: String(e) };
        }
      }
      // Render JSON in webview
      log('Rendering results to HTML...');
      try {
        this._view.webview.html = this.getHtmlForWebview(results);
        log('Webview updated successfully with full view');
      } catch (renderError) {
        log(`Error with view rendering: ${renderError}`);
        this._view.webview.html = this.getErrorHtml(`Failed to render results: ${renderError}`);
      }
    } catch (error) {
      log(`Error updating webview: ${error}`);
      if (this._view) {
        this._view.webview.html = this.getErrorHtml(`Failed to update Doc Detective panel: ${error}`);
      }
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src vscode-webview:;">
        <title>Doc Detective Results</title>
        <style>
          body {
            font-family: var(--vscode-editor-font-family, monospace);
            margin: 0;
            padding: 1em;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
          }
        </style>
      </head>
      <body>
        <div class="loading">Processing files, please wait...</div>
      </body>
      </html>`;
  }

  private getNoFilesHtml(): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src vscode-webview:;">
        <title>Doc Detective Results</title>
        <style>
          body {
            font-family: var(--vscode-editor-font-family, monospace);
            margin: 0;
            padding: 1em;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .message {
            padding: 1em;
            text-align: center;
          }
        </style>
      </head>
      <body>        <div class="message">
          <h3>No files open</h3>
          <p>Open files in the editor to see Doc Detective results.</p>
          <p><em>Results automatically update when files are saved.</em></p>
        </div>
      </body>
      </html>`;
  }

  private getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src vscode-webview:;">
        <title>Doc Detective Error</title>
        <style>
          body {
            font-family: var(--vscode-editor-font-family, monospace);
            margin: 0;
            padding: 1em;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .error {
            color: var(--vscode-errorForeground);
            padding: 1em;
            border: 1px solid currentColor;
            margin: 1em 0;
          }
        </style>
      </head>      <body>
        <h3>Doc Detective Error</h3>
        <div class="error">${escapeHtml(errorMessage)}</div>
        <p>Check the Doc Detective output channel for more details.</p>
        <p><em>Doc Detective automatically updates when files are saved.</em></p>
      </body>
      </html>`;
  }
  private getHtmlForWebview(jsonObj: any): string {
    try {
      // Handle empty results
      if (!jsonObj || Object.keys(jsonObj).length === 0) {
        log('No results to display');
        return this.getNoFilesHtml();
      }

      // Properly escape the JSON for embedding in a <script> tag
      const jsonString = JSON.stringify(jsonObj)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

      log(`JSON string prepared (first 100 chars): ${jsonString.substring(0, 100)}...`);

      return `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src vscode-webview:;">
          <title>Doc Detective Results</title>
          <style>
            :root {
              --background: var(--vscode-editor-background);
              --foreground: var(--vscode-editor-foreground);
              --key-color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-debugTokenExpression-name, #9cdcfe));
              --string-color: var(--vscode-debugTokenExpression-string, #ce9178);
              --number-color: var(--vscode-debugTokenExpression-number, #b5cea8);
              --boolean-color: var(--vscode-debugTokenExpression-boolean, #569cd6);
              --indent-color: var(--vscode-editorIndentGuide-background, #555);
              --dash-color: var(--vscode-editorIndentGuide-activeBackground, #666);
              --toggle-color: var(--vscode-editorLink-activeForeground, #569cd6);
            }

            body {
              font-family: var(--vscode-editor-font-family, monospace);
              margin: 0;
              padding: 0.5em;
              background: var(--background);
              color: var(--foreground);
              font-size: var(--vscode-editor-font-size, 14px);
              line-height: 1.5;
            }

            .collapsible { cursor: pointer; }

            .content {
              display: block;
              margin-left: 1.5em;
            }

            li:not(.active) > .content {
              display: none;
            }

            .key {
              color: var(--key-color);
              font-weight: var(--vscode-font-weight, normal);
            }

            .string {
              color: var(--string-color);
            }

            .number {
              color: var(--number-color);
            }

            .boolean {
              color: var(--boolean-color);
            }

            .null {
              color: var(--foreground);
              opacity: 0.7;
            }

            ul {
              list-style-type: none;
              margin: 0;
              padding: 0;
            }

            .yaml-indent {
              color: var(--indent-color);
            }

            .yaml-dash {
              color: var(--dash-color);
            }

            .toggle {
              color: var(--toggle-color);
              display: inline-block;
              width: 1em;
              text-align: center;
            }

            .simple-obj {
              margin-left: 1.5em;
              padding-left: 0.5em;
              border-left: 1px solid var(--indent-color);
            }

            .collapsible {
              transition: opacity 0.1s;
            }

            li {
              padding: 1px 0;
            }

            .error-info {
              color: var(--vscode-errorForeground);
              margin: 8px 0;
              padding: 8px;
              border: 1px solid currentColor;
            }

            .no-results {
              text-align: center;
              padding: 20px;
            }
          </style>        </head>
        <body>
          <div id="debug-info" style="display: none; padding: 8px; margin-bottom: 12px; border: 1px solid var(--vscode-debugTokenExpression-name); font-size: 12px;"></div>
          <div id="json"></div><script>
            // Error handling wrapper
            try {
              const jsonObj = ${jsonString};

              if (!jsonObj || Object.keys(jsonObj).length === 0) {
                document.getElementById('json').innerHTML = '<div class="no-results">No results to display</div>';
                console.log('Empty results object');
              }

              function escapeHTML(str) {
                return str.replace(/[&<>]/g, function(tag) {
                  const chars = {'&':'&amp;','<':'&lt;','>':'&gt;'};
                  return chars[tag] || tag;
                });
              }

              function hasNestedObjects(obj) {
                if (typeof obj !== 'object' || obj === null) return false;

                if (Array.isArray(obj)) {
                  return obj.some(item => typeof item === 'object' && item !== null);
                } else {
                  return Object.values(obj).some(val => typeof val === 'object' && val !== null);
                }
              }

              function renderYAML(obj, indent = 0, isArrayItem = false) {
                const INDENT = '  ';
                const pad = (n) => INDENT.repeat(n);

                if (typeof obj !== 'object' || obj === null) {
                  if (typeof obj === 'string') return '<span class="string">' + escapeHTML(obj) + '</span>';
                  if (typeof obj === 'number') return '<span class="number">' + obj + '</span>';
                  if (typeof obj === 'boolean') return '<span class="boolean">' + obj + '</span>';
                  if (obj === null) return '<span class="null">null</span>';
                  return obj;
                }

                if (Array.isArray(obj)) {
                  if (obj.length === 0) return '[]';
                  let html = '<ul>';

                  for (let i = 0; i < obj.length; i++) {
                    const value = obj[i];
                    const indentSpan = '<span class="yaml-indent">' + pad(indent) + '</span>';

                    if (typeof value === 'object' && value !== null) {
                      if (Array.isArray(value)) {
                        html += '<li>' + indentSpan + '<span class="yaml-dash">-</span> ' +
                                renderYAML(value, indent + 1, true);
                      } else {
                        const keys = Object.keys(value);
                        if (keys.length === 0) {
                          html += '<li>' + indentSpan + '<span class="yaml-dash">-</span> {}';
                        } else {
                          const hasNested = hasNestedObjects(value);
                          const firstKey = keys[0];

                          if (hasNested) {
                            html += '<li class="active">' + indentSpan +
                                    '<span class="collapsible"><span class="toggle">&#x25BC;</span> <span class="key">' +
                                    escapeHTML(firstKey) + ':</span></span>';

                            if (typeof value[firstKey] === 'object' && value[firstKey] !== null) {
                              html += '<div class="content">' + renderYAML(value[firstKey], indent + 1) + '</div>';
                            } else {
                              html += ' ' + renderYAML(value[firstKey], 0);
                              html += '<div class="content">';
                              for (let k = 1; k < keys.length; k++) {
                                html += '<div>' +
                                        '<span class="yaml-indent">' + pad(indent + 1) + '</span>' +
                                        '<span class="key">' + escapeHTML(keys[k]) + ':</span> ' +
                                        renderYAML(value[keys[k]], 0) + '</div>';
                              }
                              html += '</div>';
                            }
                          } else {
                            html += '<li>' + indentSpan + '<span class="yaml-dash">-</span> ' +
                                    '<span class="key">' + escapeHTML(firstKey) + ':</span> ' +
                                    renderYAML(value[firstKey], 0);

                            if (keys.length > 1) {
                              html += '<div class="simple-obj">';
                              for (let k = 1; k < keys.length; k++) {
                                html += '<div>' +
                                        '<span class="key">' + escapeHTML(keys[k]) + ':</span> ' +
                                        renderYAML(value[keys[k]], 0) + '</div>';
                              }
                              html += '</div>';
                            }
                          }
                        }
                      }
                    } else {
                      html += '<li>' + indentSpan + '<span class="yaml-dash">-</span> ' +
                              renderYAML(value, 0, true);
                    }
                    html += '</li>';
                  }

                  html += '</ul>';
                  return html;
                } else {
                  const keys = Object.keys(obj);
                  if (keys.length === 0) return '{}';

                  let html = '<ul>';
                  keys.forEach(function(key) {
                    const value = obj[key];
                    const indentation = '<span class="yaml-indent">' + pad(indent) + '</span>';

                    if (typeof value === 'object' && value !== null && (hasNestedObjects(value) || Array.isArray(value))) {
                      html += '<li class="active">' + indentation +
                              '<span class="collapsible"><span class="toggle">&#x25BC;</span> <span class="key">' +
                              escapeHTML(key) + ':</span></span>' +
                              '<div class="content">' + renderYAML(value, indent + 1, Array.isArray(value)) + '</div>' +
                              '</li>';
                    } else {
                      html += '<li>' + indentation + '<span class="key">' +
                              escapeHTML(key) + ':</span> ' + renderYAML(value, 0) + '</li>';
                    }
                  });

                  html += '</ul>';
                  return html;
                }
              }

              document.getElementById('json').innerHTML = renderYAML(jsonObj, 0);
              document.querySelectorAll('.collapsible').forEach(function(el) {
                el.addEventListener('click', function(e) {
                  e.stopPropagation();
                  var parent = el.parentElement;
                  parent.classList.toggle('active');

                  const toggleEl = el.querySelector('.toggle');
                  if (toggleEl) {
                    toggleEl.textContent = parent.classList.contains('active') ? '\\u25BC' : '\\u25B6';
                  }
                });
              });

              window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'vscode-theme-updated') {
                  console.log('Theme updated');
                }
              });
              document.getElementById('debug-info').innerHTML = 'Data loaded successfully!';

              try {
                const vscode = acquireVsCodeApi();

                setTimeout(() => {
                  vscode.postMessage({
                    command: 'webviewLoaded',
                    data: { success: true }
                  });
                }, 500);
              } catch (e) {
                console.error('Failed to acquire VS Code API:', e);
                document.getElementById('debug-info').style.display = 'block';
                document.getElementById('debug-info').textContent += ' VS Code API error: ' + e.message;
              }
            } catch (e) {
              console.error('Error in webview script:', e);
              document.getElementById('debug-info').style.display = 'block';
              document.getElementById('debug-info').textContent = 'Error in webview: ' + e.message;
              document.getElementById('json').textContent = 'Error processing results: ' + e.message;
            }
          </script>
        </body>
        </html>`;
    } catch (error) {
      log(`Error generating HTML: ${error}`);
      return this.getErrorHtml(`Failed to generate HTML: ${error}`);
    }
  }
}

/**
 * Activates the Doc Detective extension.
 */
export function activate(context: vscode.ExtensionContext) {
  log('Activating Doc Detective extension...');

  const disposable = vscode.commands.registerCommand('doc-detective.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from doc-detective!');
  });
  context.subscriptions.push(disposable);

  // Register the WebviewViewProvider for the sidebar
  const provider = new DocDetectiveWebviewViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('docDetectiveView', provider)
  );

  // Debounced update to avoid overlapping work from rapid events
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function debouncedUpdate() {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(() => { provider.updateWebview(); }, 300);
  }

  // Refresh the webview when visible editors change
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      log('Visible editors changed, updating webview...');
      debouncedUpdate();
    })
  );

  // Hot-reload the webview when the active editor changes (switching tabs)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      log('Active editor changed, updating webview...');
      debouncedUpdate();
    })
  );

  // Update the webview when a file is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      log(`File saved: ${document.uri.fsPath}, updating webview...`);
      debouncedUpdate();
    })
  );

  // Update when the color theme changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      log('Color theme changed, updating webview...');
      if (provider.hasView()) {
        debouncedUpdate();
      }
    })
  );

  // Update when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('docDetective.configPath')) {
        log('Doc Detective configuration changed, updating webview...');
        if (provider.hasView()) {
          debouncedUpdate();
        }
      }
    })
  );

  context.subscriptions.push(outputChannel);
  log('Doc Detective extension activated');
}

/**
 * Deactivates the extension.
 */
export function deactivate() {}
