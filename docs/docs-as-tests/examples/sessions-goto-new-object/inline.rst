Open a named window with a named tab
====================================

.. test {"testId":"sessions-goto-new-object","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Load `the report page <http://localhost:8092/multi-tab-child.html?page=report>`__ in a new tab named ``report``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=report","newTab":{"name":"report"}}}

#. Load `the settings page <http://localhost:8092/multi-tab-child.html?page=settings>`__ in a new window named ``settings``, with its first tab named ``general``.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=settings","newWindow":{"name":"settings","tab":"general"}}}

#. Check that the ``general`` tab of the ``settings`` window reads "PAGE settings".

   .. step {"find":{"elementText":"PAGE settings","surface":{"browser":"firefox","window":{"name":"settings"},"tab":{"name":"general"}}}}

.. test end
