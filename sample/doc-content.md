# Search for kittens

To use Google Search to find information on kittens,

[comment]: # (test start {"id":"process-search-kittens" })

1.  Open [Google Search](https://www.google.com).

    [comment]: # (action {"action":"startRecording", "overwrite":false, "filename":"results.gif", "fps":15})
    [comment]: # (action {"action":"goTo", "uri":"www.google.com"})

2.  In the search bar, enter "kittens", then press Enter.

    [comment]: # (action {"action":"moveMouse", "css":"#gbqfbb", "alignH": "center", "alignV": "center"})
    [comment]: # (action {"action":"wait", "duration":"5000"})
    [comment]: # (action {"action":"moveMouse", "css":"[title=Search]", "alignV": "center"})
    [comment]: # (action {"action":"type", "css":"[title=Search]", "keys":"kittens", "trailingSpecialKey":"Enter"})
    [comment]: # (action {"action":"wait", "duration":"5000"})
    [comment]: # (action {"action":"scroll", "y": 300})
    [comment]: # (action {"action":"stopRecording"})
    [comment]: # (action {"action":"screenshot", "filename":"results.png", "matchPrevious": true, "matchThreshold": 0.1})

[comment]: # (test end {"id":"process-search-kittens" })

Search results appear on the page.

![Search results for 'kittens'.](results.png)

## Recommended results

To go directly to a recommended result for your search, use the **I'm Feeling Lucky** button. If you're searching for american shorthair information,

[comment]: # (action {"testId":"text-match-lucky", "action":"goTo", "uri":"www.google.com"})
[comment]: # (action {"testId":"text-match-lucky", "action":"matchText", "css":"#gbqfbb", "text":"I'm Feeling Lucky"})

1.  Open [Google Search](https://www.google.com).

    [comment]: # (action {"testId":"process-lucky-shorthair", "action":"goTo", "uri":"www.google.com"})

2.  In the search bar, enter "american shorthair cats".

    [comment]: # (action {"testId":"process-lucky-shorthair", "action":"type", "css":"[title=Search]", "keys":"american shorthair cats"})

3.  Click **I'm Feeling Lucky**.

    [comment]: # (action {"testId":"process-lucky-shorthair", "action":"click", "css":"#gbqfbb"})