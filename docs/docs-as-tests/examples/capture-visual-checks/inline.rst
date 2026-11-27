Check pages for visual changes
==============================

.. test {"testId":"capture-visual-checks","detectSteps":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":true}}]}

#. Go to `the billing page <http://localhost:8092/mask.html>`_.

   .. step {"goTo":"http://localhost:8092/mask.html"}

#. The page shows the next invoice date and when the account last synced. Those times change on every visit.

   .. step {"screenshot":{"path":"capture-billing.png","directory":".dd-output","maxVariation":0.05,"threshold":0.2,"maxDiffPixels":500,"mask":["#clock",{"selector":".stamp"}]}}

#. The billing panel sits at the top of the page.

   .. step {"screenshot":{"path":"capture-panel.png","directory":".dd-output","overwrite":"true","crop":"#panel"}}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. With the cookie banner hidden, the page shows only its content.

   .. step {"screenshot":{"path":"capture-content.png","directory":".dd-output","overwrite":"true","surface":"chrome","style":".cookie-banner { visibility: hidden !important; }","stable":true,"animations":"disabled"}}

#. With the banner showing, it covers the bottom of the page.

   .. step {"screenshot":true}

#. Go to `the long page <http://localhost:8092/screenshot-tall.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-tall.html"}

#. Scroll to the red box at the bottom of the page.

   .. step {"screenshot":{"path":"capture-tall.png","directory":".dd-output","overwrite":"true","fullPage":true}}

#. Go to `the toolbar page <http://localhost:8092/find-image.html>`_.

   .. step {"goTo":"http://localhost:8092/find-image.html"}

#. Compare the sample chart with the published chart image.

   .. step {"screenshot":{"path":"http://localhost:8092/find-image-chart.png","crop":"#sample-chart","maxVariation":0.2}}

.. test end
