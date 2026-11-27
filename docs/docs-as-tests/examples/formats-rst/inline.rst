Look up a user
==============

.. test {"testId":"formats-rst","detectSteps":false}

#. Check that `the API <http://localhost:8092/status/200>`_ answers.

   .. step checkLink: http://localhost:8092/status/200

#. Send this request:

   .. code-block:: http

      GET http://localhost:8092/api/users?name=Linus

   .. step
      {"httpRequest": {
        "url": "http://localhost:8092/api/users",
        "request": {"parameters": {"name": "Linus"}},
        "response": {"body": {"name": "Linus"}}
      }}

#. To send the same request from a terminal, run:

   .. code-block:: bash
      :class: testIgnore

      curl "http://localhost:8092/api/users?name=Linus"

.. test ignore start

To browse the demo pages, go to `the elements demo <http://localhost:8092/index.html>`_.

.. step {"goTo":"http://localhost:8092/index.html"}

.. test ignore end

.. test end
