Type text with autoRecord off for a spec
========================================

.. test {"testId":"capture-autorecord-spec-false","detectSteps":true,"autoRecord":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

#. Type "Hello".

.. test end
