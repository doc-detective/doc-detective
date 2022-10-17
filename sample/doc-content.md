# Search for kittens

To use Google Search to find information on kittens,

[comment]: # (test start {"id":"process-search-kittens", "file":"./tests.json"})

1.  Open [Google Search](https://www.google.com).
2.  In the search bar, enter "kittens", then press Enter.

Search results appear on the page.

![Search results for 'kittens'.](results.png)

[comment]: # (test end)

## Recommended results

[comment]: # (test start {"id":"text-match-lucky"})

To go directly to a recommended result for your search, use the **I'm Feeling Lucky** button.

[comment]: # (action {"action":"goTo", "uri":"www.google.com"})
[comment]: # (action {"action":"matchText", "css":"#gbqfbb", "text":"I'm Feeling Lucky"})
[comment]: # (test end)

[comment]: # (test start {"id":"process-lucky-shorthair"})

 If you're searching for american shorthair information,

1.  Open [Google Search](https://www.google.com).

    [comment]: # (action {"action":"goTo", "uri":"www.google.com"})

2.  In the search bar, enter "american shorthair cats".

    [comment]: # (action {"action":"type", "css":"[title=Search]", "keys":"american shorthair cats"})

3.  Click **I'm Feeling Lucky**.

    [comment]: # (action {"action":"click", "css":"#gbqfbb"})
    [comment]: # (test end)
