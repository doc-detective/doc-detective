Fill in a form by element attributes
====================================

.. test {"testId":"nav-find-elements","detectSteps":false}

#. Go to `the element test page <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. Find the **Submit by ID** button near the top of the page.

   .. step {"find":{"elementId":"submit-button","elementText":"Submit by ID","elementAria":"Submit form button","moveTo":true}}

#. Click the username field and type "kittens".

   .. step {"find":{"selector":"input","elementTestId":"username-field","click":true,"type":{"keys":["kittens"]},"timeout":10000}}

#. Click the password field and type "hunter2".

   .. step {"find":{"elementTestId":"password-field","elementClass":"form-control","click":"left","type":"hunter2","surface":"chrome"}}

#. Click the contact email field and type "you@example.com".

   .. step {"find":{"elementId":"contact-email","elementAttribute":{"data-validation":"email-regex-validator"},"click":true,"type":["you@example.com"]}}

#. Type "-cat" at the end of the username.

   .. step {"type":{"keys":"-cat","elementId":"username-input","elementTestId":"username-field","elementAttribute":{"placeholder":"Username"}}}

#. Type "docs" in the search field, and wait for the page to settle.

   .. step {"type":{"keys":["docs"],"elementAria":"Search input field","elementClass":["form-control"],"surface":"chrome","timeout":5000,"waitUntil":{"networkIdleTime":100,"domIdleTime":100,"find":{"elementTestId":"result-display","elementText":"Operation successful"}}}}

#. Check that the **Submit Order** button is enabled.

   .. step {"find":{"selector":"button","elementText":"/^Submit Ord/","elementTestId":"checkout-button","elementClass":["btn","/^btn-prim/"],"elementAttribute":{"data-enabled":"true","disabled":false}}}

#. Click **Save**.

   .. step {"click":{"elementText":"Save","elementAttribute":{"aria-label":"Save document button"},"elementClass":"btn-primary","timeout":5000,"surface":"chrome"}}

#. Click **Login Submit**.

   .. step {"click":{"elementTestId":"login-form-submit","elementClass":["btn","btn-large"],"surface":{"browser":"chrome"}}}

#. Confirm that the page shows **Operation successful**.

   .. step {"find":"Operation successful"}

.. test end
