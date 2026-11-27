Find an element by an attribute value
=====================================

.. test {"testId":"nav-find-elementattribute-string","detectSteps":true}

#. Go to `the element test page <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. Find the **Count: 5** button.

   .. step {"find":{"elementAttribute":{"data-count":"5"}}}

.. test end
