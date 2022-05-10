# Search for kittens

To use Google Search to find informstion on kittens,

1.  Open [Google Search](https://www.google.com).

    // test {"action":"goTo", "uri":"www.google.com"}

2.  In the search bar, enter "kittens", then press Enter.

    // test {"action":"type", "css":"[title=Search]", "keys":"kittens", "trailingSpecialKey":"Enter"}
    // test {"action":"wait", "duration":"5000"}
    // test {"action":"screenshot", "filename":"results.png"}

Search results appear on the page.

![Search results for "kittens".](./results.png)

## Recommended results

To go directly to a recommended result for your search, use the **I'm Feeling Lucky** button. If you're searching for american shorthair information,

// test {"action":"goTo", "uri":"www.google.com"}
// test {"action":"matchText", "css":"#gbqfbb", "text":"I'm Feeling Lucky"}

1.  Open [Google Search](https://www.google.com).

    // test {"action":"goTo", "uri":"www.google.com"}

2.  In the search bar, enter "american shorthair cats".

    // test {"action":"type", "css":"[title=Search]", "keys":"american shorthair cats"}

3.  Click **I'm Feeling Lucky**.

    // test {"action":"click", "css":"#gbqfbb"}