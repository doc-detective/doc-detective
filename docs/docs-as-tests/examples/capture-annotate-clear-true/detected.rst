Remove every mark
=================

.. test {"testId":"capture-annotate-clear-true","detectSteps":true}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is marked 1.

   .. step {"annotate":{"add":[{"id":"step","badge":"#username-input","label":"1"}]}}

#. All marks go away.

   .. step {"annotate":{"clear":true}}

   .. step {"screenshot":{"path":"annotate-clear-true.png","directory":".dd-output","overwrite":"true"}}

.. test end
