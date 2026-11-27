Check a service with variables from the config
==============================================

.. test {"testId":"data-loadvariables-config","detectSteps":true}

#. Check the service. Send a ``GET`` request to ``$SERVICE_URL/health``.

   .. step {"httpRequest":{"url":"$SERVICE_URL/health","method":"get"}}

.. test end
