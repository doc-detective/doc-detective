Check the page in German
========================

.. test {"testId":"sessions-runon-locale","detectSteps":true,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"locale":"de-DE"}}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page's language is ``de-DE``.

   .. step {"runBrowserScript":{"script":"return navigator.language;","output":"de-DE"}}

.. test end
