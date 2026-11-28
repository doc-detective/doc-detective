Pause for the default time
==========================

.. test {"testId":"nav-wait-true","detectSteps":true}

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.

   .. step {"goTo":"http://localhost:8092/wait-delay.html"}

#. Wait a few seconds.

   .. step {"wait":true}

#. Check that the page shows **Loaded after 2 seconds**.

.. test end
