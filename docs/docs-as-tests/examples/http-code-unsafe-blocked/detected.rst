Skip an unsafe step
===================

.. test {"testId":"http-code-unsafe-blocked","detectSteps":true}

Run this code:

.. code-block:: javascript

   console.log("ready");

Then confirm that Node.js runs:

.. code-block:: shell

   node -e "console.log('done')"

.. step {"runShell":{"command":"node -e \"console.log('done')\"","stdio":"done"}}

.. test end
