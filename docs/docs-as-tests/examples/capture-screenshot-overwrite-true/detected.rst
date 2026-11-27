Save a screenshot with overwrite true
=====================================

.. test {"testId":"capture-screenshot-overwrite-true","detectSteps":true}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":{"path":"overwrite-true.png","directory":".dd-output","overwrite":"true"}}

.. test end
