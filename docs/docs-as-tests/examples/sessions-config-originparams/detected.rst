Tag every request with a query parameter
========================================

.. test {"testId":"sessions-config-originparams","detectSteps":true,"runOn":[{"browsers":"chrome"}]}

#. Go to ``/api/echo`` on the site.

   .. step {"goTo":"/api/echo"}

#. Check that the response echoes ``"from":"docs"``.

   .. step {"find":"/\"from\":\"docs\"/"}

.. test end
