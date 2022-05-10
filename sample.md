# Search for kittens

To use Google Search to find informstion on kittens,

1.  Open [Google Search](https://www.google.com).

    [comment]: # (test {"action":"goTo", "uri":"www.google.com"})

2.  In the search bar, enter "kittens", then press Enter.

    [comment]: # (test {"action":"type", "css":"[title=Search]", "keys":"kittens", "trailingSpecialKey":"Enter"})
    [comment]: # (test {"action":"wait", "duration":"5000"})
    [comment]: # (test {"action":"screenshot", "filename":"results.png"})

Search results appear on the page.

![Search results for "kittens".](./results.png)

## Recommended results

To go directly to a recommended result for your search, use the **I'm Feeling Lucky** button. If you're searching for american shorthair information,

[comment]: # (test {"action":"goTo", "uri":"www.google.com"})
[comment]: # (test {"action":"matchText", "css":"#gbqfbb", "text":"I'm Feeling Lucky"})

1.  Open [Google Search](https://www.google.com).

    [comment]: # (test {"action":"goTo", "uri":"www.google.com"})

2.  In the search bar, enter "american shorthair cats".

    [comment]: # (test {"action":"type", "css":"[title=Search]", "keys":"american shorthair cats"})

3.  Click **I'm Feeling Lucky**.

    [comment]: # (test {"action":"click", "css":"#gbqfbb"})