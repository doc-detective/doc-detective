Check your Node.js setup
========================

.. test {"testId":"http-run-shell","detectSteps":true}

Print the Node.js version. The output starts with ``v`` and the major version:

.. code-block:: shell

   node --version

.. step {"runShell":{"command":"node","args":["--version"],"stdio":"/^v\\d+\\./"}}

Confirm that Node.js runs a script:

.. code-block:: shell

   node -e "console.log('ready')"

.. step {"runShell":"node -e \"console.log('ready')\""}

A script that calls ``process.exit(1)`` exits with code ``1``:

.. code-block:: shell

   node -e "process.exit(1)"

.. step {"runShell":{"command":"node -e \"process.exit(1)\"","shell":"bash","exitCodes":[1],"timeout":10000}}

From the folder that holds this page, print the folder's name. The output matches the saved copy in ``folder-name.txt``:

.. code-block:: shell

   node -e "console.log(require('path').basename(process.cwd()))"

.. step {"runShell":{"command":"node -e \"console.log(require('path').basename(process.cwd()))\"","workingDirectory":".","stdio":"http-run-shell","path":"folder-name.txt","maxVariation":0.1,"overwrite":"aboveVariation"}}

Start a preview process, and wait until it prints ``Preview ready``:

.. code-block:: shell

   node -e "console.log('Preview ready'); setInterval(() => {}, 1000)"

.. step {"runShell":{"command":"node -e \"console.log('Preview ready'); setInterval(() => {}, 1000)\"","background":{"name":"http-shell-preview","waitUntil":{"stdio":"Preview ready","delayMs":250}},"timeout":15000}}

Stop the preview process when you're done.

.. step {"closeSurface":"http-shell-preview"}

.. test end
