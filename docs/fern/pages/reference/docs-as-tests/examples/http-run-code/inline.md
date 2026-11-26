<!-- test {"testId":"http-run-code","detectSteps":false} -->

# Print a greeting

Run this JavaScript with Node.js:

```javascript
console.log("Hello from JavaScript");
```

<!-- step {"runCode":{"language":"javascript","code":"console.log(\"Hello from JavaScript\");","stdio":"Hello from JavaScript","exitCodes":[0]}} -->

Run the same greeting in Python:

```python
print("Hello from Python")
```

<!-- step {"runCode":{"language":"python","code":"print(\"Hello from Python\")","stdio":"/^Hello from Python/"}} -->

Or in Bash:

```bash
echo "Hello from Bash"
```

<!-- step {"runCode":{"language":"bash","code":"echo \"Hello from Bash\"","stdio":"Hello from Bash"}} -->

To install the greeter for every project on your machine, run:

```bash
npm install --global ./greeter
```

<!-- test end -->
