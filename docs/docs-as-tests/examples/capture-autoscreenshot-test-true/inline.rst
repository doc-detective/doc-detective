Type text with autoScreenshot on for one test
=============================================

.. test {"testId":"capture-autoscreenshot-test-true","detectSteps":false,"autoScreenshot":true}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

.. test end
