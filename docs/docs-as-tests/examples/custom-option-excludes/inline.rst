Check the field label
=====================

.. test {"testId":"custom-option-excludes","detectSteps":false}

Open the type echo page.

.. step {"goTo":"http://localhost:8092/type-echo.html"}

**Note:** The field echoes each keystroke.

The field is labeled **Type here:**.

.. step {"find":"Type here:"}

.. test end
