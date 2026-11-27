Check the account fields
========================

.. test {"testId":"data-assertions-word","detectSteps":false}

#. Create an account. Send a ``POST`` request to ``http://localhost:8092/api/accounts`` with this body:

   .. code-block:: json

      {"name":"Wren","plan":"team"}

   .. step {"httpRequest":{"url":"http://localhost:8092/api/accounts","method":"post","request":{"body":{"name":"Wren","plan":"team"}}},"assertions":["$$outputs.response.body.name contains \"Wr\"","$$outputs.response.body.plan oneOf [free, team, enterprise]","$$outputs.response.body.name matches /^W[a-z]+$/"]}

.. test end
