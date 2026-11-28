Wait for the echo
=================

.. test {"testId":"custom-actions-object","detectSteps":false}

Open the type echo page.

.. step {"goTo":"http://localhost:8092/type-echo.html"}

Type Hello, Doc Detective.

.. step {"type":"Hello, Doc Detective"}

Wait *a moment* for the echo.

.. step {"wait":500}

.. test end
