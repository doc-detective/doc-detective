Mark the sign-in form
=====================

.. test {"testId":"capture-annotation-text-region","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field comes first.

   .. step {"screenshot":{"path":"annotation-text-region.png","directory":".dd-output","overwrite":"true","annotations":[{"text":{"position":"top-right"},"label":"Sample data"}]}}

.. test end
