Print a greeting with Node.js
=============================

.. test {"testId":"custom-script-blocks","detectSteps":false}

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

.. step {"runCode":{"language":"javascript","code":"const name = \"Doc Detective\";\nconsole.log(`Hello, ${name}!`);","stdio":"Hello, Doc Detective!"}}

The script prints ``Hello, Doc Detective!``.

.. test end
