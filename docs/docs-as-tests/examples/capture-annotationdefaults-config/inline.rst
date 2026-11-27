Outline a field with the config theme
=====================================

.. test {"testId":"capture-annotationdefaults-config","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is outlined.

   .. step {"screenshot":{"path":"defaults-config.png","directory":".dd-output","overwrite":"true","annotations":[{"outline":"#username-input"}]}}

.. test end
