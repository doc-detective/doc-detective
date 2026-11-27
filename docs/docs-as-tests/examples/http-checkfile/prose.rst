Check a build report
====================

Write the build report to the ``output`` folder next to this page:

.. code-block:: shell

   node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','build 7 passed')"

Check that the ``output`` folder holds a text file.

Check that the report says the build passed.
