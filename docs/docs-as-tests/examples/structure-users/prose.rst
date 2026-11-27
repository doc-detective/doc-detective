Manage users
============

Create a user
-------------

To create a user, send a ``POST`` request to ``/api/users``:

.. code-block:: http

   POST http://localhost:8092/api/users
   Content-Type: application/json

   {"name": "Ada"}

Look up a user
--------------

To look up a user by name, send a ``GET`` request with a ``name`` parameter:

.. code-block:: http

   GET http://localhost:8092/api/users?name=Ada

Delete a user
-------------

To delete a user, send a ``DELETE`` request:

.. code-block:: http

   DELETE http://localhost:8092/api/users/ada
