# Record a video

This sample test fills in every field on the Watson and Holmes intake form while recording a video of the changes. It runs with headless mode turned off so the browser window is visible for the recording.

It runs against a copy of the intake form served at `http://localhost:8080/watson_and_holmes_intake_form.html`. For how to serve the form locally, see the "Set up your test environment" guide at https://docs.doc-detective.com/docs/ci/set-up-environment.

{/* test {"testId":"form-filler3","detectSteps":false,"runOn":[{"platforms":["windows","mac","linux"],"browsers":{"name":"chrome","headless":false,"viewport":{"width":1180,"height":1480}}}]} */}

1. Open the intake form.

   {/* step {"description":"Go to the specified URL","goTo":"http://localhost:8080/watson_and_holmes_intake_form.html"} */}

2. Start recording.

   {/* step {"description":"Start recording.","record":"./output/form-filler3-recording.mp4"} */}

3. Enter the first name.

   {/* step {"description":"Type in the First Name","find":{"elementText":"First Name:","click":true,"type":"Alphie"}} */}

4. Enter the last name.

   {/* step {"description":"Type in the Last Name","find":{"elementText":"Last Name:","click":true,"type":"Betaux"}} */}

5. Enter the street address.

   {/* step {"description":"Type in the Street Address","find":{"elementText":"Street Address:","click":true,"type":"123 Broadberry Lane"}} */}

6. Enter the city.

   {/* step {"description":"Type in the City","find":{"elementText":"City:","click":true,"type":"London"}} */}

7. Enter the state or province.

   {/* step {"description":"Type in the State/Province","find":{"elementText":"State/Province:","click":true,"type":"Greater London"}} */}

8. Enter the postal code.

   {/* step {"description":"Type in the Postal Code","find":{"elementText":"Postal Code:","click":true,"type":"E1 6AN"}} */}

9. Enter the country.

   {/* step {"description":"Type in the Country","find":{"elementText":"Country:","click":true,"type":"United Kingdom"}} */}

10. Enter the email address.

    {/* step {"description":"Type in the Email Address","find":{"elementText":"Email Address:","click":true,"type":"alphie.betaux@worcestershire.com"}} */}

11. Enter the phone number.

    {/* step {"description":"Type in the Phone Number","find":{"elementText":"Phone Number:","click":true,"type":"020 7123 4567"}} */}

12. Select the type of case.

    {/* step {"description":"Select the Type of Case","find":{"elementText":"Type of Case:","click":true,"type":"Blackmail"}} */}

13. Enter the case description.

    {/* step {"description":"Type in the Case Description","find":{"elementText":"Brief Description of Case:","click":true,"type":"A mysterious case that needs solving."}} */}

14. Select the postal mail contact method.

    {/* step {"description":"Click the Postal Mail button","click":"Postal Mail"} */}

15. Enter the date of inquiry.

    {/* step {"description":"Type in the Date of Inquiry","find":{"elementText":"Date of Inquiry:","click":true,"type":"02/18/1901"}} */}

16. Stop recording.

    {/* step {"description":"Stop recording.","stopRecord":true} */}

{/* test end */}
