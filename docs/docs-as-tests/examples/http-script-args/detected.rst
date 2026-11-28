Run a script in the page
========================

.. test {"testId":"http-script-args","detectSteps":true}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Join ``foo`` and ``bar`` in the console. The result is ``foobar``.

.. step {"runBrowserScript":{"script":"return arguments[0] + arguments[1];","args":["foo","bar"],"output":"foobar"}}

.. test end
