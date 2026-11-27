Check the session cookie
========================

.. test {"testId":"structure-before-after","description":"Check the session cookie while signed in.","detectSteps":true,"before":"sign-in.spec.json","after":"sign-out.spec.json"}

#. Start at `the cookies page <http://localhost:8092/cookies>`__.

   .. step {"goTo":"http://localhost:8092/cookies"}

#. Check that the page lists ``structure-session=signed-in``.

   .. step {"find":"structure-session=signed-in"}

.. test end
