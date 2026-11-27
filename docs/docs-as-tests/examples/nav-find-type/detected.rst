Find a field and type in it
===========================

.. test {"testId":"nav-find-type","detectSteps":true}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Find the **Type here:** field, click it, and type ``Hello``.

   .. step {"find":{"selector":"#type-input","click":true,"type":"Hello"}}

#. Check that the page shows **Hello** below the field.

.. test end
