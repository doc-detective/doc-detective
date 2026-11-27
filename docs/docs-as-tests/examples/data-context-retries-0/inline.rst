Echo a name on a page
=====================

.. test {"testId":"data-context-retries-0","contexts":[{"retries":0}],"detectSteps":false}

#. Open ``http://localhost:8092/type-echo.html``.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Type ``Wren`` in the field.

   .. step {"type":{"keys":"Wren","selector":"#type-input"}}

#. Check that the page shows ``Wren``.

   .. step {"find":{"selector":"#echo","elementText":"Wren"}}

.. test end
