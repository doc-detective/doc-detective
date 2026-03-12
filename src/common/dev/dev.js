import { detectTests } from "../dist/index.cjs";

const text = `To search for American Shorthair kittens,

1. Go to [DuckDuckGo](https://www.duckduckgo.com).
2. In the search bar, enter "American Shorthair kittens", then press Enter.

<!-- step wait: 10000 -->

!["Search results for kittens"](search-results.png){ .screenshot }`;
console.log(JSON.stringify(await detectTests({content: text}), null, 2));
