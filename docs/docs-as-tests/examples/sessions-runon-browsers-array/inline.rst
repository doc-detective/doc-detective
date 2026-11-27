Check the page in Firefox and Chrome
====================================

.. test {"testId":"sessions-runon-browsers-array","detectSteps":false,"runOn":[{"browsers":["firefox","chrome"]}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page reads **MULTI-TAB HOME**.

   .. step {"find":"MULTI-TAB HOME"}

.. test end
