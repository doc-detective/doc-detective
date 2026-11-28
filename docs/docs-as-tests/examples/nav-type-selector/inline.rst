Type into a field by its selector
=================================

.. test {"testId":"nav-type-selector","detectSteps":false}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Type ``Hello`` into the **Type here:** field.

   .. step {"type":{"keys":"Hello","selector":"#type-input"}}

#. Check that the page shows **Hello** below the field.

   .. step {"find":"Hello"}

.. test end
