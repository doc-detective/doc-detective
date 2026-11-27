Type text and press Enter
=========================

.. test {"testId":"nav-type-array-enter","detectSteps":true}

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.
#. Type ``Hello`` and press Enter.

   .. step {"type":["Hello","$ENTER$"]}

#. Check that the page shows **Hello** below the field.

.. test end
