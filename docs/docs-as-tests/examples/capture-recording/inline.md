# Record a walkthrough

<!-- test {"testId":"capture-record-tab","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac"],"browsers":{"name":"chrome","headless":false}},{"platforms":["linux"],"browsers":{"name":"chrome","headless":true}}]} -->

## Record the browser tab

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Start recording the tab.
   <!-- step {"record":{"path":"capture-walkthrough.webm","directory":".dd-output","name":"walkthrough","engine":"browser","overwrite":"true","checkpoints":{"maxVariation":0.5,"directory":".dd-output/walkthrough-checkpoints"},"surface":{"browser":"chrome"},"verify":{"minDuration":0.5,"maxDuration":120,"notBlack":true,"resolution":true}}} -->
3. Click **Type here:**.
   <!-- step {"click":"Type here:"} -->
4. Type "Hello, Doc Detective".
   <!-- step {"type":"Hello, Doc Detective"} -->
5. Wait a moment, then stop the recording.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":{"name":"walkthrough"}} -->
6. Record a few seconds more with the default settings.
   <!-- step {"record":true} -->
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->

<!-- test end -->

<!-- test {"testId":"capture-record-screen","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac"],"browsers":{"name":"chrome","headless":false}}]} -->

## Record the screen

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
   <!-- step {"goTo":"http://localhost:8092/type-echo.html"} -->
2. Start a screen recording.
   <!-- step {"record":{"path":"capture-screen.mp4","directory":".dd-output","name":"screen","engine":{"name":"ffmpeg","target":"display","fps":15},"overwrite":"true"}} -->
3. Click **Type here:**.
   <!-- step {"click":"Type here:"} -->
4. Type "Recorded on screen".
   <!-- step {"type":"Recorded on screen"} -->
5. Wait a moment, then stop the recording.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":"screen"} -->
6. Record only the browser window.
   <!-- step {"record":{"path":"capture-window.mp4","directory":".dd-output","engine":{"name":"ffmpeg","target":"window"},"overwrite":"true"}} -->
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->
7. Record only the page, and compare each step with the last run.
   <!-- step {"record":{"path":"capture-viewport.mp4","directory":".dd-output","engine":{"name":"ffmpeg","target":"viewport"},"overwrite":"true","checkpoints":true}} -->
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->
8. Record the screen again with the default ffmpeg settings.
   <!-- step {"record":{"path":"capture-ffmpeg.mp4","directory":".dd-output","engine":"ffmpeg","overwrite":"true"}} -->
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->
9. Record a short clip of the result.
   <!-- step {"record":".dd-output/capture-quick.gif"} -->
10. Wait a second, then stop the clip.
   <!-- step {"wait":1000} -->
   <!-- step {"stopRecord":true} -->

<!-- test end -->
