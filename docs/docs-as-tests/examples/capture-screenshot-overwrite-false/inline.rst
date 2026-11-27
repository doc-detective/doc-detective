Save a screenshot with overwrite false
======================================

.. test {"testId":"capture-screenshot-overwrite-false","detectSteps":false}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":{"path":"overwrite-false.png","directory":".dd-output","overwrite":"false"}}

.. test end
