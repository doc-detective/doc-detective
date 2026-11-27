Pause for a set time
====================

.. test {"testId":"nav-wait-number","detectSteps":false}

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.

   .. step {"goTo":"http://localhost:8092/wait-delay.html"}

#. Wait three seconds.

   .. step {"wait":3000}

#. Check that the page shows **Loaded after 2 seconds**.

   .. step {"find":{"selector":"#auto-message","elementText":"Loaded after 2 seconds","timeout":0}}

.. test end
