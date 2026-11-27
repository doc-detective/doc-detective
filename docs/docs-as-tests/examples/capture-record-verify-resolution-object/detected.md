<!-- test {"testId":"capture-record-verify-resolution-object","detectSteps":true,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true,"viewport":{"width":800,"height":600}}}]} -->

# Record typing in a field

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Start recording.
   <!-- step {"record":{"path":"verify-resolution-object.webm","directory":".dd-output","overwrite":"true","verify":{"resolution":{"width":800,"height":600}}}} -->
3. Click **Type here:**.
4. Type "Hello".
5. Wait a moment, then stop the recording.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->

<!-- test end -->
