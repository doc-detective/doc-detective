Type into the field
===================

.. test {"testId":"custom-option-precededby","detectSteps":false}

Open the type echo page.

.. step {"goTo":"http://localhost:8092/type-echo.html"}

Click **Type here:**.

.. step {"click":"Type here:"}

Type Hello, Doc Detective.

.. step {"type":"Hello, Doc Detective"}

The page shows **Hello, Doc Detective** below the field.

.. step {"find":"Hello, Doc Detective"}

.. test end
