<!-- test {"testId":"data-loadvariables-step","detectSteps":false} -->

# Check a service from an environment file

1. Load the variables in `service.env`.
   <!-- step {"loadVariables":"service.env"} -->
2. Check the service. Send a `GET` request to `$SERVICE_URL/health`.
   <!-- step {"httpRequest":{"url":"$SERVICE_URL/health","method":"get"}} -->

<!-- test end -->
