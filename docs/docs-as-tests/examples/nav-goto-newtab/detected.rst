Open a page in a new tab
========================

.. test {"testId":"nav-goto-newtab","detectSteps":true}

#. Go to `the multi-tab page <http://localhost:8092/multi-tab.html>`_.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Open `the child page <http://localhost:8092/multi-tab-child.html?page=docs>`_ in a new tab.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=docs","newTab":true}}

#. Check that the new tab shows **PAGE docs**.

.. test end
