Type text with autoRecord on for one test
=========================================

.. test {"testId":"capture-autorecord-test-true","detectSteps":true,"autoRecord":true,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

#. Type "Hello".

.. test end
