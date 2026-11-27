Check a status file's text
==========================

.. test {"testId":"http-checkfile-content-string","detectSteps":false}

Write the deploy status to the ``output`` folder next to this page:

.. code-block:: shell

   node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/status.txt','deploy succeeded')"

.. step {"runShell":{"command":"node -e \"const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/status.txt','deploy succeeded')\"","workingDirectory":"."}}

Check that the status file says ``succeeded``.

.. step {"checkFile":{"path":"output/status.txt","content":"succeeded"}}

.. test end
