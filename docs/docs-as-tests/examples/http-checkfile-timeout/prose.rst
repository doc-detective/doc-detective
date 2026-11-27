Wait for a slow file
====================

Start a job that writes its result to the ``output`` folder after one second:

.. code-block:: shell

   node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});setTimeout(()=>fs.writeFileSync('output/late.txt','done'),1000)"

Wait up to 15 seconds for ``output/late.txt``.
