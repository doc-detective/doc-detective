Record a walkthrough
====================

.. test {"testId":"capture-record-tab","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac"],"browsers":{"name":"chrome","headless":false}},{"platforms":["linux"],"browsers":{"name":"chrome","headless":true}}]}

Record the browser tab
----------------------

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start recording the tab.

   .. step {"record":{"path":"capture-walkthrough.webm","directory":".dd-output","name":"walkthrough","engine":"browser","overwrite":"true","checkpoints":{"maxVariation":0.5,"directory":".dd-output/walkthrough-checkpoints"},"verify":{"minDuration":0.5,"maxDuration":120,"notBlack":true}}}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello, Doc Detective".

   .. step {"type":"Hello, Doc Detective"}

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":"walkthrough"}

.. test end

.. test {"testId":"capture-record-screen","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac"],"browsers":{"name":"chrome","headless":false}}]}

Record the screen
-----------------

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start a screen recording.

   .. step {"record":{"path":"capture-screen.mp4","directory":".dd-output","engine":{"name":"ffmpeg","target":"viewport","fps":15},"overwrite":"true"}}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Recorded on screen".

   .. step {"type":"Recorded on screen"}

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":true}

#. Record a short clip of the result.

   .. step {"record":".dd-output/capture-quick.gif"}

#. Wait a second, then stop the clip.

   .. step {"wait":1000}

   .. step {"stopRecord":true}

.. test end
