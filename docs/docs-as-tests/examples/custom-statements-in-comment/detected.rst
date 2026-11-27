Check the field label
=====================

.. test {"testId":"custom-statements-in-comment","detectSteps":true}

Open the type echo page.

.. dd: step {"goTo":"http://localhost:8092/type-echo.html"}

The field is labeled Type here:.

.. dd: step {"find":"Type here:"}

.. test end
