<!-- test {"testId":"http-mock-body-string","detectSteps":false,"runOn":[{"platforms":["mac","linux"],"browsers":[{"name":"chrome","headless":true}]}]} -->

# Stub an API response

Stub the plans endpoint.

<!-- step {"mockRequest":{"url":"**/api/plans","response":{"body":"pro"}}} -->

Open the test site at `http://localhost:8092/`.

<!-- step {"goTo":"http://localhost:8092/"} -->

Fetch `/api/plans`. The response is the text `pro`.

<!-- step {"runBrowserScript":{"script":"return fetch('/api/plans').then((r) => r.text());","output":"pro"}} -->

<!-- test end -->
