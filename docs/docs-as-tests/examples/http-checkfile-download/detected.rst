Download a report
=================

.. test {"testId":"http-checkfile-download","detectSteps":true,"runOn":[{"platforms":["windows","mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

In Chrome, open ``http://localhost:8092/download.html``.

.. step {"goTo":"http://localhost:8092/download.html"}

Click the first export link.

.. step {"click":"Export first CSV"}

Check that Chrome saved a ``report-*.csv`` file.

.. step {"checkFile":{"download":"report-*.csv"}}

.. test end
