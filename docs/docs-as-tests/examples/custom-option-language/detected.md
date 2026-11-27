<!-- test {"testId":"custom-option-language","detectSteps":true} -->

# Check the page's status code

Print the page's status code:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8092/type-echo.html
```

The command prints:

```text
200
```

<!-- test end -->
