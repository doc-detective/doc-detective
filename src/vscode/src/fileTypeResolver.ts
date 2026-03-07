/**
 * Bridge module that replaces what doc-detective-resolver did internally.
 * Resolves file type definitions from config, supporting string references,
 * extends merging, and extension-based matching.
 */

import { defaultFileTypes } from "../../common/src/fileTypes.js";
import type { FileType } from "../../common/src/detectTests.js";

/**
 * Resolve a string (e.g. "markdown") or FileType object to a FileType.
 * Returns null if the string doesn't match a known default.
 */
export function resolveFileType(fileType: string | FileType): FileType | null {
  if (typeof fileType === "string") {
    return defaultFileTypes[fileType] ?? null;
  }
  return fileType;
}

/**
 * Find the matching FileType for a file path based on its extension.
 */
export function matchFileType(filePath: string, fileTypes: FileType[]): FileType | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) { return null; }
  for (const ft of fileTypes) {
    if (ft.extensions.some(e => e.replace(/^\./, '').toLowerCase() === ext)) {
      return ft;
    }
  }
  return null;
}

/**
 * Normalize inlineStatements fields: convert string values to single-element arrays.
 */
function normalizeInlineStatements(fileType: FileType): void {
  if (!fileType.inlineStatements) { return; }
  const keys = ["testStart", "testEnd", "ignoreStart", "ignoreEnd", "step"] as const;
  for (const key of keys) {
    const val = fileType.inlineStatements[key];
    if (typeof val === "string") {
      (fileType.inlineStatements as any)[key] = [val];
    }
  }
}

/**
 * Normalize markup fields: convert string regex to single-element arrays.
 */
function normalizeMarkup(fileType: FileType): void {
  if (!fileType.markup) { return; }
  fileType.markup = fileType.markup.map(markup => {
    if (typeof (markup as any)?.regex === "string") {
      (markup as any).regex = [(markup as any).regex];
    }
    return markup;
  });
}

/**
 * Apply extends merging: merge a base file type definition into this one.
 */
function applyExtends(fileType: any): FileType {
  if (!fileType.extends) { return fileType; }

  const extendedFileTypeRaw = defaultFileTypes[fileType.extends];
  if (!extendedFileTypeRaw) {
    console.warn(`fileType.extends references unknown definition: "${fileType.extends}"`);
    return fileType;
  }

  const base = JSON.parse(JSON.stringify(extendedFileTypeRaw));

  if (!fileType.name) {
    fileType.name = base.name;
  }

  // Merge extensions
  if (base.extensions) {
    fileType.extensions = [
      ...new Set([...(base.extensions || []), ...(fileType.extensions || [])]),
    ];
  }

  // Merge inlineStatements
  if (base.inlineStatements) {
    if (!fileType.inlineStatements) {
      fileType.inlineStatements = {};
    }
    const keys = ["testStart", "testEnd", "ignoreStart", "ignoreEnd", "step"];
    for (const key of keys) {
      if (base.inlineStatements?.[key] || fileType.inlineStatements?.[key]) {
        fileType.inlineStatements[key] = [
          ...new Set([
            ...(base.inlineStatements?.[key] || []),
            ...(fileType.inlineStatements?.[key] || []),
          ]),
        ];
      }
    }
  }

  // Merge markup array
  if (base.markup) {
    fileType.markup = fileType.markup || [];
    for (const extMarkup of base.markup) {
      const existingIndex = fileType.markup.findIndex(
        (m: any) => m.name === extMarkup.name
      );
      if (existingIndex === -1) {
        fileType.markup.push(extMarkup);
      }
    }
  }

  delete fileType.extends;
  return fileType;
}

/**
 * Resolve a full fileTypes array from config, handling string references,
 * extends merging, and normalization. Returns default file types if none configured.
 */
export function resolveFileTypes(configFileTypes?: (string | FileType)[]): FileType[] {
  if (!configFileTypes || configFileTypes.length === 0) {
    // Return all unique default file types (exclude aliases)
    return [
      defaultFileTypes.markdown_1_0,
      defaultFileTypes.asciidoc_1_0,
      defaultFileTypes.html_1_0,
      defaultFileTypes.dita_1_0,
    ];
  }

  const resolved: FileType[] = [];
  for (const ft of configFileTypes) {
    let fileType: FileType | null;
    if (typeof ft === "string") {
      fileType = resolveFileType(ft);
      if (!fileType) {
        console.warn(`Unknown fileType: "${ft}", skipping.`);
        continue;
      }
      // Clone to avoid mutating the default
      fileType = JSON.parse(JSON.stringify(fileType));
    } else {
      fileType = JSON.parse(JSON.stringify(ft));
    }

    normalizeInlineStatements(fileType!);
    normalizeMarkup(fileType!);
    fileType = applyExtends(fileType);
    resolved.push(fileType!);
  }

  return resolved;
}
