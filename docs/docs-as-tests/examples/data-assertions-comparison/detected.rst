Check the status code range
===========================

.. test {"testId":"data-assertions-comparison","detectSteps":true}

#. Create an account. Send a ``POST`` request to ``http://localhost:8092/api/accounts`` with this body:

   .. code-block:: json

      {"name":"Wren","plan":"team"}

   .. step {"httpRequest":{"url":"http://localhost:8092/api/accounts","method":"post","request":{"body":{"name":"Wren","plan":"team"}}},"assertions":["$$outputs.response.statusCode == 200","$$outputs.response.statusCode != 404","$$outputs.response.statusCode > 199","$$outputs.response.statusCode < 300","$$outputs.response.statusCode >= 200","$$outputs.response.statusCode <= 299"]}

.. test end
