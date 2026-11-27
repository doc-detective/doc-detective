<!-- test {"testId":"custom-statement-syntax","detectSteps":false} -->

# Echo text back

Check that the page server is up:

```bash
curl -sf http://localhost:8092/type-echo.html > /dev/null
```

<!-- step {"runShell":"curl -sf http://localhost:8092/type-echo.html > /dev/null"} -->

Open the type echo page at `http://localhost:8092/type-echo.html`.

<!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
<!-- step {"find":"Type Echo Test Page"} -->

Click the field labeled Type here:, then type Hello, Doc Detective.

<!-- step {"click":"Type here:"} -->
<!-- step {"type":"Hello, Doc Detective"} -->

The field echoes each keystroke, so the page shows Hello, Doc Detective below the field.

<!-- step {"wait":200} -->
<!-- step {"find":{"selector":"#echo","elementText":"Hello, Doc Detective"}} -->

Older versions of the page echoed only after you pressed Enter.

If the page doesn't load, restart the page server from the repository root:

```sh no-run
node test/server/start.js
```

<!-- test end -->
