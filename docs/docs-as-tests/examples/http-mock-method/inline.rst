Stub an API response
====================

.. test {"testId":"http-mock-method","detectSteps":false,"runOn":[{"platforms":["mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

Stub the plans endpoint.

.. step {"mockRequest":{"url":"**/api/plans","method":"POST","response":{"body":"mocked-post"}}}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Fetch ``/api/plans`` with ``GET`` and with ``POST``. Only the ``POST`` request is stubbed.

.. step {"runBrowserScript":{"script":"const u = '/api/plans'; return Promise.all([fetch(u).then((r) => r.text()), fetch(u, { method: 'POST' }).then((r) => r.text())]).then(([get, post]) => (get === 'mocked-post' ? 'GET was mocked' : 'GET passed') + ', POST ' + post);","output":"GET passed, POST mocked-post"}}

.. test end
