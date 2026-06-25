/* eslint-disable */
/**
 * Auto-generated from closeSurface_v3.schema.json
 * Do not edit manually
 */

/**
 * Close one or more surfaces (Phase 1: background processes). Closing a surface that is not open is a no-op (PASS). Renames `stopProcess`.
 */
export type CloseSurface = Surface | [Surface1, ...Surface1[]];
/**
 * The surface a step acts on. Omit to act on the active surface. Phase 1 supports background processes; browser/app surfaces are added in later phases.
 */
export type Surface = SurfaceByName | ProcessSurface;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names an existing surface, with its kind resolved at runtime.
 */
export type SurfaceByName = string;
/**
 * The surface a step acts on. Omit to act on the active surface. Phase 1 supports background processes; browser/app surfaces are added in later phases.
 */
export type Surface1 = SurfaceByName1 | ProcessSurface1;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names an existing surface, with its kind resolved at runtime.
 */
export type SurfaceByName1 = string;

export interface ProcessSurface {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
export interface ProcessSurface1 {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
