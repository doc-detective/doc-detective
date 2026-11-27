Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-outline-object","detectSteps":true}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-outline-object.png","directory":".dd-output","overwrite":"true","annotations":[{"outline":{"elementTestId":"username-field"}}]}}

.. test end
