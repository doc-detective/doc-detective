<!-- test {"testId":"custom-statements-in-codeblock","detectSteps":true} -->

# Check the field label

Open the type echo page.

```dd
step {"goTo":"http://localhost:8092/type-echo.html"}
```

The field is labeled Type here:.

```dd
step {"find":"Type here:"}
```

<!-- test end -->
