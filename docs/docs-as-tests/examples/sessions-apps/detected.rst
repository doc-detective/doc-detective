Open a built-in app
===================

Windows: Character Map
----------------------

.. test {"testId":"sessions-apps-windows","detectSteps":true,"runOn":[{"platforms":"windows"}]}

#. Open Character Map, and wait for its Select button.

   .. step {"startSurface":{"app":"C:\\Windows\\System32\\charmap.exe","name":"charmap","timeout":120000,"waitUntil":{"find":{"elementText":"Select"}}}}

#. Click **Select**.

#. Check that the window shows the **Copy** button.

#. Check the Copy button again, picking the window by its title, by name, and as the newest window.

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap","window":{"title":"Character Map"}}}}

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap","window":"Character Map"}}}

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap","window":{"name":"Character Map"}}}}

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap","window":-1}}}

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap","window":{"index":-1}}}}

   .. step {"find":{"elementText":"Copy","surface":{"app":"charmap"}}}

#. Close Character Map.

   .. step {"closeSurface":{"app":"charmap"}}

.. test end

macOS: Calculator
-----------------

.. test {"testId":"sessions-apps-mac","detectSteps":true,"runOn":[{"platforms":"mac"}]}

#. Open Calculator with ``SESSIONS_DOCS=1`` in its environment, and wait for its ``1`` button.

   .. step {"startSurface":{"app":"/System/Applications/Calculator.app","name":"calculator","env":{"SESSIONS_DOCS":"1"},"timeout":180000,"waitUntil":{"find":{"elementAria":"1"}}}}

#. In the first window, press the ``1`` button.

   .. step {"click":{"elementAria":"1","surface":{"app":"calculator","window":{"index":0}}}}

#. Close Calculator.

   .. step {"closeSurface":"calculator"}

.. test end

Android: Settings
-----------------

.. test {"testId":"sessions-apps-android","detectSteps":true,"runOn":[{"platforms":"android"}]}

#. Open the Settings app, and wait for the Network & internet entry.

   .. step {"startSurface":{"app":"com.android.settings","name":"settings","timeout":180000,"waitUntil":{"find":{"elementText":"Network & internet"}}}}

#. Tap the Network & internet entry.

   .. step {"click":"Network & internet"}

#. Check that the screen shows **Internet**.

#. Close the Settings app.

   .. step {"closeSurface":{"app":"settings"}}

.. test end

Android: your own app
---------------------

.. test {"testId":"sessions-apps-android-install","detectSteps":true,"runOn":[{"platforms":"android","device":"sessions-pixel","requires":{"files":["build/sessions-demo.apk"]}}]}

#. Install ``build/sessions-demo.apk`` on a headless Android 14 phone emulator named ``sessions-pixel``, open its main activity, and wait for the Welcome screen.

   .. step {"startSurface":{"app":"com.example.sessionsdemo","name":"demo","install":"build/sessions-demo.apk","activity":".MainActivity","device":{"platform":"android","name":"sessions-pixel","deviceType":"phone","osVersion":"14","headless":true},"driverOptions":{"appium:newCommandTimeout":300},"timeout":300000,"waitUntil":{"find":{"elementText":"Welcome"}}}}

#. Close the app.

   .. step {"closeSurface":{"app":"demo"}}

.. test end

iOS: Settings
-------------

.. test {"testId":"sessions-apps-ios","detectSteps":true,"runOn":[{"platforms":"ios","device":{"platform":"ios","name":"sessions-iphone","deviceType":"phone","osVersion":"18.0","headless":true}}]}

#. On the iPhone simulator named ``sessions-iphone``, open the Settings app, and wait for the General entry.

   .. step {"startSurface":{"app":"com.apple.Preferences","name":"preferences","device":"sessions-iphone","timeout":180000,"waitUntil":{"find":{"elementText":"General"}}}}

#. Tap the General entry.

   .. step {"click":"General"}

#. Check that the screen shows **About**.

#. Close the Settings app.

   .. step {"closeSurface":{"app":"preferences"}}

.. test end
