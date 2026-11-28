Check the page in Firefox
=========================

.. test {"testId":"sessions-runon-fallback-explicit","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"explicit","retries":0}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page reads **MULTI-TAB HOME**.

   .. step {"find":"MULTI-TAB HOME"}

.. test end
