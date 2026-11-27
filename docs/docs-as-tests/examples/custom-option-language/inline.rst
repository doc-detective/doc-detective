Check the page's status code
============================

.. test {"testId":"custom-option-language","detectSteps":false}

Print the page's status code:

.. code-block:: bash

   curl -s -o /dev/null -w "%{http_code}" http://localhost:8092/type-echo.html

.. step {"runShell":"curl -s -o /dev/null -w \"%{http_code}\" http://localhost:8092/type-echo.html"}

The command prints:

.. code-block:: text

   200

.. test end
