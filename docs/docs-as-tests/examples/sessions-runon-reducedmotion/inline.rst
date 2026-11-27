Check the page with reduced motion
==================================

.. test {"testId":"sessions-runon-reducedmotion","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"reducedMotion":"reduce"}}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page prefers reduced motion.

   .. step {"runBrowserScript":{"script":"return String(matchMedia(\"(prefers-reduced-motion: reduce)\").matches);","output":"true"}}

.. test end
