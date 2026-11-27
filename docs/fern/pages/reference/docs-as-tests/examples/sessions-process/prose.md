# Evaluate expressions in the Node.js REPL

## Start the REPL as a surface

1. Start `node -i` in a terminal as a process named `sessions-repl`, and wait for the `>` prompt.
2. In the REPL, enter `40 + 2` and press Enter. Wait for the REPL to print `42`.
3. Close the REPL.

## Run the REPL in the background

1. Run `node -i` in the background as a process named `sessions-bg-repl`, and wait for the `>` prompt.
2. In the REPL, enter `Math.pow(2, 10)` and press Enter. Wait for the REPL to print `1024`.
3. Close the REPL.

## Start a server and a REPL together

1. From the `docs/actions` folder, start `node simple-json-server.cjs` as `sessions-api`, and wait until port `8087` answers. At the same time, start `node -i` in a 100 by 30 terminal as `sessions-client`, and give it a second to start.
2. In the REPL, fetch the server's root URL, and wait for it to print `ok`.
3. Close the REPL and the server.
