# Check that the page server is up

Request the type echo page. The command fails if the server doesn't answer:

```bash
curl -sf -o /dev/null http://localhost:8092/type-echo.html
```
