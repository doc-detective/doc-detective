/**
 * Doc Detective Ink Components
 * 
 * This module exports all Ink components for use in custom CLI applications.
 * Components can be imported and used in your own Ink-based CLI projects.
 * 
 * Example usage:
 *   import { App, Header, StatusDisplay, ResultsSummary } from 'doc-detective/ink';
 *   import App from 'doc-detective/ink/App.mjs';
 *   
 * These components demonstrate how to:
 * - Build reactive CLI UIs with Ink
 * - Import and use external component libraries (like ink-spinner)
 * - Display test progress and results
 */

export { 
  default as App,
  Header,
  StatusDisplay,
  ResultsSummary,
  SummaryRow,
} from './App.mjs';
