Open a page in a new window
===========================

.. test {"testId":"nav-goto-newwindow","detectSteps":true}

#. Go to `the multi-tab page <http://localhost:8092/multi-tab.html>`_.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Open `the child page <http://localhost:8092/multi-tab-child.html?page=w1>`_ in a new window.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=w1","newWindow":true}}

#. Check that the new window shows **PAGE w1**.

.. test end
