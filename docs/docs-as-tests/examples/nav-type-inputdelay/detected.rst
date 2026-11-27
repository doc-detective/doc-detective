Type slowly
===========

.. test {"testId":"nav-type-inputdelay","detectSteps":true}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.
#. Type ``Hello``, one key at a time.

   .. step {"type":{"keys":"Hello","inputDelay":200}}

#. Check that the page shows **Hello** below the field.

.. test end
