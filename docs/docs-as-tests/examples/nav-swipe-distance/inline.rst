Swipe most of the screen
========================

.. test {"testId":"nav-swipe-distance","detectSteps":false}

#. Go to `the element test page <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. Swipe up across most of the screen.

   .. step {"swipe":{"direction":"up","distance":0.8}}

#. Check that **Submit by ID** is still on the page.

   .. step {"find":"Submit by ID"}

.. test end
