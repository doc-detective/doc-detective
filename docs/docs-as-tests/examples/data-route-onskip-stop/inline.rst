Stop when the help step is skipped
==================================

.. test {"testId":"data-route-onskip-stop","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","stepId":"version"}

#. If that failed, print the help for ``node``:

   .. code-block:: shell

      node --help

   .. step {"if":"$$steps.version.outputs.exitCode != 0","runShell":"node --help","onSkip":[{"stop":"test"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
