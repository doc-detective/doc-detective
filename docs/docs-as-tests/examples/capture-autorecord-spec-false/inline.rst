Type text with autoRecord off for a spec
========================================

.. test {"testId":"capture-autorecord-spec-false","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

.. test end
