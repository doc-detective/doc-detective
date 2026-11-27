# Open a built-in app

## Windows: Character Map

<!-- test {"testId":"sessions-apps-windows","detectSteps":true,"runOn":[{"platforms":"windows"}]} -->

1. Open Character Map, and wait for its Select button.
   <!-- step {"startSurface":{"app":"C:\\Windows\\System32\\charmap.exe","name":"charmap","timeout":120000,"waitUntil":{"find":{"elementText":"Select"}}}} -->
2. Click **Select**.
3. Check that the window shows the **Copy** button.
4. Close Character Map.
   <!-- step {"closeSurface":{"app":"charmap"}} -->

<!-- test end -->

## macOS: Calculator

<!-- test {"testId":"sessions-apps-mac","detectSteps":true,"runOn":[{"platforms":"mac"}]} -->

1. Open Calculator, and wait for its `1` button.
   <!-- step {"startSurface":{"app":"/System/Applications/Calculator.app","name":"calculator","timeout":180000,"waitUntil":{"find":{"elementAria":"1"}}}} -->
2. Press the `1` button.
   <!-- step {"click":{"elementAria":"1"}} -->
3. Close Calculator.
   <!-- step {"closeSurface":"calculator"} -->

<!-- test end -->

## Android: Settings

<!-- test {"testId":"sessions-apps-android","detectSteps":true,"runOn":[{"platforms":"android"}]} -->

1. Open the Settings app, and wait for the Network & internet entry.
   <!-- step {"startSurface":{"app":"com.android.settings","name":"settings","timeout":180000,"waitUntil":{"find":{"elementText":"Network & internet"}}}} -->
2. Tap the Network & internet entry.
   <!-- step {"click":"Network & internet"} -->
3. Check that the screen shows **Internet**.
4. Close the Settings app.
   <!-- step {"closeSurface":{"app":"settings"}} -->

<!-- test end -->

## iOS: Settings

<!-- test {"testId":"sessions-apps-ios","detectSteps":true,"runOn":[{"platforms":"ios","device":{"name":"sessions-iphone","deviceType":"phone"}}]} -->

1. On an iPhone simulator named `sessions-iphone`, open the Settings app, and wait for the General entry.
   <!-- step {"startSurface":{"app":"com.apple.Preferences","name":"preferences","timeout":180000,"waitUntil":{"find":{"elementText":"General"}}}} -->
2. Tap the General entry.
   <!-- step {"click":"General"} -->
3. Check that the screen shows **About**.
4. Close the Settings app.
   <!-- step {"closeSurface":{"app":"preferences"}} -->

<!-- test end -->
