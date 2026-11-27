Stub an API response
====================

.. test {"testId":"http-mock-url-exact","detectSteps":false,"runOn":[{"platforms":["mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

Stub the plans endpoint.

.. step {"mockRequest":{"url":"http://localhost:8092/api/plans","response":{"body":{"plan":"pro"}}}}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Fetch ``/api/plans``. The response's plan is ``pro``.

.. step {"runBrowserScript":{"script":"return fetch('/api/plans').then((r) => r.json());","output":"pro"}}

.. test end
