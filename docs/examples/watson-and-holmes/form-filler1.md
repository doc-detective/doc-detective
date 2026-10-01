# Fill in fields

This sample test fills in the first and last name fields on the Watson and Holmes intake form, then captures a screenshot.

It runs against a copy of the intake form served at `http://localhost:8080/watson_and_holmes_intake_form.html`. For how to serve the form locally, see the "Set up your test environment" guide at https://docs.doc-detective.com/docs/ci/set-up-environment.

{/* test {"testId":"form-filler1","detectSteps":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":false,"viewport":{"width":1180,"height":1480}}}]} */}

1. Open the intake form.

   {/* step {"description":"Go to the specified URL","goTo":"http://localhost:8080/watson_and_holmes_intake_form.html"} */}

2. Enter the first name.

   {/* step {"description":"Type in the First Name","find":{"elementText":"First Name:","click":true,"type":"Alphie"}} */}

3. Enter the last name.

   {/* step {"description":"Type in the Last Name","find":{"elementText":"Last Name:","click":true,"type":"Betaux"}} */}

4. Capture a screenshot of the completed fields.

   {/* step {"description":"Capture a screenshot of the completed form.","screenshot":"./output/form-filled-1-first-and-last-name.png"} */}

5. Pause long enough to show the changes.

   {/* step {"description":"Pause long enough to show the changes.","wait":10000} */}

{/* test end */}
