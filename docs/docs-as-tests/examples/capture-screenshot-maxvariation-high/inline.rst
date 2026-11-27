Compare a screenshot with high tolerance
========================================

.. test {"testId":"capture-screenshot-maxvariation-high","detectSteps":false}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":{"path":"maxvariation-high.png","directory":".dd-output","maxVariation":0.5,"overwrite":"aboveVariation"}}

.. test end
