Check a page in another tab or window
=====================================

.. test {"testId":"sessions-select-window-number","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Load `the second page <http://localhost:8092/multi-tab-child.html?page=second>`__ in a new window named ``second``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=second","newWindow":"second"}}

#. Check that the selected page reads "PAGE second".

   .. step {"find":{"elementText":"PAGE second","surface":{"browser":"firefox","window":-1}}}

.. test end
