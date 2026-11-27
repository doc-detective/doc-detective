Stub an API response
====================

.. test {"testId":"http-mock-bodypath","detectSteps":false,"runOn":[{"platforms":["mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

Stub the plans endpoint.

.. step {"mockRequest":{"url":"**/api/plans","response":{"bodyPath":"plans.json"}}}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Fetch ``/api/plans``. The response is the list in ``plans.json``.

.. step {"runBrowserScript":{"script":"return fetch('/api/plans').then((r) => r.json());","output":"pro"}}

.. test end
