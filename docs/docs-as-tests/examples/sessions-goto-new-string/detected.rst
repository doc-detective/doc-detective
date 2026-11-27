Open named tabs and windows
===========================

.. test {"testId":"sessions-goto-new-string","detectSteps":true,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Load `the notes page <http://localhost:8092/multi-tab-child.html?page=notes>`__ in a new tab named ``notes``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=notes","newTab":"notes"}}

#. Check that the ``notes`` tab reads "PAGE notes".

   .. step {"find":{"elementText":"PAGE notes","surface":{"browser":"firefox","tab":"notes"}}}

#. Load `the about page <http://localhost:8092/multi-tab-child.html?page=about>`__ in a new window named ``about``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=about","newWindow":"about"}}

#. Check that the new window reads "PAGE about".

   .. step {"find":"PAGE about"}

.. test end
