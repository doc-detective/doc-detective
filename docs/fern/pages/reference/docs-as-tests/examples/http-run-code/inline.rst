Print a greeting
================

.. test {"testId":"http-run-code","detectSteps":false}

Run this JavaScript with Node.js:

.. code-block:: javascript

   console.log("Hello from JavaScript");

.. step {"runCode":{"language":"javascript","code":"console.log(\"Hello from JavaScript\");","stdio":"Hello from JavaScript","exitCodes":[0],"workingDirectory":".","timeout":10000,"path":"output/greeting.txt","maxVariation":0,"overwrite":"false"}}

Run the same greeting in Python:

.. code-block:: py

   print("Hello from Python")

.. step {"runCode":{"language":"py","code":"print(\"Hello from Python\")","stdio":"/^Hello from Python/"}}

Or in Bash:

.. code-block:: bash

   echo "Hello from Bash"

.. step {"runCode":{"language":"bash","code":"echo \"Hello from Bash\"","stdio":"Hello from Bash"}}

To install the greeter for every project on your machine, run:

.. code-block:: bash

   npm install --global ./greeter

.. test end
