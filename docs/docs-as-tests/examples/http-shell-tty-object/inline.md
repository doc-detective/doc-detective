<!-- test {"testId":"http-shell-tty-object","detectSteps":false} -->

# Run a process in a terminal

Print the terminal size the process sees. It's `100x40`:

```shell
node -e "console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);"
```

<!-- step {"runShell":{"command":"node -e \"console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);\"","background":{"name":"http-shell-tty-object","tty":{"cols":100,"rows":40},"waitUntil":{"stdio":"Terminal: 100x40"}},"timeout":30000}} -->

Stop it when you're done.

<!-- step {"closeSurface":"http-shell-tty-object"} -->

<!-- test end -->
