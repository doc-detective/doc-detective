Save a screenshot of one button
===============================

.. test {"testId":"capture-screenshot-crop-string","detectSteps":true}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The **Submit by ID** button is at the top of the form.

   .. step {"screenshot":{"path":"crop-string.png","directory":".dd-output","overwrite":"true","crop":"#submit-button"}}

.. test end
