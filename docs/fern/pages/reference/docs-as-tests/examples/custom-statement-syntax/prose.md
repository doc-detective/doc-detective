# Echo text back

Check that the page server is up:

```bash
curl -sf http://localhost:8092/type-echo.html > /dev/null
```

Open the type echo page at `http://localhost:8092/type-echo.html`.

Click the field labeled Type here:, then type Hello, Doc Detective.

The field echoes each keystroke, so the page shows Hello, Doc Detective below the field.

Older versions of the page echoed only after you pressed Enter.

If the page doesn't load, restart the page server from the repository root:

```sh no-run
node test/server/start.js
```
