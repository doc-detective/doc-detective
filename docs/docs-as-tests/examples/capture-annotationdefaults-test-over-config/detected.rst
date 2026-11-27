Outline a field when config and test set themes
===============================================

.. test {"testId":"capture-annotationdefaults-test-over-config","detectSteps":true,"annotationDefaults":{"color":"#0EA5E9","strokeWidth":4}}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is outlined.

   .. step {"screenshot":{"path":"defaults-test-over-config.png","directory":".dd-output","overwrite":"true","annotations":[{"outline":"#username-input"}]}}

.. test end
