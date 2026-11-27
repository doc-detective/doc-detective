Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-arrow-string","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-arrow-string.png","directory":".dd-output","overwrite":"true","annotations":[{"arrow":"#username-input"}]}}

.. test end
