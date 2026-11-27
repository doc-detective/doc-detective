Save a screenshot with a path and a folder
==========================================

.. test {"testId":"capture-screenshot-form-object","detectSteps":true}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":{"path":"banner.png","directory":".dd-output"}}

.. test end
