Check a page in another tab or window
=====================================

.. test {"testId":"sessions-select-tab-number","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Load `the second page <http://localhost:8092/multi-tab-child.html?page=second>`__ in a new tab named ``second``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=second","newTab":"second"}}

#. Check that the selected page reads "MULTI-TAB HOME".

   .. step {"find":{"elementText":"MULTI-TAB HOME","surface":{"browser":"firefox","tab":0}}}

.. test end
