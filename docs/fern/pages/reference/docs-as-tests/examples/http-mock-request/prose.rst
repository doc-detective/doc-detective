Preview invoices against a stubbed API
======================================

Stub the invoices endpoint so that every ``GET`` request returns the invoices in ``invoices.json``.

Stub invoice creation too, so that a ``POST`` request returns a new invoice ID.

Open the test site at ``http://localhost:8092/``.

In the browser console, fetch ``/api/invoices?page=1``. The response lists invoice ``inv-1``.

Send a ``POST`` request to ``/api/invoices``. The response status is ``201``.

Check the page title by evaluating ``document.title`` in the console.
