Type text with autoRecord on in config
======================================

.. test {"testId":"capture-autorecord-config-true","detectSteps":true,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

#. Type "Hello".

.. test end
