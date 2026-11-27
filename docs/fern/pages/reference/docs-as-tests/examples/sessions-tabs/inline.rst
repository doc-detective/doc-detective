Compare pages in tabs, windows, and sessions
============================================

.. test {"testId":"sessions-tabs","detectSteps":false,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Click the Open child in new tab link. The child page opens in a new tab.

   .. step {"click":"Open child in new tab"}

#. In the newest tab, check that the page reads "PAGE linked".

   .. step {"find":{"elementText":"PAGE linked","surface":{"browser":"firefox","tab":-1}}}

#. In a new tab named ``report``, load `the report page <http://localhost:8092/multi-tab-child.html?page=report>`__.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=report","newTab":"report"}}

#. In a new window named ``settings``, load `the settings page <http://localhost:8092/multi-tab-child.html?page=settings>`__.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=settings","newWindow":"settings"}}

#. Start a second Firefox session named ``reviewer``, with an 800 by 600 viewport, and load `the review page <http://localhost:8092/multi-tab-child.html?page=review>`__ in it.

   .. step {"startSurface":{"browser":"firefox","name":"reviewer","headless":true,"viewport":{"width":800,"height":600}}}

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=review","surface":{"browser":"firefox","name":"reviewer"}}}

#. In the first tab of the first session, check that the page still reads "MULTI-TAB HOME".

   .. step {"find":{"elementText":"MULTI-TAB HOME","surface":{"browser":"firefox","tab":0}}}

#. Close the child tab, the ``report`` tab, the ``settings`` window, and the ``reviewer`` session.

   .. step {"closeSurface":[{"browser":"firefox","tab":{"title":"Child linked"}},{"browser":"firefox","tab":"report"},{"browser":"firefox","window":"settings"},"reviewer"]}

.. test end
