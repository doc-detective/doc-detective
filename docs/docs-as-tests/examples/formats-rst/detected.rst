Look up a user
==============

.. test {"testId":"formats-rst","detectSteps":true}

#. Check that `the API <http://localhost:8092/status/200>`_ answers.
#. Send this request:

   .. code-block:: http

      GET http://localhost:8092/api/users?name=Linus

#. To send the same request from a terminal, run:

   .. code-block:: bash
      :class: testIgnore

      curl "http://localhost:8092/api/users?name=Linus"

.. test ignore start

To browse the demo pages, go to `the elements demo <http://localhost:8092/index.html>`_.

.. test ignore end

.. test end
