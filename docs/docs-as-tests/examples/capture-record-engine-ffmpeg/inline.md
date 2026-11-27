<!-- test {"testId":"capture-record-engine-ffmpeg","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac"],"browsers":{"name":"chrome","headless":false}}]} -->

# Record typing in a field

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Start recording.
   <!-- step {"record":{"path":"engine-ffmpeg.mp4","directory":".dd-output","overwrite":"true","engine":"ffmpeg"}} -->
3. Click **Type here:**.
   <!-- step {"click":"Type here:"} -->
4. Type "Hello".
   <!-- step {"type":"Hello"} -->
5. Wait a moment, then stop the recording.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->

<!-- test end -->
