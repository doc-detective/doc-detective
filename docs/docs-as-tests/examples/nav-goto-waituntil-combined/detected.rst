Wait for the network, the page, and an element
==============================================

.. test {"testId":"nav-goto-waituntil-combined","detectSteps":true}

#. Go to `the late element page <http://localhost:8092/waitUntil-test-late-element.html>`_.

   .. step {"goTo":{"url":"http://localhost:8092/waitUntil-test-late-element.html","timeout":10000,"waitUntil":{"networkIdleTime":500,"domIdleTime":1000,"find":{"selector":".status","elementText":"/.*operational.*/"}}}}

#. Check that the page shows **System operational**.

.. test end
