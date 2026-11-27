Save a screenshot with the default name
=======================================

.. test {"testId":"capture-screenshot-form-true","detectSteps":true}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. step {"screenshot":true}

.. test end
