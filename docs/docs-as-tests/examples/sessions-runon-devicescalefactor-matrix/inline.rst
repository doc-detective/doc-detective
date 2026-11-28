Check the page at two pixel densities
=====================================

.. test {"testId":"sessions-runon-devicescalefactor-matrix","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"deviceScaleFactor":"$$matrix.dpr"},"matrix":{"dpr":[1,2]}}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the device pixel ratio is the density under test, ``1`` or ``2``.

   .. step {"runBrowserScript":{"script":"return String(devicePixelRatio);","output":"/^$$matrix.dpr$/"}}

.. test end
