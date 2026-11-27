<!-- test {"testId":"http-shell-bg-httpget","detectSteps":false} -->

# Start a background process

Start a server on port 8242:

```shell
node -e "require('http').createServer((q, r) => r.end('ok')).listen(8242)"
```

<!-- step {"runShell":{"command":"node -e \"require('http').createServer((q, r) => r.end('ok')).listen(8242)\"","background":{"name":"http-shell-bg-httpget","waitUntil":{"httpGet":"http://localhost:8242/"}},"timeout":15000}} -->

Stop it when you're done.

<!-- step {"closeSurface":"http-shell-bg-httpget"} -->

<!-- test end -->
