Check a page in another tab or window
=====================================

.. test {"testId":"sessions-select-window-tab","detectSteps":true,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Click the Open child in new tab link. The child page opens in a new tab.

   .. step {"click":"Open child in new tab"}

#. In the first window, check that the second tab reads "PAGE linked".

   .. step {"find":{"elementText":"PAGE linked","surface":{"browser":"firefox","window":0,"tab":1}}}

.. test end
