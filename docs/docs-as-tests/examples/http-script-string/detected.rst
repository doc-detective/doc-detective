Run a script in the page
========================

.. test {"testId":"http-script-string","detectSteps":true}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Evaluate ``document.title`` in the console.

.. step {"runBrowserScript":"return document.title;"}

.. test end
