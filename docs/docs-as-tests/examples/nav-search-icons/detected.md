<!-- test {"testId":"nav-search-icons","detectSteps":true} -->

# Search from the toolbar

1. Go to [the toolbar page](http://localhost:8092/find-image.html).
   <!-- step {"goTo":{"url":"http://localhost:8092/find-image.html","waitUntil":{"find":{"elementImage":{"base64":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxYTVmYjQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNSAzaDExbDUgNXYxMWEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTE3IDIxdi04SDd2OCIvPjxwYXRoIGQ9Ik03IDN2NWg4Ii8+PC9zdmc+Cg==","threshold":0.9}}}}} -->
2. Click the magnifying-glass icon next to the search box.
   <!-- step {"click":{"elementImage":{"path":"search.svg","color":"#444444"},"elementId":"search-icon"}} -->
3. Type "doc detective" and press Enter.
4. Check that the status bar shows **doc detective**.
5. Type "-docs" at the end of the search box.
6. Check that the status bar shows **doc detective-docs**.
7. Right-click the save icon and hold the button for half a second.
   <!-- step {"find":{"elementImage":"save.svg","click":{"button":"right","duration":500}}} -->
8. Check that the status bar records the right-click.

<!-- test end -->
