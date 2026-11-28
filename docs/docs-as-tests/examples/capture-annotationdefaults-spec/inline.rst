Outline a field with the spec theme
===================================

.. test {"testId":"capture-annotationdefaults-spec","detectSteps":false,"annotationDefaults":{"color":"#0EA5E9","strokeWidth":4}}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The username field is outlined.

   .. step {"screenshot":{"path":"defaults-spec.png","directory":".dd-output","overwrite":"true","annotations":[{"outline":"#username-input"}]}}

.. test end
