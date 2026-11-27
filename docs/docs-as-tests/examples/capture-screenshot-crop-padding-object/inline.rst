Save a screenshot of one button with uneven padding
===================================================

.. test {"testId":"capture-screenshot-crop-padding-object","detectSteps":false}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The **Submit by ID** button is at the top of the form.

   .. step {"screenshot":{"path":"crop-padding-object.png","directory":".dd-output","overwrite":"true","crop":{"elementText":"Submit by ID","padding":{"top":8,"right":16,"bottom":8,"left":16}}}}

.. test end
