Stub a job that changes state
=============================

Stub the job endpoint with four responses, sent in order. The first is ``queued``, with status ``202`` and a ``retry-after`` header. The others are the list of finished stages, the ``running`` status, and the ``done`` status in ``job.json``.

Open the test site at ``http://localhost:8092/``.

Fetch ``/api/jobs/1`` five times. Each request gets the next response. The fifth request gets ``job.json`` again, because the last response answers every later request.
