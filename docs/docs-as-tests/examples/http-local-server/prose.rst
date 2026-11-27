Run a local server
==================

Start the sample API server. It takes the port as an argument and prints ``Listening`` when it's ready:

.. code-block:: js

   const http = require("http");
   const port = Number(process.argv[2]);
   http.createServer((req, res) => res.end("ok")).listen(port, () => console.log("Listening"));

Check the server's health endpoint at ``http://localhost:8231/health``. It returns ``ok``.

Stop the server when you're done.

To start a quick server from your shell instead, run:

.. code-block:: shell

   node -e "require('http').createServer((q, r) => r.end('ok')).listen(8232)"

Stop it the same way.

Terminal apps size their output to the terminal. To see the size an app gets in a 100-by-40 terminal, run:

.. code-block:: shell

   node -e "console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);"

Stop it, then run the same check from a Bash script, in the default 120-by-30 terminal:

.. code-block:: bash

   node -e "console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);"

Stop that process, then run the script again in an 80-by-24 terminal.

Stop that process too.
