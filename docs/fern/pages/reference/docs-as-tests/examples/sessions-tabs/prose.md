# Compare pages in tabs, windows, and sessions

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
2. Click the Open child in new tab link. The child page opens in a new tab.
3. In the newest tab, check that the page reads "PAGE linked".
4. In a new tab named `report`, load [the report page](http://localhost:8092/multi-tab-child.html?page=report). Then load [the scratch page](http://localhost:8092/multi-tab-child.html?page=scratch) in another new tab.
5. Check that the `report` tab reads "PAGE report", and that the tab showing the scratch page reads "PAGE scratch".
6. In a new window named `settings`, with its first tab named `general`, load [the settings page](http://localhost:8092/multi-tab-child.html?page=settings). Then load [the help page](http://localhost:8092/multi-tab-child.html?page=help) in another new window.
7. Check that the `settings` window and its `general` tab read "PAGE settings", and that the newest window, titled "Child help", reads "PAGE help".
8. In the first window, check that the tab titled "Multi-tab home" still reads "MULTI-TAB HOME".
9. Type `hello` in the echo box of the help window, which is also the newest window, and of the child tab, the second tab opened.
10. Load [the notes page](http://localhost:8092/multi-tab-child.html?page=notes) in a new tab named `notes`, and [the about page](http://localhost:8092/multi-tab-child.html?page=about) in a new window named `about`. Check that each one reads its page name.
11. Start two more Firefox sessions: `reviewer`, with an 800 by 600 viewport, and `editor`, with a 1024 by 768 window. Load [the review page](http://localhost:8092/multi-tab-child.html?page=review) in `reviewer`.
12. In the first session, go back to [the multi-tab page](http://localhost:8092/multi-tab.html), and check that it reads "MULTI-TAB HOME".
13. Close the `report` and `notes` tabs, the scratch tab, the child tab, the help, `settings`, and `about` windows, and the `reviewer` and `editor` sessions.
