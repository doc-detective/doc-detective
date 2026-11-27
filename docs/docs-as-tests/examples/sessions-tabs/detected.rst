Compare pages in tabs, windows, and sessions
============================================

.. test {"testId":"sessions-tabs","detectSteps":true,"runOn":[{"browsers":{"name":"firefox","headless":true},"browserFallback":"off"}]}

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

   .. step {"goTo":"http://localhost:8092/multi-tab.html"}

#. Click the Open child in new tab link. The child page opens in a new tab.

   .. step {"click":"Open child in new tab"}

#. In the newest tab, check that the page reads "PAGE linked".

   .. step {"find":{"elementText":"PAGE linked","surface":{"browser":"firefox","tab":{"index":-1}}}}

#. In a new tab named ``report``, load `the report page <http://localhost:8092/multi-tab-child.html?page=report>`__. Then load `the scratch page <http://localhost:8092/multi-tab-child.html?page=scratch>`__ in another new tab.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=report","newTab":{"name":"report"}}}

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=scratch","newTab":true}}

#. Check that the ``report`` tab reads "PAGE report", and that the tab showing the scratch page reads "PAGE scratch".

   .. step {"find":{"elementText":"PAGE report","surface":{"browser":"firefox","tab":"report"}}}

   .. step {"find":{"elementText":"PAGE scratch","surface":{"browser":"firefox","tab":{"url":"http://localhost:8092/multi-tab-child.html?page=scratch"}}}}

#. In a new window named ``settings``, with its first tab named ``general``, load `the settings page <http://localhost:8092/multi-tab-child.html?page=settings>`__. Then load `the help page <http://localhost:8092/multi-tab-child.html?page=help>`__ in another new window.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=settings","newWindow":{"name":"settings","tab":"general"}}}

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=help","newWindow":true}}

#. Check that the ``settings`` window and its ``general`` tab read "PAGE settings", and that the newest window, titled "Child help", reads "PAGE help".

   .. step {"find":{"elementText":"PAGE settings","surface":{"browser":"firefox","window":"settings"}}}

   .. step {"find":{"elementText":"PAGE settings","surface":{"browser":"firefox","window":{"name":"settings"},"tab":{"name":"general"}}}}

   .. step {"find":{"elementText":"PAGE help","surface":{"browser":"firefox","window":-1}}}

   .. step {"find":{"elementText":"PAGE help","surface":{"browser":"firefox","window":{"title":"Child help"}}}}

   .. step {"find":{"elementText":"PAGE help","surface":{"browser":"firefox","window":{"url":"http://localhost:8092/multi-tab-child.html?page=help"}}}}

#. In the first window, check that the tab titled "Multi-tab home" still reads "MULTI-TAB HOME".

   .. step {"find":{"elementText":"MULTI-TAB HOME","surface":{"browser":"firefox","window":{"index":0},"tab":{"title":"Multi-tab home"}}}}

#. Type ``hello`` in the echo box of the help window, which is also the newest window, and of the child tab, the second tab opened.

   .. step {"type":{"keys":"hello","selector":"#echo-input","surface":{"browser":"firefox","window":{"url":"http://localhost:8092/multi-tab-child.html?page=help"}}}}

   .. step {"type":{"keys":"hello","selector":"#echo-input","surface":{"browser":"firefox","window":-1}}}

   .. step {"type":{"keys":" again","selector":"#echo-input","surface":{"browser":"firefox","window":{"index":-1}}}}

   .. step {"type":{"keys":"hello","selector":"#echo-input","surface":{"browser":"firefox","tab":1}}}

#. Load `the notes page <http://localhost:8092/multi-tab-child.html?page=notes>`__ in a new tab named ``notes``, and `the about page <http://localhost:8092/multi-tab-child.html?page=about>`__ in a new window named ``about``. Check that each one reads its page name.

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=notes","newTab":"notes"}}

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=about","newWindow":"about"}}

   .. step {"find":{"elementText":"PAGE notes","surface":{"browser":"firefox","tab":"notes"}}}

   .. step {"find":{"elementText":"PAGE about","surface":{"browser":"firefox","window":"about"}}}

#. Start two more Firefox sessions: ``reviewer``, with an 800 by 600 viewport, and ``editor``, with a 1024 by 768 window. Load `the review page <http://localhost:8092/multi-tab-child.html?page=review>`__ in ``reviewer``.

   .. step {"startSurface":[{"browser":"firefox","name":"reviewer","headless":true,"viewport":{"width":800,"height":600}},{"browser":"firefox","name":"editor","headless":true,"size":{"width":1024,"height":768}}]}

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab-child.html?page=review","surface":{"browser":"firefox","name":"reviewer"}}}

#. In the first session, go back to `the multi-tab page <http://localhost:8092/multi-tab.html>`__, and check that it reads "MULTI-TAB HOME".

   .. step {"goTo":{"url":"http://localhost:8092/multi-tab.html","surface":"firefox"}}

   .. step {"find":{"elementText":"MULTI-TAB HOME","surface":"firefox"}}

#. Close the ``report`` and ``notes`` tabs, the scratch tab, the child tab, the help, ``settings``, and ``about`` windows, and the ``reviewer`` and ``editor`` sessions.

   .. step {"closeSurface":[{"browser":"firefox","tab":{"name":"report"}},{"browser":"firefox","tab":{"url":"http://localhost:8092/multi-tab-child.html?page=scratch"}},{"browser":"firefox","tab":{"index":1}},{"browser":"firefox","window":{"title":"Child help"}},{"browser":"firefox","window":{"name":"settings"}},{"browser":"firefox","tab":"notes"},{"browser":"firefox","window":"about"},{"browser":"firefox","name":"reviewer"},"editor"]}

.. test end
