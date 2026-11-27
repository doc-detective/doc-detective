Find an element by a text pattern
=================================

.. test {"testId":"nav-find-elementtext-regex","detectSteps":true}

#. Go to `the element test page <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. Find the **Submit Primary** button.

   .. step {"find":{"elementText":"/^Submit Pri/"}}

.. test end
