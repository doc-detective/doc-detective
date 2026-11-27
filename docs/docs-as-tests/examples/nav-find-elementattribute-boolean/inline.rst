Find an element by an attribute's presence
==========================================

.. test {"testId":"nav-find-elementattribute-boolean","detectSteps":false}

#. Go to `the element test page <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. Find the **Disabled Button** button.

   .. step {"find":{"elementAttribute":{"disabled":true}}}

.. test end
