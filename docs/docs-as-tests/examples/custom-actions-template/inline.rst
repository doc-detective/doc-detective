Check the field label
=====================

.. test {"testId":"custom-actions-template","detectSteps":false}

Open the type echo page.

.. step {"goTo":"http://localhost:8092/type-echo.html"}

The field is labeled **Type here:**.

.. step {"find":{"elementText":"Type here:","timeout":5000}}

.. test end
