Open pages in a new tab and a new window
========================================

.. test {"testId":"sessions-goto-new-boolean","detectSteps":false}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Load `the tab page <http://localhost:8092/multi-tab-child.html?page=tab>`__ in a new tab.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=tab","newTab":true}}

#. Check that the page reads "PAGE tab".

   .. step {"find":"PAGE tab"}

#. Load `the window page <http://localhost:8092/multi-tab-child.html?page=window>`__ in a new window.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=window","newWindow":true}}

#. Check that the page reads "PAGE window".

   .. step {"find":"PAGE window"}

.. test end
