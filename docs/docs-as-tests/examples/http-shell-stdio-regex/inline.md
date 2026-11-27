<!-- test {"testId":"http-shell-stdio-regex","detectSteps":false} -->

# Match command output

Print the Node.js version. It starts with `v` and a number:

```shell
node --version
```

<!-- step {"runShell":{"command":"node --version","stdio":"/^v\\d+\\./"}} -->

<!-- test end -->
