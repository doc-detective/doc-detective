Create an account and check the status
======================================

.. test {"testId":"data-assertions-string","detectSteps":false}

#. Create an account. Send a ``POST`` request to ``http://localhost:8092/api/accounts`` with this body:

   .. code-block:: json

      {"name":"Wren","plan":"team"}

   .. step {"httpRequest":{"url":"http://localhost:8092/api/accounts","method":"post","request":{"body":{"name":"Wren","plan":"team"}}},"assertions":"$$outputs.response.statusCode == 200"}

.. test end
