Mark a field on the page
========================

.. test {"testId":"capture-annotate-add","detectSteps":true}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is marked 1.

   .. step {"annotate":{"add":[{"id":"step","badge":"#username-input","label":"1"}]}}

   .. step {"screenshot":{"path":"annotate-add.png","directory":".dd-output","overwrite":"true"}}

.. test end
