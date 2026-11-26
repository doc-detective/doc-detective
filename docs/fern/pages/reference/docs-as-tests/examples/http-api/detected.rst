Create and list users
=====================

.. test {"testId":"http-api","detectSteps":true}

Check that the API is up: send a ``GET`` request to ``http://localhost:8092/api/health``.

.. step {"httpRequest":"http://localhost:8092/api/health"}

To create a user, send a ``POST`` request with the user as JSON:

.. code-block:: http

   POST http://localhost:8093/api/users HTTP/1.1
   Content-Type: application/json

   {"name": "Ada", "job": "engineer"}

The response echoes the user you sent.

To list the second page of users, send a ``GET`` request with the ``page`` parameter::

   GET http://localhost:8092/api/users?page=2
   X-Test: docs

The response echoes the ``page`` parameter, and its ``x-echo-test`` header repeats the ``X-Test`` header you sent.

.. test end
