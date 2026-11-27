Check your Node.js setup
========================

Print the Node.js version. The output starts with ``v`` and the major version:

.. code-block:: shell

   node --version

Confirm that Node.js runs a script:

.. code-block:: shell

   node -e "console.log('ready')"

A script that calls ``process.exit(1)`` exits with code ``1``:

.. code-block:: shell

   node -e "process.exit(1)"

From the folder that holds this page, print the folder's name. The output matches the saved copy in ``folder-name.txt``:

.. code-block:: shell

   node -e "console.log(require('path').basename(process.cwd()))"

Start a preview process, and wait until it prints ``Preview ready``:

.. code-block:: shell

   node -e "console.log('Preview ready'); setInterval(() => {}, 1000)"

Stop the preview process when you're done.
