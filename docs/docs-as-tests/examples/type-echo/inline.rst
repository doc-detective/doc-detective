Echo text back
==============

.. test {"testId":"type-echo","detectSteps":false}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello, Doc Detective".

   .. step {"type":"Hello, Doc Detective"}

#. Check that the page shows **Hello, Doc Detective** below the field.

   .. step {"find":"Hello, Doc Detective"}

.. test end
