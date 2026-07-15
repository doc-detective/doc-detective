import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import type {
  CompletionItem,
  CompletionParams,
  Hover,
  HoverParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { computeDiagnostics } from "./diagnostics.js";
import { computeCompletions } from "./completion.js";
import { computeHover } from "./hover.js";

/**
 * The subset of a `Connection` the handlers touch. Narrowed to an interface so
 * tests can drive the wiring with a fake instead of a live stdio transport.
 */
export interface DiagnosticsConnection {
  onInitialize(handler: () => InitializeResult): void;
  sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void;
  onCompletion(
    handler: (params: CompletionParams) => CompletionItem[],
  ): void;
  onHover(handler: (params: HoverParams) => Hover | null): void;
}

/**
 * The subset of a `TextDocuments` manager the handlers subscribe to.
 */
export interface DocumentEvents {
  onDidChangeContent(handler: (event: { document: TextDocument }) => void): void;
  onDidClose(handler: (event: { document: TextDocument }) => void): void;
  get(uri: string): TextDocument | undefined;
}

/**
 * Wire language-server behavior onto a connection + document manager. Pure of
 * any transport, so a unit test can pass fakes, capture the registered
 * callbacks, and assert what gets published — no real process required.
 */
export function registerHandlers(
  connection: DiagnosticsConnection,
  documents: DocumentEvents,
): void {
  connection.onInitialize(() => ({
    capabilities: {
      // Full sync keeps Phase 1 simple; jsonc-parser reparses the whole buffer
      // on each change anyway, so incremental patching buys nothing yet.
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: { triggerCharacters: ['"', "{"] },
      hoverProvider: true,
    },
  }));

  const publish = (document: TextDocument) => {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: computeDiagnostics(document),
    });
  };

  // Fires on open and on every edit — the single hook we need for live
  // diagnostics.
  documents.onDidChangeContent((event) => publish(event.document));

  // Clear diagnostics when a document closes so stale squiggles don't linger.
  documents.onDidClose((event) =>
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }),
  );

  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return computeCompletions(document, params.position);
  });

  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return computeHover(document, params.position);
  });
}

/* c8 ignore start - real stdio bootstrap: no injectable seam; the pure wiring
   in registerHandlers is unit-tested, and the whole server is exercised
   end-to-end by the spawned protocol test. */
/**
 * Boot the language server over stdio. Called by the `doc-detective lsp`
 * subcommand.
 */
export function startServer(): void {
  const connection: Connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  registerHandlers(connection, documents);
  documents.listen(connection);
  connection.listen();
}
/* c8 ignore stop */
