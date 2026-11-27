<!-- test {"testId":"http-code-stdio-regex","detectSteps":false} -->

# Match code output

This script prints a number:

```js
console.log(6 * 7);
```

<!-- step {"runCode":{"language":"js","code":"console.log(6 * 7);","stdio":"/^\\d+$/"}} -->

<!-- test end -->
