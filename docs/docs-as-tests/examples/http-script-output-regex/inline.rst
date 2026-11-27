Run a script in the page
========================

.. test {"testId":"http-script-output-regex","detectSteps":false}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Evaluate ``window.location.href`` in the console. It starts with the test site's address.

.. step {"runBrowserScript":{"script":"return window.location.href;","output":"/^http:\\/\\/localhost:8092/"}}

.. test end
