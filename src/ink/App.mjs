import React, { useState, useEffect, createElement, Fragment } from 'react';
import { Text, Box, Newline, useApp } from 'ink';
import Spinner from 'ink-spinner';

// Helper for creating elements without JSX
const h = createElement;

/**
 * Main App component for the Doc Detective CLI
 * This demonstrates a simple, best-practices-based CLI UX with Ink
 * that can import components from other libraries (like ink-spinner)
 */
export default function App({ config, onComplete }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('initializing');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runTests = async () => {
      try {
        setStatus('running');
        
        // Dynamically import the core module and run tests
        const { runTests: runTestsCore } = await import('doc-detective-core');
        const testResults = await runTestsCore(config);
        
        setResults(testResults);
        setStatus('complete');
        
        if (onComplete) {
          // Give time for the UI to update before calling complete
          setTimeout(() => {
            onComplete(testResults);
            exit();
          }, 100);
        }
      } catch (err) {
        setError(err.message);
        setStatus('error');
        
        if (onComplete) {
          setTimeout(() => {
            onComplete(null, err);
            exit();
          }, 100);
        }
      }
    };

    runTests();
  }, [config, onComplete, exit]);

  return h(Box, { flexDirection: 'column', padding: 1 },
    h(Header),
    h(Newline),
    h(StatusDisplay, { status, error }),
    results && h(ResultsSummary, { results })
  );
}

/**
 * Header component displaying the Doc Detective branding
 */
export function Header() {
  return h(Box, { flexDirection: 'column' },
    h(Text, { bold: true, color: 'cyan' }, '📋 Doc Detective'),
    h(Text, { dimColor: true }, 'Validating documentation accuracy')
  );
}

/**
 * Status display component showing the current operation status
 */
export function StatusDisplay({ status, error }) {
  if (status === 'initializing') {
    return h(Box, null,
      h(Text, { color: 'yellow' }, h(Spinner, { type: 'dots' })),
      h(Text, null, ' Initializing...')
    );
  }

  if (status === 'running') {
    return h(Box, null,
      h(Text, { color: 'blue' }, h(Spinner, { type: 'dots' })),
      h(Text, null, ' Running tests...')
    );
  }

  if (status === 'error') {
    return h(Box, { flexDirection: 'column' },
      h(Text, { color: 'red', bold: true }, '✗ Error'),
      h(Text, { color: 'red' }, error)
    );
  }

  if (status === 'complete') {
    return h(Box, null,
      h(Text, { color: 'green', bold: true }, '✓ Complete')
    );
  }

  return null;
}

/**
 * Results summary component showing test results
 */
export function ResultsSummary({ results }) {
  if (!results || !results.summary) {
    return h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, 'No results available')
    );
  }

  const { specs, tests, contexts, steps } = results.summary;

  return h(Box, { flexDirection: 'column', marginTop: 1 },
    h(Text, { bold: true }, '━━━ Results Summary ━━━'),
    h(Newline),
    specs && h(SummaryRow, { label: 'Specs', pass: specs.pass, fail: specs.fail, skipped: specs.skipped }),
    tests && h(SummaryRow, { label: 'Tests', pass: tests.pass, fail: tests.fail, skipped: tests.skipped }),
    contexts && h(SummaryRow, { label: 'Contexts', pass: contexts.pass, fail: contexts.fail, skipped: contexts.skipped }),
    steps && h(SummaryRow, { label: 'Steps', pass: steps.pass, fail: steps.fail, skipped: steps.skipped }),
    h(Newline),
    hasAnyFailures(results.summary)
      ? h(Text, { color: 'red', bold: true }, '⚠ Some tests failed')
      : h(Text, { color: 'green', bold: true }, '🎉 All tests passed!')
  );
}

/**
 * Individual summary row component
 */
export function SummaryRow({ label, pass, fail, skipped }) {
  const total = pass + fail + (skipped || 0);
  
  return h(Box, null,
    h(Box, { width: 12 }, h(Text, null, `${label}:`)),
    h(Text, { color: 'green' }, `${pass} passed`),
    h(Text, null, ', '),
    h(Text, { color: fail > 0 ? 'red' : 'green' }, `${fail} failed`),
    skipped > 0 && h(Fragment, null,
      h(Text, null, ', '),
      h(Text, { color: 'yellow' }, `${skipped} skipped`)
    ),
    h(Text, { dimColor: true }, ` (${total} total)`)
  );
}

/**
 * Helper function to check if there are any failures
 */
function hasAnyFailures(summary) {
  return (
    (summary.specs && summary.specs.fail > 0) ||
    (summary.tests && summary.tests.fail > 0) ||
    (summary.contexts && summary.contexts.fail > 0) ||
    (summary.steps && summary.steps.fail > 0)
  );
}
