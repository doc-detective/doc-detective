Review a page in a second browser session
=========================================

.. test {"testId":"sessions-surface-browser","detectSteps":true}

#. Start a headless Firefox session named ``reviewer``.

   .. step {"startSurface":{"browser":"firefox","name":"reviewer","headless":true}}

#. In that session, load `the review page <http://localhost:8092/multi-tab-child.html?page=review>`__.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=review","surface":{"browser":"firefox","name":"reviewer"}}}

#. Check that the page reads "PAGE review".

   .. step {"find":{"elementText":"PAGE review","surface":{"browser":"firefox","name":"reviewer"}}}

#. Close the ``reviewer`` session.

   .. step {"closeSurface":{"browser":"firefox","name":"reviewer"}}

.. test end
