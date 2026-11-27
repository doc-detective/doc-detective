Type into a field by its ID
===========================

.. test {"testId":"nav-type-elementid","detectSteps":false}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Type ``Hello`` into the **Type here:** field.

   .. step {"type":{"keys":["Hello"],"elementId":"type-input"}}

#. Check that the page shows **Hello** below the field.

   .. step {"find":"Hello"}

.. test end
