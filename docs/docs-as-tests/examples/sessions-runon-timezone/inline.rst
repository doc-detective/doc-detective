Check the page on Berlin time
=============================

.. test {"testId":"sessions-runon-timezone","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"timezone":"Europe/Berlin"}}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page's time zone is ``Europe/Berlin``.

   .. step {"runBrowserScript":{"script":"return Intl.DateTimeFormat().resolvedOptions().timeZone;","output":"Europe/Berlin"}}

.. test end
