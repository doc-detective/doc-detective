<!-- test {"testId":"http-shell-tty-true","detectSteps":false} -->

# Run a process in a terminal

Print the terminal size the process sees. It's `120x30`:

```shell
node -e "console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);"
```

<!-- step {"runShell":{"command":"node -e \"console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);\"","background":{"name":"http-shell-tty-true","tty":true,"waitUntil":{"stdio":"Terminal: 120x30"}},"timeout":30000}} -->

Stop it when you're done.

<!-- step {"closeSurface":"http-shell-tty-true"} -->

<!-- test end -->
