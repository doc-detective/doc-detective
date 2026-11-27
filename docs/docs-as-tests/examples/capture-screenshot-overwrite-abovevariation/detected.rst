Save a screenshot with overwrite aboveVariation
===============================================

.. test {"testId":"capture-screenshot-overwrite-abovevariation","detectSteps":true}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":{"path":"overwrite-aboveVariation.png","directory":".dd-output","overwrite":"aboveVariation"}}

.. test end
