Check a status file's text
==========================

Write the deploy status to the ``output`` folder next to this page:

.. code-block:: shell

   node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/status.txt','deploy succeeded')"

Check that the status file says ``succeeded``.
