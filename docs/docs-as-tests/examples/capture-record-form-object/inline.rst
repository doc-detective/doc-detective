Record typing in a field
========================

.. test {"testId":"capture-record-form-object","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start recording.

   .. step {"record":{"path":"record-object.webm","directory":".dd-output","overwrite":"true"}}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":true}

.. test end
