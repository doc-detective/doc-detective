Record typing in a field
========================

.. test {"testId":"capture-record-stoprecord-name","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start recording.

   .. step {"record":{"path":"stoprecord-name.webm","directory":".dd-output","overwrite":"true","name":"typing"}}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":"typing"}

.. test end
