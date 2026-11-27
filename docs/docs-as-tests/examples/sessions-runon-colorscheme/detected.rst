Check the page in dark mode
===========================

.. test {"testId":"sessions-runon-colorscheme","detectSteps":true,"runOn":[{"platforms":["linux","mac","windows"],"browsers":{"name":"chrome","headless":true,"colorScheme":"dark"}}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Check that the page prefers the dark color scheme.

   .. step {"runBrowserScript":{"script":"return String(matchMedia(\"(prefers-color-scheme: dark)\").matches);","output":"true"}}

.. test end
