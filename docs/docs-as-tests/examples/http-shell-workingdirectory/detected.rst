Run a command in a folder
=========================

.. test {"testId":"http-shell-workingdirectory","detectSteps":true}

From the folder that holds this page, print the folder's name:

.. code-block:: shell

   node -e "console.log(require('path').basename(process.cwd()))"

.. step {"runShell":{"command":"node -e \"console.log(require('path').basename(process.cwd()))\"","workingDirectory":".","stdio":"http-shell-workingdirectory"}}

.. test end
