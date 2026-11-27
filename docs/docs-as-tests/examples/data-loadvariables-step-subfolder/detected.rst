Check a service from an environment file in a child folder
==========================================================

.. test {"testId":"data-loadvariables-step-subfolder","detectSteps":true}

#. Load the variables in ``env/service.env``.

   .. step {"loadVariables":"env/service.env"}

#. Check the service. Send a ``GET`` request to ``$SERVICE_URL/health``.

   .. step {"httpRequest":{"url":"$SERVICE_URL/health","method":"get"}}

.. test end
