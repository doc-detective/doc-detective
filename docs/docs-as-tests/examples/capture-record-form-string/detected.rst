Record typing in a field
========================

.. test {"testId":"capture-record-form-string","detectSteps":true,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Start recording.

   .. step {"record":".dd-output/typing.webm"}

#. Click **Type here:**.

#. Type "Hello".

#. Wait a moment, then stop the recording.

   .. step {"wait":1000}

   .. step {"stopRecord":true}

.. test end
