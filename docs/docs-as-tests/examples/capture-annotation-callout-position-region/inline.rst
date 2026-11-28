Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-callout-position-region","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-callout-position-region.png","directory":".dd-output","overwrite":"true","annotations":[{"callout":"#username-input","label":"Your account name","position":"right"}]}}

.. test end
