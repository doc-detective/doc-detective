Type text
=========

.. test {"testId":"nav-type-string","detectSteps":false}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello".

   .. step {"type":"Hello"}

#. Check that the page shows **Hello** below the field.

   .. step {"find":"Hello"}

.. test end
