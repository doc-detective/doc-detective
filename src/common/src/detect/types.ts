/**
 * Shared types for structure-aware (selector-based) test detection.
 *
 * A format backend parses a source file into a flat, offset-ordered list of
 * positioned semantic nodes. Selectors (declarative matchers in fileType
 * markup definitions) and statement containers (inlineStatements.in) run
 * against these nodes instead of raw file text.
 */

export type SemanticKind =
  | "comment"
  | "codeBlock"
  | "link"
  | "image"
  | "strong"
  | "emphasis"
  | "text"
  | "element";

export interface SemanticNode {
  kind: SemanticKind;
  /** Absolute character offset of the node's first character in the source. */
  startIndex: number;
  /** Absolute character offset one past the node's last character. */
  endIndex: number;
  /** Inner source text: comment body, code block body, element inner text. */
  content?: string;
  /** Display text: link/strong/emphasis text; for text runs, the raw slice. */
  text?: string;
  /** Code block info-string language; empty string for bare fences. */
  language?: string;
  /** Code block info-string tail after the language; empty string if none. */
  meta?: string;
  url?: string;
  title?: string;
  src?: string;
  alt?: string;
  /** Element/component name. */
  tag?: string;
  /**
   * Parsed attributes. For Markdown these come from Kramdown/Pandoc-style
   * attribute lists ({: .cls #id key="val"}): classes normalize to `class`
   * (space-joined), IDs to `id`. `true` marks a bare (value-less) attribute.
   */
  attributes?: Record<string, string | true>;
  /**
   * Raw source between the enclosing block's start and this node. Context
   * regexes (`precededBy`) run against this; `$`-anchored patterns match
   * text immediately before the node.
   */
  precedingText: string;
  /** Raw source between this node and the enclosing block's end. */
  followingText: string;
  /**
   * Grouping key: inline nodes sharing a blockId are siblings within one
   * block (paragraph, heading, table cell) for context and then-chaining.
   * Block-level nodes get a unique blockId of their own.
   */
  blockId: number;
}

/** A backend parses source content into semantic nodes. */
export type BackendParse = (content: string) => SemanticNode[];
