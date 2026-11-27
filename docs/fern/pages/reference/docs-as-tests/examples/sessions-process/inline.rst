Evaluate expressions in the Node.js REPL
========================================

Start the REPL as a surface
---------------------------

.. test {"testId":"sessions-process-surface","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"requires":"node"}]}

#. Start ``node -i`` in a terminal as a process named ``sessions-repl``, and wait for the ``>`` prompt.

   .. step {"startSurface":{"process":"node","args":["-i"],"name":"sessions-repl","tty":true,"waitUntil":{"stdio":"/>/"},"timeout":30000}}

#. In the REPL, enter ``40 + 2`` and press Enter. Wait for the REPL to print ``42``.

   .. step {"type":{"keys":["40 + 2","$ENTER$"],"surface":"sessions-repl","waitUntil":{"stdio":"/42/"},"timeout":10000}}

#. Close the REPL.

   .. step {"closeSurface":{"process":"sessions-repl"}}

.. test end

Run the REPL in the background
------------------------------

.. test {"testId":"sessions-process-background","detectSteps":false,"autoRecord":false,"runOn":[{"platforms":["linux","mac","windows"],"requires":{"commands":["node"],"env":["PATH"]}}]}

#. Run ``node -i`` in the background as a process named ``sessions-bg-repl``, and wait for the ``>`` prompt.

   .. step {"runShell":{"command":"node -i","background":{"name":"sessions-bg-repl","waitUntil":{"stdio":"/>/"}},"timeout":30000}}

#. In the REPL, enter ``Math.pow(2, 10)`` and press Enter. Wait for the REPL to print ``1024``.

   .. step {"type":{"keys":["Math.pow(2, 10)","$ENTER$"],"surface":{"process":"sessions-bg-repl"},"waitUntil":{"stdio":"/1024/"},"timeout":10000}}

#. Close the REPL.

   .. step {"closeSurface":"sessions-bg-repl"}

.. test end

Start a server and a REPL together
----------------------------------

.. test {"testId":"sessions-process-server","detectSteps":false,"runOn":[{"platforms":["linux","mac","windows"],"requires":["node","npm"]}]}

#. From the ``docs/actions`` folder, start ``node simple-json-server.cjs`` as ``sessions-api``, and wait until port ``8087`` answers. At the same time, start ``node -i`` in a 100 by 30 terminal as ``sessions-client``, and give it a second to start.

   .. step {"startSurface":[{"process":"node","args":["simple-json-server.cjs"],"name":"sessions-api","workingDirectory":"../../../../docs/actions","waitUntil":{"port":8087,"httpGet":"http://localhost:8087"},"timeout":30000},{"process":"node","args":["-i"],"name":"sessions-client","tty":{"cols":100,"rows":30},"waitUntil":{"delayMs":1000}}]}

#. In the REPL, fetch the server's root URL, and wait for it to print ``ok``.

   .. step {"type":{"keys":["fetch(\"http://localhost:8087\").then((r) => r.text()).then(console.log)","$ENTER$"],"surface":"sessions-client","waitUntil":{"stdio":"/\"status\":\"ok\"/"},"timeout":10000}}

#. Close the REPL and the server.

   .. step {"closeSurface":["sessions-client",{"process":"sessions-api"}]}

.. test end
