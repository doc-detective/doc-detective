Wait for a slow page
====================

.. test {"testId":"nav-wait-load","detectSteps":false}

#. Go to `the wait delay page <http://localhost:8092/wait-delay.html>`_.

   .. step {"goTo":{"url":"/wait-delay.html","origin":"http://localhost:8092","params":{"source":"docs"},"surface":"chrome","timeout":30000,"waitUntil":{"networkIdleTime":500,"domIdleTime":500,"find":{"selector":"p","elementId":"auto-message","elementText":"Loaded after 2 seconds"}}}}

#. Wait until the page shows **Loaded after 2 seconds**.

   .. step {"find":{"selector":"#auto-message","elementText":"/^Loaded after \\d+ seconds$/","timeout":5000}}

#. Click **Trigger delayed action**.

   .. step {"click":"Trigger delayed action"}

#. Wait half a second for the action to finish.

   .. step {"wait":500}

#. Check that the page shows **Action complete!**.

   .. step {"find":"Action complete!"}

#. Confirm that `the server's status endpoint <http://localhost:8092/status/200>``_ and ``the API health check <http://localhost:8092/api/health>`_ respond.

   .. step {"checkLink":{"url":"http://localhost:8092/status/200","statusCodes":[200,204],"headers":{"Accept":"application/json"},"timeout":5000}}

   .. step {"checkLink":{"url":"/api/health","origin":"http://localhost:8092","params":{"source":"docs"},"statusCodes":200,"headers":"Accept: application/json\nX-Test: docs"}}

.. test end
