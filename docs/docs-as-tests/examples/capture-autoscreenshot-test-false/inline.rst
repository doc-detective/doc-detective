Type text with autoScreenshot off for one test
==============================================

.. test {"testId":"capture-autoscreenshot-test-false","detectSteps":false,"autoScreenshot":false}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

.. test end
