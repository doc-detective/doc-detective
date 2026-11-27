Print a greeting with Node.js
=============================

.. test {"testId":"custom-script-blocks","detectSteps":true}

Define the name to greet:

.. code-block:: javascript

   const name = "Doc Detective";

Don't declare ``name`` a second time. A script that does throws a ``SyntaxError``:

.. code-block:: javascript

   // Don't run: this redeclares name.
   const name = "someone else";

Print the greeting:

.. code-block:: javascript

   console.log(`Hello, ${name}!`);

The script prints ``Hello, Doc Detective!``.

.. test end
