Compare pages in tabs, windows, and sessions
============================================

#. Start at `the multi-tab page <http://localhost:8092/multi-tab.html>`__.

#. Click the Open child in new tab link. The child page opens in a new tab.

#. In the newest tab, check that the page reads "PAGE linked".

#. In a new tab named ``report``, load `the report page <http://localhost:8092/multi-tab-child.html?page=report>`__. Then load `the scratch page <http://localhost:8092/multi-tab-child.html?page=scratch>`__ in another new tab.

#. Check that the ``report`` tab reads "PAGE report", and that the tab showing the scratch page reads "PAGE scratch".

#. In a new window named ``settings``, with its first tab named ``general``, load `the settings page <http://localhost:8092/multi-tab-child.html?page=settings>`__. Then load `the help page <http://localhost:8092/multi-tab-child.html?page=help>`__ in another new window.

#. Check that the ``settings`` window and its ``general`` tab read "PAGE settings", and that the newest window, titled "Child help", reads "PAGE help".

#. In the first window, check that the tab titled "Multi-tab home" still reads "MULTI-TAB HOME".

#. Type ``hello`` in the echo box of the help window, which is also the newest window, and of the child tab, the second tab opened.

#. Load `the notes page <http://localhost:8092/multi-tab-child.html?page=notes>`__ in a new tab named ``notes``, and `the about page <http://localhost:8092/multi-tab-child.html?page=about>`__ in a new window named ``about``. Check that each one reads its page name.

#. Start two more Firefox sessions: ``reviewer``, with an 800 by 600 viewport, and ``editor``, with a 1024 by 768 window. Load `the review page <http://localhost:8092/multi-tab-child.html?page=review>`__ in ``reviewer``.

#. In the first session, go back to `the multi-tab page <http://localhost:8092/multi-tab.html>`__, and check that it reads "MULTI-TAB HOME".

#. Close the ``report`` and ``notes`` tabs, the scratch tab, the child tab, the help, ``settings``, and ``about`` windows, and the ``reviewer`` and ``editor`` sessions.
