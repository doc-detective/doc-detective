Save a screenshot of a long page with fullPage false
====================================================

.. test {"testId":"capture-screenshot-fullpage-false","detectSteps":true}

#. Open the page at ``http://localhost:8092/screenshot-tall.html``.

   .. step {"goTo":{"url":"http://localhost:8092/screenshot-tall.html","waitUntil":{"networkIdleTime":0,"domIdleTime":0}}}

#. The page ends with a red box at the bottom.

   .. step {"screenshot":{"path":"fullpage-false.png","directory":".dd-output","overwrite":"true","fullPage":false}}

.. test end
