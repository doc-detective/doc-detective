Record typing in a field
========================

.. test {"testId":"capture-record-verify-duration","detectSteps":true,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start recording.

   .. step {"record":{"path":"verify-duration.webm","directory":".dd-output","overwrite":"true","verify":{"minDuration":0.5,"maxDuration":120}}}

#. Click **Type here:**.

#. Type "Hello".

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":true}

.. test end
