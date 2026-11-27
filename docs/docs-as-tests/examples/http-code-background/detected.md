<!-- test {"testId":"http-code-background","detectSteps":true} -->

# Start a server from code

Start a server on port 8251:

```js testIgnore
require('http').createServer((q, r) => r.end('ok')).listen(8251);
```

<!-- step {"runCode":{"language":"js","code":"require('http').createServer((q, r) => r.end('ok')).listen(8251);","background":{"name":"http-code-server","waitUntil":{"port":8251}},"timeout":15000}} -->

Stop it when you're done.

<!-- step {"closeSurface":"http-code-server"} -->

<!-- test end -->
