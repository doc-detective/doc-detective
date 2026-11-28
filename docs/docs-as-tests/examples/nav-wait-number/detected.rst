Pause for a set time
====================

.. test {"testId":"nav-wait-number","detectSteps":true}

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.

   .. step {"goTo":"http://localhost:8092/wait-delay.html"}

#. Wait three seconds.

   .. step {"wait":3000}

#. Check that the page shows **Loaded after 2 seconds**.

.. test end
