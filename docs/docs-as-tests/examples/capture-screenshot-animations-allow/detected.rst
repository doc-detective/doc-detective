Save a screenshot of an animated page with animations allow
===========================================================

.. test {"testId":"capture-screenshot-animations-allow","detectSteps":true}

#. Open the page at ``http://localhost:8092/screenshot-loop.html``.

   .. step {"goTo":{"url":"http://localhost:8092/screenshot-loop.html","waitUntil":{"networkIdleTime":0,"domIdleTime":0}}}

#. A spinner turns in the middle of the page.

   .. step {"screenshot":{"path":"animations-allow.png","directory":".dd-output","overwrite":"true","animations":"allow"}}

.. test end
