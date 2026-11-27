Check the field label
=====================

.. test {"testId":"custom-statements-in-codeblock","detectSteps":true}

Open the type echo page.

.. code-block:: dd

   step {"goTo":"http://localhost:8092/type-echo.html"}

The field is labeled Type here:.

.. code-block:: dd

   step {"find":"Type here:"}

.. test end
