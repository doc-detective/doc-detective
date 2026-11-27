Wait for a page to settle before the screenshot
===============================================

.. test {"testId":"capture-screenshot-stable-true","detectSteps":true}

#. Open the page at ``http://localhost:8092/screenshot-late-reveal.html``.

   .. step {"goTo":{"url":"http://localhost:8092/screenshot-late-reveal.html","waitUntil":{"networkIdleTime":0,"domIdleTime":0}}}

#. A loading bar fills, then the page shows its content.

   .. step {"screenshot":{"path":"stable-true.png","directory":".dd-output","overwrite":"true","stable":true}}

.. test end
