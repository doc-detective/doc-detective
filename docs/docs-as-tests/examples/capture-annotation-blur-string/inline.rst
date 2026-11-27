Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-blur-string","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-blur-string.png","directory":".dd-output","overwrite":"true","annotations":[{"blur":"#contact-email"}]}}

.. test end
