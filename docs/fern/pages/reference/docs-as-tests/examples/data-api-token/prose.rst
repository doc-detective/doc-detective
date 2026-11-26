Create an account with an API token
===================================

Keep the API address and your token in a ``.env`` file next to this page:

.. code-block:: text

   API_URL=http://localhost:8092/api
   API_TOKEN=your-api-token

#. Load the variables from your ``.env`` file.

#. Send a ``POST`` request to ``$API_URL/accounts`` with the header ``Authorization: Bearer $API_TOKEN`` and this body:

   .. code-block:: json

      {"name": "Wren", "plan": "team", "seats": 5}

   The API returns status ``200`` and the new account, with ``plan`` set to ``team``. Note the account's ``name`` and ``seats``.

#. Look up the account. Send a ``GET`` request to ``$API_URL/accounts?name=<name>&seats=<seats>``. The response shows the same name and seat count.
