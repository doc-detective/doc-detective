Move a mark to the next field
=============================

.. test {"testId":"capture-annotate-update","detectSteps":true}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is marked 1.

   .. step {"annotate":{"add":[{"id":"step","badge":"#username-input","label":"1"}]}}

#. Then the button is marked 2.

   .. step {"annotate":{"update":[{"id":"step","badge":"#submit-button","label":"2"}]}}

   .. step {"screenshot":{"path":"annotate-update.png","directory":".dd-output","overwrite":"true"}}

.. test end
