Preview invoices against a stubbed API
======================================

.. test {"testId":"http-mock-request","detectSteps":true,"runOn":[{"platforms":["windows","mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

Stub the invoices endpoint so that every ``GET`` request returns the invoices in ``invoices.json``.

.. step {"mockRequest":{"url":"**/api/invoices*","method":"GET","response":{"statusCode":200,"headers":{"x-mock":"docs"},"bodyPath":"invoices.json"}}}

Stub invoice creation too, so that a ``POST`` request returns a new invoice ID.

.. step {"mockRequest":{"url":"http://localhost:8092/api/invoices","method":"POST","response":{"statusCode":201,"body":{"id":"inv-2"}}}}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

In the browser console, fetch ``/api/invoices?page=1``. The response lists invoice ``inv-1``.

.. step {"runBrowserScript":{"script":"return fetch(arguments[0]).then(async (r) => r.headers.get('x-mock') + ' ' + JSON.stringify(await r.json()));","args":["/api/invoices?page=1"],"output":"/^docs .*inv-1/","timeout":10000}}

Send a ``POST`` request to ``/api/invoices``. The response status is ``201``.

.. step {"runBrowserScript":{"script":"return fetch('/api/invoices', { method: 'POST' }).then((r) => r.status);","output":"201"}}

Check the page title by evaluating ``document.title`` in the console.

.. step {"runBrowserScript":"return document.title;"}

.. test end
