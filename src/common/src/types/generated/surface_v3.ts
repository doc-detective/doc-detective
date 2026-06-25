/* eslint-disable */
/**
 * Auto-generated from surface_v3.schema.json
 * Do not edit manually
 */

/**
 * The surface a step acts on. Omit to act on the active surface. Phase 1 supports background processes; browser/app surfaces are added in later phases.
 */
export type Surface = SurfaceByName | ProcessSurface;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names an existing surface, with its kind resolved at runtime.
 */
export type SurfaceByName = string;

export interface ProcessSurface {
  /**
   * Name of a background process started by a runShell/runCode `background` step.
   */
  process: string;
}
