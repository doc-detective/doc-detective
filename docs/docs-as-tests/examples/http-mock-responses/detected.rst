Stub a job that changes state
=============================

.. test {"testId":"http-mock-responses","detectSteps":true,"runOn":[{"platforms":["mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]}

Stub the job endpoint with four responses, sent in order. The first is ``queued``, with status ``202`` and a ``retry-after`` header. The others are the list of finished stages, the ``running`` status, and the ``done`` status in ``job.json``.

.. step {"mockRequest":{"url":"**/api/jobs/1","responses":[{"statusCode":202,"headers":{"retry-after":"1"},"body":"queued"},{"statusCode":202,"body":["build"]},{"body":{"status":"running"}},{"bodyPath":"job.json"}]}}

Open the test site at ``http://localhost:8092/``.

.. step {"goTo":"http://localhost:8092/"}

Fetch ``/api/jobs/1`` five times. Each request gets the next response. The fifth request gets ``job.json`` again, because the last response answers every later request.

.. step {"runBrowserScript":{"script":"return (async () => { const out = []; for (const _ of [1, 2, 3, 4, 5]) { const r = await fetch('/api/jobs/1'); out.push(r.status + ' ' + (r.headers.get('retry-after') || '-') + ' ' + (await r.text()).trim()); } return out.join(', '); })();","output":"202 1 queued, 202 - [\"build\"], 200 - {\"status\":\"running\"}, 200 - {\"status\":\"done\"}, 200 - {\"status\":\"done\"}"}}

.. test end
