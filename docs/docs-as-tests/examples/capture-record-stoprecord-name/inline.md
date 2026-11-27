<!-- test {"testId":"capture-record-stoprecord-name","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]} -->

# Record typing in a field

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Start recording.
   <!-- step {"record":{"path":"stoprecord-name.webm","directory":".dd-output","overwrite":"true","name":"typing"}} -->
3. Click **Type here:**.
   <!-- step {"click":"Type here:"} -->
4. Type "Hello".
   <!-- step {"type":"Hello"} -->
5. Wait a moment, then stop the recording.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":"typing"} -->

<!-- test end -->
