import { diag, stopSpinner } from "../cliOutput.js";

const CLEANUP_DEADLINE_MS = 5000;

// What to do on Ctrl-C or SIGTERM during a run: say so, clean up within a time
// limit, then exit with the conventional code. A second signal skips the rest
// of the cleanup, so nobody is stuck waiting on a process that won't die.
// `stragglers` names what a cut-short cleanup can leave running.
export function createInterruptHandler({
  cleanup,
  exit = (code: number) => process.exit(code),
  print = diag,
  deadlineMs = CLEANUP_DEADLINE_MS,
  stragglers = "Browsers or other test processes",
}: {
  cleanup: () => Promise<unknown>;
  exit?: (code: number) => void;
  print?: (line: string) => void;
  deadlineMs?: number;
  stragglers?: string;
}) {
  let interrupted = false;
  return (signal: NodeJS.Signals) => {
    const code = signal === "SIGINT" ? 130 : 143;
    stopSpinner();
    if (interrupted) {
      print(`Stopping now. ${stragglers} may still be running.`);
      exit(code);
      return;
    }
    interrupted = true;
    print("Stopping… Press Ctrl-C again to stop immediately.");
    const deadline = setTimeout(() => {
      print(`Cleanup didn't finish in time. ${stragglers} may still be running.`);
      exit(code);
    }, deadlineMs);
    deadline.unref?.();
    Promise.resolve()
      .then(cleanup)
      .catch(() => {})
      .finally(() => {
        clearTimeout(deadline);
        exit(code);
      });
  };
}
