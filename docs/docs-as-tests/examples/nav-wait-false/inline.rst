Skip a pause
============

.. test {"testId":"nav-wait-false","detectSteps":false}

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.

   .. step {"goTo":"http://localhost:8092/wait-delay.html"}

#. Skip the pause.

   .. step {"wait":false}

#. Check that the page shows **Loaded after 2 seconds**.

   .. step {"find":"Loaded after 2 seconds"}

.. test end
