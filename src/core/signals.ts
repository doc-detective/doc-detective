import { diag } from "../cliOutput.js";

const CLEANUP_DEADLINE_MS = 5000;

// What to do on Ctrl-C or SIGTERM during a run: say so, clean up within a time
// limit, then exit with the conventional code. A second signal skips the rest
// of the cleanup, so nobody is stuck waiting on a process that won't die.
export function createInterruptHandler({
  cleanup,
  exit = (code: number) => process.exit(code),
  print = diag,
  deadlineMs = CLEANUP_DEADLINE_MS,
}: {
  cleanup: () => Promise<unknown>;
  exit?: (code: number) => void;
  print?: (line: string) => void;
  deadlineMs?: number;
}) {
  let interrupted = false;
  return (signal: NodeJS.Signals) => {
    const code = signal === "SIGINT" ? 130 : 143;
    if (interrupted) {
      print("Stopping now. Browsers or other test processes may still be running.");
      exit(code);
      return;
    }
    interrupted = true;
    print("Stopping… Press Ctrl-C again to stop immediately.");
    const deadline = setTimeout(() => {
      print("Cleanup didn't finish in time. Browsers or other test processes may still be running.");
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
