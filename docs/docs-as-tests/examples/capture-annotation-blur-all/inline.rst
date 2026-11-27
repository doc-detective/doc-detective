Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-blur-all","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-blur-all.png","directory":".dd-output","overwrite":"true","annotations":[{"blur":{"selector":".form-control"},"all":true}]}}

.. test end
