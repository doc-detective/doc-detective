export { schemas, SchemaKey, Schema } from "./schemas/index.js";
export { validate, transformToSchemaKey, ValidateOptions, ValidateResult, TransformOptions } from "./validate.js";
export { detectTests, DetectTestsInput, DetectedTest, DetectTestsConfig } from "./detectTests.js";
export { defaultFileTypes, FileType, MarkupDefinition } from "./fileTypes.js";
export {
  SemanticKind,
  SemanticNode,
  BackendParse,
  parseMarkdown,
  parseAttributeList,
  resolveBackend,
  SELECTOR_KINDS,
  SelectorDefinition,
  SelectorMatch,
  SelectorContext,
  getSelectorDefinition,
  matchSelector,
  resolveFieldPath,
  resolveCaptures,
  StatementType,
  parseStatementText,
  selectorContainerStatements,
  selectorMarkupStatements,
} from "./detect/index.js";
export type { Specification } from "./types/generated/spec_v3.js";
export type { Test, Step } from "./types/generated/test_v3.js";
export type { Context } from "./types/generated/context_v3.js";
export type { Config } from "./types/generated/config_v3.js";
export type { Report } from "./types/generated/report_v3.js";
