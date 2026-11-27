Wait for a slow page
====================

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.
#. Wait until the page shows **Loaded after 2 seconds**.
#. Click **Trigger delayed action**.
#. Wait half a second for the action to finish.
#. Check that the page shows **Action complete!**.
#. Confirm that `the server's status endpoint <http://localhost:8092/status/200>``_ and ``the API health check <http://localhost:8092/api/health>`_ respond.
