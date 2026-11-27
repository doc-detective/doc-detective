# Compare pages in tabs, windows, and sessions

1. Start at [the multi-tab page](http://localhost:8092/multi-tab.html).
2. Click the Open child in new tab link. The child page opens in a new tab.
3. In the newest tab, check that the page reads "PAGE linked".
4. In a new tab named `report`, load [the report page](http://localhost:8092/multi-tab-child.html?page=report).
5. In a new window named `settings`, load [the settings page](http://localhost:8092/multi-tab-child.html?page=settings).
6. Start a second Firefox session named `reviewer`, with an 800 by 600 viewport, and load [the review page](http://localhost:8092/multi-tab-child.html?page=review) in it.
7. In the first tab of the first session, check that the page still reads "MULTI-TAB HOME".
8. Close the child tab, the `report` tab, the `settings` window, and the `reviewer` session.
