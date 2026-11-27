<!-- dd-test {"testId":"custom-statement-syntax","detectSteps":true} -->

# Echo text back

Check that the page server is up:

```bash
curl -sf http://localhost:8092/type-echo.html > /dev/null
```

Open the type echo page at `http://localhost:8092/type-echo.html`.

```dd
step {"goTo":"http://localhost:8092/type-echo.html"}
```

[](#dd 'step {"find":"Type Echo Test Page"}'){.dd}

Click the field labeled Type here:, then type Hello, Doc Detective.

![step {"click":"Type here:"}](#dd){.dd}

<dd-statement>step {"type":"Hello, Doc Detective"}</dd-statement>

The field echoes each keystroke, so the page shows Hello, Doc Detective below the field.

<span data-dd='step {"wait":200}'></span>

Test step: step {"find":"Hello, Doc Detective"}

Test: **step {"find":{"selector":"#echo","elementText":"Hello, Doc Detective"}}**

Test: _step {"checkLink":"http://localhost:8092/type-echo.html"}_

<!-- dd: step {"find":"Type here:"} -->

```doc-detective
step {"find":{"selector":"#type-input"}}
```

```doc-detective draft
step {"find":"Goodbye"}
```

<!-- dd-step {"find":{"selector":"#echo"}} -->

Older versions of the page echoed only after you pressed Enter.

<!-- dd-skip -->

```dd
step {"type":"$ENTER$"}
```

<!-- doc-detective-resume -->

<!-- doc-detective-step {"find":"Type Echo Test Page"} -->

If the page doesn't load, restart the page server from the repository root:

```sh no-run
node test/server/start.js
```

<!-- doc-detective-end -->
